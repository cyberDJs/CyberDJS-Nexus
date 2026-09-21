import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { pullRemotePortfolio } from "./portfolio-pull.mjs";
import {
  loadRemotePortfolioSources,
  readCachedRemotePortfolio,
} from "../src/lib/remote-portfolios.ts";
import { remotePortfolioDefinition } from "../src/lib/portfolio-sources.ts";

function portableSnapshot(overrides = {}) {
  return {
    schemaVersion: 1,
    source: "local-git",
    owner: "Eimy",
    device: "VoodooBook",
    generatedAt: "2026-09-21T12:00:00.000Z",
    projectCount: 1,
    projects: [{
      name: "Alpha",
      branch: "main",
      head: "abc1234",
      state: "Clean",
      dirtyFiles: 0,
      lastCommitAt: "2026-09-20T12:00:00.000Z",
      category: "Web / Node",
      activityDays: 1,
      signal: 80,
      hasGovernance: true,
      hasTests: true,
      authority: "PROJECT_STATE.md",
    }],
    ...overrides,
  };
}

function fakeClient(payload, status = 200) {
  return {
    request: async (method, remotePath) => {
      assert.equal(method, "GET");
      assert.match(remotePath, /^ProjectCommandCenter\//);
      return new Response(status === 200 ? JSON.stringify(payload) : null, {
        status,
        headers: { "Content-Type": "application/json" },
      });
    },
  };
}

async function tempCache(run) {
  const dir = await mkdtemp(join(tmpdir(), "pcc-remote-test-"));
  try { await run(dir); }
  finally { await rm(dir, { recursive: true, force: true }); }
}
test("pulls a valid Eimy snapshot into external cache and exposes source state", async () => {
  await tempCache(async (cacheDir) => {
    const result = await pullRemotePortfolio(fakeClient(portableSnapshot()), { cacheDir, sourceKey: "eimy" });
    assert.equal(result.ok, true);
    assert.equal(result.projectCount, 1);
    assert.equal(result.downloadStatus, 200);

    const sources = await loadRemotePortfolioSources(cacheDir);
    const eimy = sources.find((source) => source.key === "eimy");
    const johny = sources.find((source) => source.key === "johny");
    assert.equal(eimy?.status, "ready");
    assert.equal(eimy?.snapshot?.projectCount, 1);
    assert.equal(johny?.status, "missing");
    assert.equal(johny?.snapshot, null);
  });
});

test("rejects invalid remote content before replacing an existing cache", async () => {
  await tempCache(async (cacheDir) => {
    await pullRemotePortfolio(fakeClient(portableSnapshot()), { cacheDir, sourceKey: "eimy" });
    const target = join(cacheDir, "eimy-latest.json");
    const before = await readFile(target, "utf8");

    await assert.rejects(
      pullRemotePortfolio(fakeClient(portableSnapshot({ projectCount: 99 })), { cacheDir, sourceKey: "eimy" }),
      /projectCount does not match/i,
    );
    assert.equal(await readFile(target, "utf8"), before);
  });
});
test("marks malformed cached data invalid instead of presenting it as portfolio data", async () => {
  await tempCache(async (cacheDir) => {
    await writeFile(join(cacheDir, "johny-latest.json"), "{}\n", "utf8");
    const source = await readCachedRemotePortfolio(remotePortfolioDefinition("johny"), cacheDir);
    assert.equal(source.status, "invalid");
    assert.equal(source.snapshot, null);
    assert.equal(source.message, "Cached snapshot failed validation");
  });
});

test("rejects a snapshot whose owner does not match the selected source", async () => {
  await tempCache(async (cacheDir) => {
    await assert.rejects(
      pullRemotePortfolio(fakeClient(portableSnapshot({ owner: "Johny" })), { cacheDir, sourceKey: "eimy" }),
      /owner mismatch/i,
    );
    await assert.rejects(readFile(join(cacheDir, "eimy-latest.json"), "utf8"), { code: "ENOENT" });
  });
});
