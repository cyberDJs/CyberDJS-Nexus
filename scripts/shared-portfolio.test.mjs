import assert from "node:assert/strict";
import test from "node:test";

import { normalizeGitRemote } from "../src/lib/local-projects.ts";
import { buildSharedPortfolio, matchesPortfolioScope } from "../src/lib/shared-portfolio.ts";

function localProject(overrides = {}) {
  return {
    name: "CyberCore", path: "/Users/eimyna/0_DEV/CyberCore", branch: "main", head: "aaaaaaa",
    state: "Clean", dirtyFiles: 0, lastCommitAt: "2026-09-21T10:00:00.000Z", lastSubject: "x",
    category: "Web / Node", activityDays: 0, signal: 85, hasReadme: true, hasGovernance: true,
    hasTests: true, authority: "PROJECT_STATE.md", repositoryId: "github.com/cyberdjs/cybercore", ...overrides,
  };
}

function remoteProject(overrides = {}) {
  const { path, lastSubject, hasReadme, ...portable } = localProject({ path: undefined, lastSubject: undefined, hasReadme: undefined, ...overrides });
  void path; void lastSubject; void hasReadme;
  return portable;
}

function localSnapshot(projects) {
  return { root: "/Users/eimyna/0_DEV", generatedAt: "2026-09-21T12:00:00.000Z", projects };
}

function johnySource(projects) {
  return [{ key: "eimy", label: "Eimy", status: "missing", cachedAt: null, snapshot: null, message: "Not synced" }, {
    key: "johny", label: "Johny", status: "ready", cachedAt: "2026-09-21T12:01:00.000Z",
    snapshot: { schemaVersion: 1, source: "local-git", owner: "Johny", device: "JohnyBook", generatedAt: "2026-09-21T12:00:00.000Z", projectCount: projects.length, projects },
    message: `${projects.length} projects from JohnyBook`,
  }];
}

test("normalizes HTTPS and SSH GitHub origins to one credential-free identity", () => {
  assert.equal(normalizeGitRemote("https://github.com/cyberDJs/CyberCore.git"), "github.com/cyberdjs/cybercore");
  assert.equal(normalizeGitRemote("git@github.com:cyberDJs/CyberCore.git"), "github.com/cyberdjs/cybercore");
  assert.equal(normalizeGitRemote("https://token@example.com/org/repo.git?x=1"), "example.com/org/repo");
  assert.equal(normalizeGitRemote("/Users/person/repo"), null);
});

test("deduplicates Eimy and Johny by repository identity and exposes drift", () => {
  const shared = buildSharedPortfolio(
    localSnapshot([localProject()]),
    johnySource([remoteProject({ head: "bbbbbbb", state: "Changes", dirtyFiles: 2 })]),
  );
  assert.equal(shared.length, 1);
  assert.equal(shared[0].isShared, true);
  assert.equal(shared[0].drift, "head-and-working-tree");
  assert.equal(shared[0].eimy?.source, "local");
  assert.equal(shared[0].johny?.source, "remote");
  assert.equal(matchesPortfolioScope(shared[0], "Shared"), true);
});

test("does not merge same-name projects when no Git identity is available", () => {
  const shared = buildSharedPortfolio(
    localSnapshot([localProject({ name: "Alpha", repositoryId: null })]),
    johnySource([remoteProject({ name: "Alpha", repositoryId: null })]),
  );
  assert.equal(shared.length, 2);
  assert.equal(shared.some((project) => project.isShared), false);
});
