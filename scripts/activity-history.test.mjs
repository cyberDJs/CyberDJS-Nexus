import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { recordHistorySample, sampleFromLocal } from "../src/lib/activity-history.ts";

function snapshot(head = "abc1234", generatedAt = "2026-09-21T10:00:00.000Z") {
  return { root: "/Users/eimyna/0_DEV", generatedAt, localDate: "2026-09-21", projects: [{
    name: "Alpha", path: "/Users/eimyna/0_DEV/Alpha", branch: "main", head, state: "Clean", dirtyFiles: 0,
    lastCommitAt: generatedAt, lastSubject: "must never enter history", category: "Web / Node", activityDays: 0,
    signal: 90, hasReadme: true, hasGovernance: true, hasTests: true, authority: "PROJECT_STATE.md",
    repositoryId: "github.com/cyberdjs/alpha", dayStartHead: "0000000", commitsToday: 2, changedFilesToday: 4,
    insertionsToday: 12, deletionsToday: 3, ahead: 1, behind: 0, upstream: "origin/main", fetchAgeMinutes: 4, events: [],
  }] };
}

test("retains sanitized persona history outside repositories and deduplicates unchanged refreshes", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "nexus-history-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const first = sampleFromLocal(snapshot());
  assert.equal(first.owner, "Eimy");
  assert.equal("path" in first.projects[0], false);
  await recordHistorySample(first, dir);
  await recordHistorySample(sampleFromLocal(snapshot("abc1234", "2026-09-21T10:05:00.000Z")), dir);
  let decoded = JSON.parse(await readFile(join(dir, "eimy.json"), "utf8"));
  assert.equal(decoded.length, 1);
  assert.equal(JSON.stringify(decoded).includes("/Users/"), false);
  assert.equal(JSON.stringify(decoded).includes("must never enter history"), false);
  await recordHistorySample(sampleFromLocal(snapshot("def5678", "2026-09-21T10:06:00.000Z")), dir);
  decoded = JSON.parse(await readFile(join(dir, "eimy.json"), "utf8"));
  assert.equal(decoded.length, 2);
  assert.equal(decoded[1].projects[0].head, "def5678");
});
