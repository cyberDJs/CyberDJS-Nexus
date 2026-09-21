#!/usr/bin/env node

import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { hostname } from "node:os";
import { pathToFileURL } from "node:url";

import { assertPortablePortfolioSnapshot } from "../src/lib/portfolio-contract.ts";

import {
  DEFAULTS as WEBDAV_DEFAULTS,
  createClient,
  normalizeRemotePath,
  readPasswordFromKeychain,
} from "./nextcloud-webdav.mjs";

export const PUBLISH_DEFAULTS = Object.freeze({
  owner: "Eimy",
  device: "VoodooBook",
  remotePath: "ProjectCommandCenter/eimy-latest.json",
  schemaVersion: 1,
});

export function buildPortableSnapshot(snapshot, options = {}) {
  const owner = options.owner ?? PUBLISH_DEFAULTS.owner;
  const device = options.device ?? PUBLISH_DEFAULTS.device;
  const projects = snapshot.projects.map((project) => ({
    name: project.name,
    branch: project.branch,
    head: project.head,
    state: project.state,
    dirtyFiles: project.dirtyFiles,
    lastCommitAt: project.lastCommitAt,
    category: project.category,
    activityDays: project.activityDays,
    signal: project.signal,
    hasGovernance: project.hasGovernance,
    hasTests: project.hasTests,
    authority: project.authority,
    repositoryId: project.repositoryId ?? null,
  }));

  const portable = {
    schemaVersion: PUBLISH_DEFAULTS.schemaVersion,
    source: "local-git",
    owner,
    device,
    generatedAt: snapshot.generatedAt,
    projectCount: projects.length,
    projects,
  };
  assertPortableSnapshot(portable);
  return portable;
}

export function assertPortableSnapshot(snapshot) {
  assertPortablePortfolioSnapshot(snapshot);
}

export async function ensureCollection(client, remoteCollection) {
  const collection = normalizeRemotePath(remoteCollection);
  const before = await client.request("PROPFIND", collection, { headers: { Depth: "0" } });
  if (before.status === 207) return { created: false, status: 207 };
  if (before.status !== 404) throw new Error(`WebDAV collection preflight failed with HTTP ${before.status}`);

  const created = await client.request("MKCOL", collection);
  if (created.status !== 201) throw new Error(`WebDAV collection create failed with HTTP ${created.status}`);
  return { created: true, status: 201 };
}

export async function publishPortableSnapshot(client, snapshot, remotePath = PUBLISH_DEFAULTS.remotePath) {
  assertPortableSnapshot(snapshot);
  const safePath = normalizeRemotePath(remotePath);
  const parts = safePath.split("/");
  if (parts.length < 2) throw new Error("Portfolio remote path must include a collection and filename");
  const collection = parts.slice(0, -1).join("/");
  const collectionResult = await ensureCollection(client, collection);

  const body = JSON.stringify(snapshot);
  const upload = await client.request("PUT", safePath, {
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body,
  });
  if (![201, 204].includes(upload.status)) throw new Error(`Portfolio upload failed with HTTP ${upload.status}`);

  const readBack = await client.request("GET", safePath, { headers: { Accept: "application/json" } });
  if (readBack.status !== 200) throw new Error(`Portfolio read-back failed with HTTP ${readBack.status}`);
  const verified = JSON.parse(await readBack.text());
  if (!isDeepStrictEqual(verified, snapshot)) throw new Error("Portfolio read-back content does not match uploaded snapshot");

  return {
    ok: true,
    remotePath: `/${safePath}`,
    projectCount: snapshot.projectCount,
    collectionCreated: collectionResult.created,
    uploadStatus: upload.status,
    readBackStatus: readBack.status,
    sha256: createHash("sha256").update(body).digest("hex"),
  };
}

export function resolvePublisherProfile(sourceKey = "eimy") {
  if (!['eimy', 'johny'].includes(sourceKey)) throw new Error(`Unknown portfolio source: ${sourceKey}`);
  const isEimy = sourceKey === 'eimy';
  return {
    sourceKey,
    owner: process.env.PCC_PORTFOLIO_OWNER ?? (isEimy ? 'Eimy' : 'Johny'),
    device: process.env.PCC_PORTFOLIO_DEVICE ?? (isEimy ? PUBLISH_DEFAULTS.device : hostname().replace(/\.local$/i, '')),
    root: process.env.PCC_PORTFOLIO_ROOT ?? (isEimy ? '/Users/eimyna/0_DEV' : '/Users/horsedriver/0_DEV'),
    remotePath: process.env.PCC_PORTFOLIO_REMOTE_PATH ?? (isEimy ? PUBLISH_DEFAULTS.remotePath : 'ProjectCommandCenter/johny-latest.json'),
  };
}

async function collectPortableSnapshot(sourceKey = "eimy") {
  const { scanLocalProjects } = await import("../src/lib/local-projects.ts");
  const profile = resolvePublisherProfile(sourceKey);
  const snapshot = await scanLocalProjects({ root: profile.root });
  return buildPortableSnapshot(snapshot, { owner: profile.owner, device: profile.device });
}

function webDavConfig() {
  return {
    baseUrl: process.env.PCC_WEBDAV_BASE_URL ?? WEBDAV_DEFAULTS.baseUrl,
    username: process.env.PCC_WEBDAV_USERNAME ?? WEBDAV_DEFAULTS.username,
    keychainService: process.env.PCC_WEBDAV_KEYCHAIN_SERVICE ?? WEBDAV_DEFAULTS.keychainService,
  };
}
async function main() {
  const [command = "snapshot", sourceKey = "eimy"] = process.argv.slice(2);
  if (!["snapshot", "publish"].includes(command)) {
    throw new Error("Usage: portfolio-publisher.mjs snapshot | publish [eimy|johny]");
  }

  const profile = resolvePublisherProfile(sourceKey);
  const snapshot = await collectPortableSnapshot(sourceKey);
  if (command === "snapshot") {
    console.log(JSON.stringify(snapshot, null, 2));
    return;
  }

  if (sourceKey === "johny" && (!process.env.PCC_WEBDAV_BASE_URL || !process.env.PCC_WEBDAV_USERNAME || !process.env.PCC_WEBDAV_KEYCHAIN_SERVICE)) {
    throw new Error("Johny publish requires explicit PCC_WEBDAV_BASE_URL, PCC_WEBDAV_USERNAME and PCC_WEBDAV_KEYCHAIN_SERVICE; Eimy WebDAV defaults are never reused for Johny");
  }
  const config = webDavConfig();
  const password = readPasswordFromKeychain(config);
  const client = createClient({ ...config, password });
  const remotePath = profile.remotePath;
  console.log(JSON.stringify(await publishPortableSnapshot(client, snapshot, remotePath)));
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((error) => {
    console.error(JSON.stringify({ ok: false, error: String(error?.message ?? error) }));
    process.exitCode = 1;
  });
}
