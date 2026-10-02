"""Run with: python3 tests/browser/benchmark-history.py (requires Playwright)."""
import json
import os
from pathlib import Path
import socket
import subprocess
import unittest
from urllib.request import urlopen
import time

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]


class BenchmarkHistoryTest(unittest.TestCase):
    def test_history_journey(self):
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        server = subprocess.Popen(
            ["bun", "src/ui/server.ts"], cwd=ROOT,
            env={**os.environ, "PORT": str(port)},
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        try:
            base = f"http://127.0.0.1:{port}"
            for _ in range(100):
                try:
                    urlopen(base, timeout=1).close()
                    break
                except OSError:
                    time.sleep(0.1)
            else:
                self.fail("Test server did not start")

            challenge = json.loads((ROOT / "tests/fixtures/challenges/mate-in-1-001.json").read_text())
            run = {
                "id": "run-1", "challengeId": challenge["id"], "agentId": "jev",
                "model": "test-model", "startedAt": "2026-10-01T12:00:00Z",
                "status": "solved", "failReason": None, "solverMoveCount": 1,
                "elapsedMs": 10,
                "moves": [{"ply": 1, "side": "white", "source": "solver", "uci": "h5f7",
                           "san": "Qxf7#", "resultingFen": challenge["fen"], "atMs": 10}],
            }
            report = {
                "suiteId": "browser-suite", "ranAt": "2026-10-01T12:00:00Z",
                "challengeIds": [challenge["id"]], "agentIds": ["jev"], "runs": [run],
                "scores": [{"agentId": "jev", "model": "test-model", "solved": 1,
                            "total": 1, "score": 1, "totalSolverMoves": 1, "totalElapsedMs": 10}],
            }
            done = False
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                page = browser.new_page()
                errors = []
                requested = []
                captured = {}
                page.on("pageerror", lambda error: errors.append(str(error)))
                page.on("request", lambda request: requested.append(request.url))

                def api(route):
                    path = route.request.url.split("/api/")[1]
                    if path == "agents":
                        body = [{"id": "jev", "provider": "jev", "model": "test-model",
                                 "available": True, "reason": None}]
                    elif path == "challenges":
                        body = [challenge]
                    elif path.startswith("challenges/"):
                        body = challenge
                    elif path == "benchmarks":
                        captured["body"] = route.request.post_data
                        body = {"id": "browser-suite"}
                    else:
                        body = {"status": "done" if done else "running", "completedRuns": int(done),
                                "totalRuns": 1, "report": report if done else None, "error": None}
                    route.fulfill(status=200, content_type="application/json", body=json.dumps(body))

                page.route("**/api/**", api)
                page.goto(base)
                page.wait_for_load_state("networkidle")
                page.get_by_role("button", name="Benchmark", exact=True).click()
                expect(page.get_by_role("button", name="Run benchmark", exact=True)).to_be_enabled()
                # The candidate cap toggle must reach the benchmark request.
                page.get_by_role("checkbox", name="Limit move choices").check()
                page.get_by_role("button", name="Run benchmark", exact=True).click()
                expect(page.get_by_role("status")).to_contain_text("Progress")
                self.assertEqual(json.loads(captured["body"])["choiceLimit"], 20)
                # Challenge ids must be interpolated as ids, never as serialized objects.
                self.assertFalse(
                    [url for url in requested if "/api/challenges/" in url and "object" in url.lower()],
                    "benchmark requested a challenge by serialized object",
                )
                page.get_by_role("button", name="Play", exact=True).click()
                done = True
                page.reload()
                page.get_by_role("button", name="Benchmark", exact=True).click()
                expect(page.get_by_role("button", name="View results", exact=True)).to_be_visible()
                page.get_by_role("button", name="Results", exact=False).first.click()
                expect(page.get_by_role("button", name="Open results")).to_be_visible()
                stored = page.evaluate("JSON.parse(localStorage.getItem('chessbench.benchmarks.v1'))")
                self.assertEqual(stored["results"][0]["report"], report)
                self.assertIsNone(stored["pending"])

                # Navigation and refresh preserve completed history without a job re-fetch.
                page.get_by_role("button", name="Play", exact=True).click()
                page.get_by_role("button", name="Benchmark", exact=True).click()
                page.reload()
                page.get_by_role("button", name="Benchmark", exact=True).click()
                page.get_by_role("button", name="Results", exact=False).first.click()
                page.get_by_role("button", name="Open results").click()
                page.get_by_role("button", name="Replay", exact=True).click()
                expect(page.get_by_role("heading", name="Replay —", exact=False)).to_be_visible()
                page.get_by_role("button", name="|◀", exact=True).click()
                expect(page.locator("cg-board piece")).to_have_count(32)
                page.get_by_role("button", name="Close", exact=True).click()

                page.on("dialog", lambda dialog: dialog.accept())
                page.get_by_role("button", name="Delete", exact=True).click()
                expect(page.get_by_text("No saved benchmarks yet.", exact=False)).to_be_visible()
                page.reload()
                page.get_by_role("button", name="Benchmark", exact=True).click()
                page.get_by_role("button", name="Results", exact=False).first.click()
                expect(page.get_by_text("No saved benchmarks yet.", exact=False)).to_be_visible()

                # A full/blocked store must not discard the visible result silently.
                page.evaluate("() => { Storage.prototype.setItem = () => { throw new Error('quota exceeded'); }; }")
                page.get_by_role("button", name="Set up", exact=True).click()
                page.get_by_role("button", name="Run benchmark", exact=True).click()
                expect(page.get_by_role("alert")).to_contain_text("quota exceeded")
                page.get_by_role("button", name="Results", exact=False).first.click()
                expect(page.get_by_role("button", name="Open results")).to_be_visible()
                # Watch a saved multi-challenge suite without making provider calls.
                page.reload()
                second = json.loads((ROOT / "tests/fixtures/challenges/mate-in-1-002.json").read_text())
                second_run = {**run, "id": "run-2", "challengeId": second["id"], "moves": []}
                watch_report = {**report, "challengeIds": [challenge["id"], second["id"]], "runs": [run, second_run]}
                page.evaluate("value => localStorage.setItem('chessbench.benchmarks.v1', JSON.stringify(value))", {
                    "version": 1, "results": [{"report": watch_report, "challenges": [challenge, second]}], "pending": None,
                })
                page.get_by_role("button", name="Benchmark", exact=True).click()
                page.get_by_role("button", name="Results", exact=False).first.click()
                page.get_by_role("button", name="Watch playback", exact=True).click()
                page.get_by_role("button", name="Pause viewing", exact=True).click()
                expect(page.get_by_role("heading", name=challenge["title"], exact=True)).to_be_visible()
                page.wait_for_timeout(1000)
                expect(page.get_by_role("heading", name=challenge["title"], exact=True)).to_be_visible()
                page.get_by_label("Speed").select_option("4")
                page.get_by_role("button", name="Resume viewing", exact=True).click()
                expect(page.get_by_role("heading", name=second["title"], exact=True)).to_be_visible(timeout=5000)
                page.get_by_role("button", name="Catch up", exact=True).click()
                expect(page.get_by_text("Playback complete.", exact=True)).to_be_visible()

                # Persistent navigation works inside a puzzle, keeping its position.
                page.get_by_role("button", name="Play", exact=True).click()
                page.get_by_role("button", name=challenge["title"], exact=False).click()
                page.get_by_role("button", name="Benchmark", exact=True).click()
                page.get_by_role("button", name="Play", exact=True).click()
                expect(page.get_by_role("heading", name=challenge["title"], exact=True)).to_be_visible()

                # Reset challenge restarts the same puzzle from a fresh run.
                page.get_by_role("button", name="Reset challenge", exact=True).click()
                expect(page.get_by_role("heading", name=challenge["title"], exact=True)).to_be_visible()
                expect(page.get_by_text("No moves yet.", exact=True)).to_be_visible()
                expect(page.get_by_text("used 0/1", exact=False)).to_be_visible()

                # Batched desktop/mobile geometry checks: no horizontal overflow or clipped boards.
                for width in [1280, 390]:
                    page.set_viewport_size({"width": width, "height": 900})
                    page.wait_for_timeout(250)
                    for surface in ["play", "setup", "watch", "results"]:
                        if surface != "play":
                            page.get_by_role("button", name="Benchmark", exact=True).click()
                            if surface == "setup":
                                page.get_by_role("button", name="Set up", exact=True).click()
                            elif surface == "results":
                                page.get_by_role("button", name="Results", exact=False).first.click()
                            else:
                                page.get_by_role("button", name="Results", exact=False).first.click()
                                page.get_by_role("button", name="Watch playback", exact=True).click()
                        overflow = page.evaluate("document.documentElement.scrollWidth > innerWidth")
                        if overflow:
                            print(page.evaluate("Array.from(document.querySelectorAll('body *')).filter(el => el.getBoundingClientRect().right > innerWidth + 1).map(el => [el.tagName, el.className, el.getBoundingClientRect().right]).slice(0, 20)"))
                        self.assertFalse(overflow, f"Horizontal overflow: {surface} at {width}px")
                        boards = page.locator(".cg-wrap")
                        if boards.count():
                            box = boards.first.bounding_box()
                            self.assertGreater(box["width"], 250)
                            self.assertLessEqual(box["x"] + box["width"], width)
                            self.assertAlmostEqual(box["width"], box["height"], delta=1)
                    page.get_by_role("button", name="Play", exact=True).click()
                # Real 100-position library: filters and benchmark group selection.
                page.unroute("**/api/**", api)
                page.reload()
                page.get_by_label("Mate depth").select_option("1")
                page.get_by_label("Difficulty").select_option("easy")
                expect(page.locator(".selector li")).to_have_count(12)
                page.get_by_label("Mate depth").select_option("3")
                page.get_by_label("Difficulty").select_option("hard")
                expect(page.locator(".selector li")).to_have_count(12)
                page.get_by_role("button", name="Benchmark", exact=True).click()
                # Filters directly define the run set: no extra confirmation click needed.
                page.get_by_label("Mate depth").select_option("2")
                page.get_by_label("Difficulty").select_option("hard")
                expect(page.locator(".challenge-checklist li")).to_have_count(10)
                expect(page.locator(".setup-footer")).to_contain_text("10 challenges")
                # Unchecking a challenge within the filter narrows the subset further.
                page.locator(".challenge-checklist input[type=checkbox]").first.uncheck()
                expect(page.locator(".setup-footer")).to_contain_text("9 challenges")
                page.locator(".challenge-checklist input[type=checkbox]").first.check()
                expect(page.locator(".setup-footer")).to_contain_text("10 challenges")
                self.assertFalse(page.evaluate("document.documentElement.scrollWidth > innerWidth"))
                self.assertEqual(errors, [])
                browser.close()
        finally:
            server.terminate()
            server.wait(timeout=10)


if __name__ == "__main__":
    unittest.main()
