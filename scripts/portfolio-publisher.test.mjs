import assert from "node:assert/strict";
import test from "node:test";

import {
  PUBLISH_DEFAULTS,
  assertPortableSnapshot,
  buildPortableSnapshot,
  publishPortableSnapshot,
  resolvePublisherProfile,
} from "./portfolio-publisher.mjs";

function sourceSnapshot() {
  return {
    root: "/Users/eimyna/0_DEV",
    generatedAt: "2026-09-21T12:00:00.000Z",
    projects: [{
      name: "Alpha",
      path: "/Users/eimyna/0_DEV/Alpha",
      branch: "main",
      head: "abc1234",
      state: "Changes",
      dirtyFiles: 2,
      lastCommitAt: "2026-09-20T12:00:00.000Z",
      lastSubject: "local-only subject",
      category: "Web / Node",
      activityDays: 1,
      signal: 75,
      hasReadme: true,
      hasGovernance: true,
      hasTests: true,
      authority: "PROJECT_STATE.md",
      repositoryId: "github.com/cyberdjs/alpha",
    }],
  };
}

function fakeClient({ collectionExists = false } = {}) {
  let collection = collectionExists;
  let stored = null;
  const requests = [];
  return {
    requests,
    request: async (method, remotePath, options = {}) => {
      requests.push({ method, remotePath });
      if (method === "PROPFIND" && remotePath === "ProjectCommandCenter") {
        return new Response(null, { status: collection ? 207 : 404 });
      }
      if (method === "MKCOL" && remotePath === "ProjectCommandCenter") {
        collection = true;
        return new Response(null, { status: 201 });
      }
      if (method === "PUT" && remotePath === PUBLISH_DEFAULTS.remotePath) {
        if (!collection) return new Response(null, { status: 409 });
        stored = options.body;
        return new Response(null, { status: 201 });
      }
      if (method === "GET" && remotePath === PUBLISH_DEFAULTS.remotePath) {
        return stored === null
          ? new Response(null, { status: 404 })
          : new Response(stored, { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(null, { status: 405 });
    },
  };
}

test("builds a portable snapshot without local paths or commit subjects", () => {
  const portable = buildPortableSnapshot(sourceSnapshot());
  assert.equal(portable.owner, "Eimy");
  assert.equal(portable.device, "VoodooBook");
  assert.equal(portable.projectCount, 1);
  assert.equal(portable.projects[0].name, "Alpha");
  assert.equal("path" in portable.projects[0], false);
  assert.equal("lastSubject" in portable.projects[0], false);
  assert.equal(portable.projects[0].repositoryId, "github.com/cyberdjs/alpha");
  assert.equal(JSON.stringify(portable).includes("/Users/"), false);
});

test("accepts sanitized repository identities with sourcehut tilde namespaces", () => {
  const portable = buildPortableSnapshot(sourceSnapshot());
  portable.projects[0].repositoryId = "git.sr.ht/~grimler/Heimdall";
  assert.doesNotThrow(() => assertPortableSnapshot(portable));
});

test("rejects forbidden secret-bearing fields", () => {
  assert.throws(() => assertPortableSnapshot({ owner: "Eimy", token: "x" }), /forbidden field/i);
});

test("creates the remote collection, uploads and verifies the snapshot", async () => {
  const portable = buildPortableSnapshot(sourceSnapshot());
  const client = fakeClient();
  const result = await publishPortableSnapshot(client, portable);
  assert.equal(result.ok, true);
  assert.equal(result.collectionCreated, true);
  assert.equal(result.uploadStatus, 201);
  assert.equal(result.readBackStatus, 200);
  assert.equal(result.projectCount, 1);
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
});

test("reuses an existing remote collection without recreating it", async () => {
  const portable = buildPortableSnapshot(sourceSnapshot());
  const client = fakeClient({ collectionExists: true });
  const result = await publishPortableSnapshot(client, portable);
  assert.equal(result.ok, true);
  assert.equal(result.collectionCreated, false);
  assert.equal(client.requests.some((request) => request.method === "MKCOL"), false);
});


test("resolves bounded Johny collector defaults without inventing credentials", () => {
  const profile = resolvePublisherProfile("johny");
  assert.equal(profile.owner, "Johny");
  assert.equal(profile.root, "/Users/horsedriver/0_DEV");
  assert.equal(profile.remotePath, "ProjectCommandCenter/johny-latest.json");
  assert.ok(profile.device);
});
