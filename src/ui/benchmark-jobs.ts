import { ChallengeRun, SuiteResult } from "../engine/types.ts";

export type JobStatus = "queued" | "running" | "done" | "error";

export interface BenchmarkJob {
  id: string;
  status: JobStatus;
  challengeIds: string[];
  agentKinds: string[];
  completedRuns: number;
  totalRuns: number;
  /** Latest snapshot of each started run, in execution order. */
  runs: ChallengeRun[];
  report: SuiteResult | null;
  error: string | null;
}

/** In-memory benchmark job store (single server process, no persistence). */
export class BenchmarkJobStore {
  private readonly jobs = new Map<string, BenchmarkJob>();
  private counter = 0;

  create(challengeIds: string[], agentKinds: string[]): BenchmarkJob {
    const job: BenchmarkJob = {
      id: `job-${Date.now()}-${(this.counter += 1)}`,
      status: "queued",
      challengeIds: [...challengeIds],
      agentKinds: [...agentKinds],
      completedRuns: 0,
      totalRuns: challengeIds.length * agentKinds.length,
      runs: [],
      report: null,
      error: null,
    };
    this.jobs.set(job.id, job);
    return job;
  }

  get(id: string): BenchmarkJob | undefined {
    return this.jobs.get(id);
  }

  markRunning(id: string): void {
    const job = this.jobs.get(id);
    if (job && job.status === "queued") job.status = "running";
  }

  markProgress(id: string, completedRuns: number): void {
    const job = this.jobs.get(id);
    if (job && job.status === "running") job.completedRuns = completedRuns;
  }

  updateRun(id: string, run: ChallengeRun): void {
    const job = this.jobs.get(id);
    if (!job || job.status !== "running") return;
    const index = job.runs.findIndex((entry) => entry.id === run.id);
    if (index === -1) job.runs.push(run);
    else job.runs[index] = run;
  }

  complete(id: string, report: SuiteResult): void {
    const job = this.jobs.get(id);
    if (!job) return;
    job.status = "done";
    job.completedRuns = job.totalRuns;
    job.report = report;
    job.runs = report.runs;
  }

  fail(id: string, error: string): void {
    const job = this.jobs.get(id);
    if (!job) return;
    job.status = "error";
    job.error = error;
  }
}
