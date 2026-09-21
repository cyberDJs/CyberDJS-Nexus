import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  parsePortablePortfolioSnapshot,
  type PortablePortfolioSnapshot,
} from "./portfolio-contract.ts";
import {
  REMOTE_PORTFOLIOS,
  type RemotePortfolioDefinition,
  type RemotePortfolioKey,
} from "./portfolio-sources.ts";

export type RemotePortfolioSource = {
  key: RemotePortfolioKey;
  label: string;
  status: "ready" | "missing" | "invalid";
  cachedAt: string | null;
  snapshot: PortablePortfolioSnapshot | null;
  message: string;
};

export function portfolioCacheDir(): string {
  return process.env.PCC_PORTFOLIO_CACHE_DIR
    ?? join(homedir(), "Library", "Application Support", "ProjectCommandCenter", "remote");
}

export function portfolioCachePath(key: RemotePortfolioKey, cacheDir = portfolioCacheDir()): string {
  return join(cacheDir, `${key}-latest.json`);
}

export async function readCachedRemotePortfolio(
  definition: RemotePortfolioDefinition,
  cacheDir = portfolioCacheDir(),
): Promise<RemotePortfolioSource> {
  const cachePath = portfolioCachePath(definition.key, cacheDir);
  try {
    const [raw, info] = await Promise.all([readFile(cachePath, "utf8"), stat(cachePath)]);
    const snapshot = parsePortablePortfolioSnapshot(JSON.parse(raw));
    if (snapshot.owner !== definition.expectedOwner) throw new Error("Cached portfolio owner does not match source");
    return {
      key: definition.key,
      label: definition.label,
      status: "ready",
      cachedAt: info.mtime.toISOString(),
      snapshot,
      message: `${snapshot.projectCount} projects from ${snapshot.device}`,
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") {
      return {
        key: definition.key,
        label: definition.label,
        status: "missing",
        cachedAt: null,
        snapshot: null,
        message: "Not synced to this device",
      };
    }
    return {
      key: definition.key,
      label: definition.label,
      status: "invalid",
      cachedAt: null,
      snapshot: null,
      message: "Cached snapshot failed validation",
    };
  }
}

export async function loadRemotePortfolioSources(cacheDir = portfolioCacheDir()): Promise<RemotePortfolioSource[]> {
  return Promise.all(REMOTE_PORTFOLIOS.map((definition) => readCachedRemotePortfolio(definition, cacheDir)));
}
