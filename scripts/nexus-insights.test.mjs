import assert from "node:assert/strict";
import test from "node:test";
import { buildNexusInsights } from "../src/lib/nexus-insights.ts";

const now = Date.parse("2026-09-21T12:00:00.000Z");
const event = (at, kind, head = "aaa1111", count = null) => ({ at, kind, head, from: kind === "branch-switch" ? "main" : null, to: kind === "branch-switch" ? "feature/x" : null, count });
const side = (owner, overrides = {}) => ({ owner, source: owner === "Eimy" ? "local" : "remote", branch: "main", head: owner === "Eimy" ? "aaa1111" : "bbb2222", state: "Clean", dirtyFiles: 0, lastCommitAt: "2026-09-21T10:00:00.000Z", category: "Web / Node", activityDays: 0, signal: 90, hasGovernance: true, hasTests: true, authority: "PROJECT_STATE.md", dayStartHead: "0000000", commitsToday: 1, changedFilesToday: 3, insertionsToday: 20, deletionsToday: 4, ahead: owner === "Eimy" ? 1 : 0, behind: owner === "Johny" ? 1 : 0, upstream: "origin/main", fetchAgeMinutes: 5, events: [event(owner === "Eimy" ? "2026-09-21T10:00:00.000Z" : "2026-09-21T10:05:00.000Z", "commit")], ...overrides });
const projects = [{ key: "repo:github.com/cyberdjs/core", name: "Core", repositoryId: "github.com/cyberdjs/core", repositoryNamespace: "cyberdjs", eimy: side("Eimy", { state: "Changes", dirtyFiles: 2 }), johny: side("Johny"), isShared: true, drift: "head-and-working-tree" }];
const local = { root: "/Users/eimyna/0_DEV", generatedAt: "2026-09-21T11:59:00.000Z", localDate: "2026-09-21", projects: [] };
const remote = [{ key: "eimy", label: "Eimy", status: "ready", cachedAt: "2026-09-21T08:00:00.000Z", snapshot: { schemaVersion: 1, source: "local-git", owner: "Eimy", device: "Stale-Eimy-Cache", generatedAt: "2026-09-21T08:00:00.000Z", localDate: "2026-09-21", projectCount: 0, projects: [] }, message: "stale local persona cache" }, { key: "johny", label: "Johny", status: "ready", cachedAt: "2026-09-21T11:58:00.000Z", snapshot: { schemaVersion: 1, source: "local-git", owner: "Johny", device: "MacBook-Pro-2", generatedAt: "2026-09-21T11:58:00.000Z", localDate: "2026-09-21", projectCount: 0, projects: [] }, message: "0 projects" }];
const history = [
  { owner: "Eimy", device: "VoodooBook", generatedAt: "2026-09-21T11:50:00.000Z", localDate: "2026-09-21", projects: [{ name: "Core", repositoryId: "github.com/cyberdjs/core", branch: "main", head: "aaa1111", state: "Changes", dirtyFiles: 2, commitsToday: 2, changedFilesToday: 4, insertionsToday: 10, deletionsToday: 2, ahead: 1, behind: 0, lastCommitAt: "2026-09-21T10:00:00.000Z" }] },
  { owner: "Johny", device: "MacBook-Pro-2", generatedAt: "2026-09-21T11:45:00.000Z", localDate: "2026-09-21", projects: [{ name: "Core", repositoryId: "github.com/cyberdjs/core", branch: "main", head: "bbb2222", state: "Clean", dirtyFiles: 0, commitsToday: 1, changedFilesToday: 3, insertionsToday: 8, deletionsToday: 1, ahead: 0, behind: 1, lastCommitAt: "2026-09-21T10:05:00.000Z" }] },
];
const github = { status: "ready", fetchedAt: "2026-09-21T12:00:00.000Z", authenticated: false, message: "1 repository refreshed", repos: [{ repositoryId: "github.com/cyberdjs/core", projectName: "Core", defaultBranch: "main", pushedAt: "2026-09-21T11:00:00Z", archived: false, openPrs: 1, mergedToday: 0, reviewRequests: 1, ci: "success", ciAt: "2026-09-21T11:30:00Z", status: "ready" }] };

test("builds all ten persona-symmetric collaboration assets", () => {
  const result = buildNexusInsights(projects, local, remote, history, github, now);
  assert.deepEqual(new Set(result.activityFeed.map(x => x.owner)), new Set(["Eimy", "Johny"]));
  assert.equal(result.morningDelta.filter(x => x.changed).length, 2);
  assert.equal(result.collisions[0].severity, "high");
  assert.equal(result.handoffs[0].status, "coordinate");
  assert.equal(result.pulse.find(x => x.owner === "Eimy").commits, 1);
  assert.equal(result.pulse.find(x => x.owner === "Johny").commits, 1);
  assert.equal(result.freshness.find(x => x.owner === "Eimy").state, "fresh");
  assert.equal(result.freshness.find(x => x.owner === "Eimy").source, "local");
  assert.equal(result.freshness.find(x => x.owner === "Johny").source, "cache");
  assert.equal(result.sync[0].status, "attention");
  assert.equal(result.changeVolume.length, 2);
  assert.equal(result.heatmap.at(-1).Eimy, 2);
  assert.equal(result.heatmap.at(-1).Johny, 1);
  assert.equal(result.github.repos[0].openPrs, 1);
});
