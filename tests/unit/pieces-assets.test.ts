import { describe, expect, test } from "bun:test";

const CSS_PATH = new URL("../../src/ui/chessboard.css", import.meta.url);
const ROLES = ["pawn", "knight", "bishop", "rook", "queen", "king"];
const COLORS = ["white", "black"];

describe("piece assets (US2)", () => {
  test("stylesheet paints all 12 piece types from local sources only", async () => {
    const css = await Bun.file(CSS_PATH).text();
    for (const color of COLORS) {
      for (const role of ROLES) {
        expect(
          css.includes(`piece.${color}.${role}`),
          `missing paint rule for ${color} ${role}`,
        ).toBe(true);
      }
    }
    expect(css).not.toMatch(/url\(\s*["']?https?:/);
    expect(css).not.toMatch(/content:\s*"♔|♕|♖|♗|♘|♙|♚|♛|♜|♝|♞|♟/);
  });

  test("all 12 SVG asset files exist and are valid squares", async () => {
    for (const color of COLORS) {
      for (const role of ROLES) {
        const path = new URL(
          `../../src/ui/assets/pieces/${color}-${role}.svg`,
          import.meta.url,
        );
        const svg = await Bun.file(path).text();
        expect(svg.length, `${color}-${role}.svg empty`).toBeGreaterThan(0);
        expect(svg).toContain("<svg");
        expect(svg).toContain("viewBox");
      }
    }
  });
});
