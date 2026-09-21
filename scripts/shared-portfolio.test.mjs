import assert from "node:assert/strict";
import test from "node:test";

import { normalizeGitRemote } from "../src/lib/local-projects.ts";
import { buildSharedPortfolio, matchesPortfolioScope, matchesRepositoryNamespace, ownerForLocalRoot, repositoryNamespaceFor } from "../src/lib/shared-portfolio.ts";

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

function localSnapshot(projects, root = "/Users/eimyna/0_DEV") {
  return { root, generatedAt: "2026-09-21T12:00:00.000Z", projects };
}

function johnySource(projects) {
  return [{ key: "eimy", label: "Eimy", status: "missing", cachedAt: null, snapshot: null, message: "Not synced" }, {
    key: "johny", label: "Johny", status: "ready", cachedAt: "2026-09-21T12:01:00.000Z",
    snapshot: { schemaVersion: 1, source: "local-git", owner: "Johny", device: "JohnyBook", generatedAt: "2026-09-21T12:00:00.000Z", projectCount: projects.length, projects },
    message: `${projects.length} projects from JohnyBook`,
  }];
}


function eimySource(projects) {
  return [{ key: "eimy", label: "Eimy", status: "ready", cachedAt: "2026-09-21T12:01:00.000Z",
    snapshot: { schemaVersion: 1, source: "local-git", owner: "Eimy", device: "VoodooBook", generatedAt: "2026-09-21T12:00:00.000Z", projectCount: projects.length, projects },
    message: `${projects.length} projects from VoodooBook`,
  }, { key: "johny", label: "Johny", status: "missing", cachedAt: null, snapshot: null, message: "Not synced" }];
}

test("derives local owner from the portfolio root", () => {
  assert.equal(ownerForLocalRoot("/Users/eimyna/0_DEV"), "Eimy");
  assert.equal(ownerForLocalRoot("/Users/horsedriver/0_DEV/"), "Johny");
});

test("attributes Johny local projects to Johny and merges Eimy as remote collaborator", () => {
  const shared = buildSharedPortfolio(
    localSnapshot([localProject({ path: "/Users/horsedriver/0_DEV/CyberCore", head: "bbbbbbb" })], "/Users/horsedriver/0_DEV"),
    eimySource([remoteProject({ head: "aaaaaaa" })]),
  );
  assert.equal(shared.length, 1);
  assert.equal(shared[0].johny?.source, "local");
  assert.equal(shared[0].eimy?.source, "remote");
  assert.equal(shared[0].isShared, true);
  assert.equal(shared[0].drift, "head-drift");
  assert.equal(matchesPortfolioScope(shared[0], "Johny"), true);
});


test("classifies repository namespace independently from persona", () => {
  assert.equal(repositoryNamespaceFor("github.com/cyberdjs/cybercore"), "cyberdjs");
  assert.equal(repositoryNamespaceFor("github.com/eimyroot/private-tool"), "eimyroot");
  assert.equal(repositoryNamespaceFor("github.com/horsedriver/cryptoradar"), "horsedriver");
  assert.equal(repositoryNamespaceFor("github.com/acidanthera/opencorepkg"), "external");
  assert.equal(repositoryNamespaceFor("git.sr.ht/~grimler/Heimdall"), "external");
  assert.equal(repositoryNamespaceFor(null), "unknown");
});

test("namespace filtering does not change persona presence", () => {
  const shared = buildSharedPortfolio(
    localSnapshot([localProject({ name: "Personal", repositoryId: "github.com/eimyroot/personal" })]),
    johnySource([]),
  );
  assert.equal(shared[0].repositoryNamespace, "eimyroot");
  assert.equal(matchesRepositoryNamespace(shared[0], "eimyroot"), true);
  assert.equal(matchesRepositoryNamespace(shared[0], "horsedriver"), false);
  assert.equal(matchesPortfolioScope(shared[0], "Eimy"), true);
  assert.equal(matchesPortfolioScope(shared[0], "Johny"), false);
});

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
