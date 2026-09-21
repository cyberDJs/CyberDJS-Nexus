import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  collectPortfolioSnapshot,
  normalizeGitRemote,
  validatePortableSnapshot,
  writeSnapshotAtomic,
} from "./cyberdjs-nexus-collector.mjs";

const collectorPath = fileURLToPath(new URL("./cyberdjs-nexus-collector.mjs", import.meta.url));

function git(cwd, ...args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

function initRepo(root, name, { remote, dirty = false, governance = false, tests = false } = {}) {
  const repo = join(root, name);
  mkdirSync(repo, { recursive: true });
  git(repo, "init", "-q");
  git(repo, "config", "user.email", "collector-test@cyberdjs.invalid");
  git(repo, "config", "user.name", "Collector Test");
  writeFileSync(join(repo, "README.md"), `# ${name}\n`);
  if (governance) writeFileSync(join(repo, "PROJECT_STATE.md"), "# State\n");
  if (tests) mkdirSync(join(repo, "tests"));
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "fixture");
  if (remote) git(repo, "remote", "add", "origin", remote);
  if (dirty) writeFileSync(join(repo, "README.md"), `# ${name}\nchanged\n`);
  return repo;
}

test("normalizes remote identity without leaking credentials", () => {
  assert.equal(
    normalizeGitRemote("https://user:fake-token@github.com/CyberDJs/Nexus.git"),
    "github.com/cyberdjs/nexus",
  );
  assert.equal(
    normalizeGitRemote("git@github.com:CyberDJs/Nexus.git"),
    "github.com/cyberdjs/nexus",
  );
  assert.equal(normalizeGitRemote("file:///tmp/repo"), null);
});

test("collects direct Git repositories into the schema v1 portable contract", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "nexus-collector-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const shared = initRepo(root, "SharedRepo", {
    remote: "https://user:fake-token@github.com/CyberDJs/SharedRepo.git",
    dirty: true,
    governance: true,
    tests: true,
  });
  initRepo(root, "NoRemote");
  const nestedParent = join(root, "NestedOnly");
  mkdirSync(nestedParent);
  initRepo(nestedParent, "NestedRepo");
  initRepo(root, "SKILLS", { remote: "git@github.com:CyberDJs/ShouldBeExcluded.git" });

  const { snapshot, projectPaths } = await collectPortfolioSnapshot({
    root,
    owner: "Johny",
    device: "MacBook-Pro-2",
  });

  validatePortableSnapshot(snapshot);
  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.source, "local-git");
  assert.equal(snapshot.owner, "Johny");
  assert.equal(snapshot.device, "MacBook-Pro-2");
  assert.equal(snapshot.projectCount, 2);
  assert.deepEqual(snapshot.projects.map((project) => project.name).sort(), ["NoRemote", "SharedRepo"]);

  const sharedSnapshot = snapshot.projects.find((project) => project.name === "SharedRepo");
  assert.equal(sharedSnapshot.repositoryId, "github.com/cyberdjs/sharedrepo");
  assert.equal(sharedSnapshot.state, "Changes");
  assert.equal(sharedSnapshot.hasGovernance, true);
  assert.equal(sharedSnapshot.hasTests, true);
  assert.equal(sharedSnapshot.authority, "PROJECT_STATE.md");
  assert.equal(snapshot.projects.find((project) => project.name === "NoRemote").repositoryId, null);

  const serialized = JSON.stringify(snapshot);
  assert.equal(serialized.includes(root), false);
  assert.equal(serialized.includes("fake-token"), false);
  assert.equal(serialized.includes("/Users/"), false);

  await assert.rejects(
    () => writeSnapshotAtomic(join(shared, "should-not-write.json"), snapshot, projectPaths),
    /must not be written inside a scanned source repository/,
  );
});

test("CLI writes only the requested external snapshot file", (t) => {
  const root = mkdtempSync(join(tmpdir(), "nexus-collector-cli-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  initRepo(root, "RepoOne", { remote: "git@github.com:CyberDJs/RepoOne.git" });
  const output = join(root, "..", `johny-latest-${process.pid}.json`);
  t.after(() => rmSync(output, { force: true }));

  const result = execFileSync(process.execPath, [
    collectorPath,
    "--root", root,
    "--owner", "Johny",
    "--device", "MacBook-Pro-2",
    "--output", output,
  ], { encoding: "utf8" }).trim();

  const summary = JSON.parse(result);
  const snapshot = JSON.parse(readFileSync(output, "utf8"));
  assert.equal(summary.ok, true);
  assert.equal(summary.output, output.split("/").pop());
  assert.equal(snapshot.projectCount, 1);
  assert.equal(snapshot.projects[0].repositoryId, "github.com/cyberdjs/repoone");
});
