import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import {
  DEFAULTS,
  checkConnection,
  createClient,
  normalizeRemotePath,
  verifyCreateDelete,
} from "./nextcloud-webdav.mjs";

function mockWebDav() {
  const folders = new Set();
  const requests = [];
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, "http://localhost").pathname).replace(/^\/dav\/?/, "");
    requests.push({ method: req.method, path, auth: req.headers.authorization });
    if (req.headers.authorization !== "Basic dGVzdDpzZWNyZXQ=") {
      res.writeHead(401).end(); return;
    }
    if (req.method === "PROPFIND" && path === "") {
      res.writeHead(207).end(); return;
    }
    if (req.method === "PROPFIND") {
      res.writeHead(folders.has(path) ? 207 : 404).end(); return;
    }
    if (req.method === "MKCOL") {
      if (folders.has(path)) { res.writeHead(405).end(); return; }
      folders.add(path); res.writeHead(201).end(); return;
    }
    if (req.method === "DELETE") {
      if (!folders.has(path)) { res.writeHead(404).end(); return; }
      folders.delete(path); res.writeHead(204).end(); return;
    }
    res.writeHead(405).end();
  });
  return { server, folders, requests };
}

async function withServer(run) {
  const mock = mockWebDav();
  await new Promise((resolve) => mock.server.listen(0, "127.0.0.1", resolve));
  const address = mock.server.address();
  assert.equal(typeof address, "object");
  const client = createClient({
    baseUrl: `https://example.invalid/`,
    username: "test",
    password: "secret",
    fetchImpl: (url, init) => fetch(`http://127.0.0.1:${address.port}/dav/${new URL(url).pathname.split("/").pop() ?? ""}`, init),
  });
  try { await run(client, mock); }
  finally { await new Promise((resolve) => mock.server.close(resolve)); }
}
test("uses the verified nulleimy Nextcloud identity by default", () => {
  assert.equal(DEFAULTS.username, "nulleimy");
  assert.equal(DEFAULTS.baseUrl, "https://cloud.cyberdjs.org/remote.php/dav/files/nulleimy/");
});

test("normalizes safe remote paths and rejects traversal", () => {
  assert.equal(normalizeRemotePath("/Project Command Center/eimy.json"), "Project%20Command%20Center/eimy.json");
  assert.throws(() => normalizeRemotePath("../secret"), /traversal/);
  assert.throws(() => normalizeRemotePath("%2e%2e/secret"), /traversal/);
});

test("checks the WebDAV root without exposing credentials", async () => {
  await withServer(async (client, mock) => {
    const result = await checkConnection(client);
    assert.deepEqual(result, { ok: true, status: 207 });
    assert.equal(mock.requests.length, 1);
    assert.equal(mock.requests[0].method, "PROPFIND");
  });
});

test("creates, verifies and deletes only an absent test folder", async () => {
  await withServer(async (client, mock) => {
    const result = await verifyCreateDelete(client, "ChatGPT-Test");
    assert.equal(result.ok, true);
    assert.equal(mock.folders.has("ChatGPT-Test"), false);
    assert.deepEqual(mock.requests.map((item) => item.method), ["PROPFIND", "MKCOL", "PROPFIND", "DELETE", "PROPFIND"]);
  });
});
