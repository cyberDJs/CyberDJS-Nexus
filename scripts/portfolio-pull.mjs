#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { parsePortablePortfolioSnapshot } from "../src/lib/portfolio-contract.ts";
import { remotePortfolioDefinition } from "../src/lib/portfolio-sources.ts";
import {
  DEFAULTS as WEBDAV_DEFAULTS,
  createClient,
  normalizeRemotePath,
  readPasswordFromKeychain,
} from "./nextcloud-webdav.mjs";

export function defaultCacheDir() {
  return process.env.PCC_PORTFOLIO_CACHE_DIR
    ?? join(homedir(), "Library", "Application Support", "ProjectCommandCenter", "remote");
}

export function cachePathFor(sourceKey, cacheDir = defaultCacheDir()) {
  return join(cacheDir, `${sourceKey}-latest.json`);
}

export async function pullRemotePortfolio(client, options = {}) {
  const sourceKey = options.sourceKey ?? "eimy";
  const definition = remotePortfolioDefinition(sourceKey);
  const remotePath = normalizeRemotePath(options.remotePath ?? definition.remotePath);
  const response = await client.request("GET", remotePath, {
    headers: { Accept: "application/json" },
  });
  if (response.status !== 200) throw new Error(`Portfolio download failed with HTTP ${response.status}`);

  let decoded;
  try {
    decoded = JSON.parse(await response.text());
  } catch {
    throw new Error("Portfolio download is not valid JSON");
  }
  const snapshot = parsePortablePortfolioSnapshot(decoded);
  if (snapshot.owner !== definition.expectedOwner) {
    throw new Error(`Portfolio owner mismatch: expected ${definition.expectedOwner}`);
  }

  const cacheDir = options.cacheDir ?? defaultCacheDir();
  const cachePath = cachePathFor(sourceKey, cacheDir);
  const tempPath = `${cachePath}.${process.pid}.${Date.now()}.tmp`;
  const body = `${JSON.stringify(snapshot, null, 2)}\n`;

  await mkdir(cacheDir, { recursive: true, mode: 0o700 });
  try {
    await writeFile(tempPath, body, { encoding: "utf8", mode: 0o600 });
    await rename(tempPath, cachePath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }

  const verified = parsePortablePortfolioSnapshot(JSON.parse(await readFile(cachePath, "utf8")));
  if (verified.projectCount !== snapshot.projectCount || verified.generatedAt !== snapshot.generatedAt) {
    throw new Error("Cached portfolio verification failed");
  }

  return {
    ok: true,
    source: sourceKey,
    owner: snapshot.owner,
    device: snapshot.device,
    projectCount: snapshot.projectCount,
    generatedAt: snapshot.generatedAt,
    remotePath: `/${remotePath}`,
    cachePath,
    downloadStatus: response.status,
    sha256: createHash("sha256").update(body).digest("hex"),
  };
}

function webDavConfig() {
  return {
    baseUrl: process.env.PCC_WEBDAV_BASE_URL ?? WEBDAV_DEFAULTS.baseUrl,
    username: process.env.PCC_WEBDAV_USERNAME ?? WEBDAV_DEFAULTS.username,
    keychainService: process.env.PCC_WEBDAV_KEYCHAIN_SERVICE ?? WEBDAV_DEFAULTS.keychainService,
  };
}

async function main() {
  const [sourceKey = "eimy"] = process.argv.slice(2);
  const definition = remotePortfolioDefinition(sourceKey);
  const config = webDavConfig();
  const password = readPasswordFromKeychain(config);
  const client = createClient({ ...config, password });
  const remotePath = process.env.PCC_PORTFOLIO_REMOTE_PATH ?? definition.remotePath;
  console.log(JSON.stringify(await pullRemotePortfolio(client, {
    sourceKey,
    remotePath,
  })));
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((error) => {
    console.error(JSON.stringify({ ok: false, error: String(error?.message ?? error) }));
    process.exitCode = 1;
  });
}
