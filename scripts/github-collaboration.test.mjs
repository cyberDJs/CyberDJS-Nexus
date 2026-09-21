import assert from "node:assert/strict";
import test from "node:test";
import { loadGitHubCollaboration } from "../src/lib/github-collaboration.ts";

function project() { return { key: "repo:github.com/cyberdjs/nexus", name: "Nexus", repositoryId: "github.com/cyberdjs/nexus", repositoryNamespace: "cyberdjs", eimy: null, johny: null, isShared: true, drift: "aligned" }; }

test("loads read-only GitHub collaboration metadata without requiring a token", async () => {
  const now = Date.parse("2026-09-21T12:00:00.000Z");
  const fetcher = async (input) => {
    const url = String(input);
    if (url.endsWith("/repos/cyberdjs/nexus")) return new Response(JSON.stringify({ default_branch: "main", pushed_at: "2026-09-21T11:00:00Z", archived: false }), { status: 200 });
    if (url.includes("/pulls?")) return new Response(JSON.stringify([
      { state: "open", requested_reviewers: [{ login: "reviewer" }], requested_teams: [], merged_at: null },
      { state: "closed", requested_reviewers: [], requested_teams: [], merged_at: "2026-09-21T09:00:00Z" },
    ]), { status: 200 });
    if (url.includes("/actions/runs?")) return new Response(JSON.stringify({ workflow_runs: [{ status: "completed", conclusion: "success", updated_at: "2026-09-21T11:30:00Z" }] }), { status: 200 });
    return new Response(null, { status: 404 });
  };
  const result = await loadGitHubCollaboration([project()], { fetcher, maxRepos: 1, now, disabled: false });
  assert.equal(result.status, "ready");
  assert.equal(result.authenticated, false);
  assert.equal(result.repos[0].openPrs, 1);
  assert.equal(result.repos[0].mergedToday, 1);
  assert.equal(result.repos[0].reviewRequests, 1);
  assert.equal(result.repos[0].ci, "success");
});

test("degrades safely when GitHub is unavailable", async () => {
  const fetcher = async () => new Response(null, { status: 403 });
  const result = await loadGitHubCollaboration([{ ...project(), repositoryId: "github.com/cyberdjs/offline", key: "repo:offline" }], { fetcher, maxRepos: 1, now: Date.now(), disabled: false });
  assert.equal(result.status, "unavailable");
  assert.equal(result.repos[0].status, "unavailable");
  assert.equal(result.repos[0].openPrs, null);
});
