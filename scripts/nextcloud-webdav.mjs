#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const DEFAULTS = Object.freeze({
  baseUrl: "https://cloud.cyberdjs.org/remote.php/dav/files/nulleimy/",
  username: "nulleimy",
  keychainService: "cybercore-nextcloud-webdav",
});

export function normalizeRemotePath(input = "") {
  const raw = String(input).trim().replace(/^\/+/, "");
  if (!raw) return "";
  return raw.split("/").filter(Boolean).map((segment) => {
    let decoded;
    try { decoded = decodeURIComponent(segment); }
    catch { throw new Error("Remote path contains invalid percent encoding"); }
    if (decoded === "." || decoded === ".." || decoded.includes("\0")) {
      throw new Error("Remote path traversal is not allowed");
    }
    return encodeURIComponent(decoded);
  }).join("/");
}
export function readPasswordFromKeychain({ username, keychainService }) {
  const value = execFileSync("security", [
    "find-generic-password", "-w",
    "-a", username,
    "-s", keychainService,
  ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  if (!value) throw new Error("Keychain credential is empty");
  return value;
}

export function createClient({ baseUrl, username, password, fetchImpl = fetch }) {
  const root = new URL(baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  if (root.protocol !== "https:") throw new Error("WebDAV base URL must use HTTPS");
  const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;

  async function request(method, remotePath = "", options = {}) {
    const normalized = normalizeRemotePath(remotePath);
    const url = new URL(normalized, root);
    const headers = { Authorization: authorization, ...(options.headers ?? {}) };
    return fetchImpl(url, { method, headers, body: options.body, redirect: "error" });
  }

  return { request };
}
function assertStatus(response, allowed, label) {
  if (!allowed.includes(response.status)) {
    throw new Error(`${label} failed with HTTP ${response.status}`);
  }
}

export async function checkConnection(client) {
  const response = await client.request("PROPFIND", "", { headers: { Depth: "0" } });
  assertStatus(response, [207], "WebDAV root check");
  return { ok: true, status: response.status };
}

export async function verifyCreateDelete(client, remotePath = "ChatGPT-Test") {
  const path = normalizeRemotePath(remotePath);
  const before = await client.request("PROPFIND", path, { headers: { Depth: "0" } });
  if (before.status !== 404) {
    throw new Error(`Refusing test because /${path} already exists or is not safely absent (HTTP ${before.status})`);
  }

  let created = false;
  let deleted = false;
  try {
    const create = await client.request("MKCOL", path);
    assertStatus(create, [201], "WebDAV test folder create");
    created = true;
    const exists = await client.request("PROPFIND", path, { headers: { Depth: "0" } });
    assertStatus(exists, [207], "WebDAV test folder verify");

    const remove = await client.request("DELETE", path);
    assertStatus(remove, [204], "WebDAV test folder delete");
    deleted = true;

    const absent = await client.request("PROPFIND", path, { headers: { Depth: "0" } });
    assertStatus(absent, [404], "WebDAV test folder deletion verify");
    return { ok: true, created: true, verified: true, deleted: true, absentAfterDelete: true };
  } finally {
    if (created && !deleted) {
      try { await client.request("DELETE", path); } catch { /* best-effort cleanup */ }
    }
  }
}

export async function putJson(client, remotePath, localFile) {
  const text = await readFile(localFile, "utf8");
  JSON.parse(text);
  const response = await client.request("PUT", remotePath, {
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: text,
  });
  assertStatus(response, [201, 204], "WebDAV JSON upload");
  return { ok: true, status: response.status, remotePath: `/${normalizeRemotePath(remotePath)}` };
}
export async function getJson(client, remotePath) {
  const response = await client.request("GET", remotePath, { headers: { Accept: "application/json" } });
  assertStatus(response, [200], "WebDAV JSON download");
  const text = await response.text();
  JSON.parse(text);
  return text;
}

function runtimeConfig() {
  return {
    baseUrl: process.env.PCC_WEBDAV_BASE_URL ?? DEFAULTS.baseUrl,
    username: process.env.PCC_WEBDAV_USERNAME ?? DEFAULTS.username,
    keychainService: process.env.PCC_WEBDAV_KEYCHAIN_SERVICE ?? DEFAULTS.keychainService,
  };
}

async function main() {
  const [command = "check", arg1, arg2] = process.argv.slice(2);
  const usage = "Usage: nextcloud-webdav.mjs check | test [folder] | put-json <remote> <local> | get-json <remote>";
  if (!["check", "test", "put-json", "get-json"].includes(command)) throw new Error(usage);
  if (command === "put-json" && (!arg1 || !arg2)) throw new Error(usage);
  if (command === "get-json" && !arg1) throw new Error(usage);

  const config = runtimeConfig();
  const password = readPasswordFromKeychain(config);
  const client = createClient({ ...config, password });

  if (command === "check") console.log(JSON.stringify(await checkConnection(client)));
  else if (command === "test") console.log(JSON.stringify(await verifyCreateDelete(client, arg1 ?? "ChatGPT-Test")));
  else if (command === "put-json") console.log(JSON.stringify(await putJson(client, arg1, arg2)));
  else console.log(await getJson(client, arg1));
}
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((error) => {
    console.error(JSON.stringify({ ok: false, error: String(error?.message ?? error) }));
    process.exitCode = 1;
  });
}
