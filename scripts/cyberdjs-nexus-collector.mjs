#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

export const DEFAULTS = Object.freeze({
  root: "/Users/horsedriver/0_DEV",
  owner: "Johny",
  device: "MacBook-Pro-2",
  output: "johny-latest.json",
  schemaVersion: 1,
});

const EXCLUDED = new Set(["SKILLS", "VOODOO-SOURCES", "VOODOO-SKILLSET", "ProjectCommandCenter"]);
const AUTHORITIES = [
  "WORLD_CLASS_SOFTWARE_DEVOPS_OPERATING_MODE.md",
  "PROJECT_CONSTITUTION.md",
  "PROJECT_STATE.md",
  "CURRENT_PRODUCT_STATE.md",
  "README.md",
];
const exec = promisify(execFile);
async function git(cwd, args) {
  try {
    const { stdout } = await exec("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      timeout: 2500,
      maxBuffer: 1024 * 1024,
    });
    return stdout.trim();
  } catch {
    return "";
  }
}

export function normalizeGitRemote(remote) {
  const raw = String(remote ?? "").trim();
  if (!raw) return null;
  let candidate = raw;
  if (!raw.includes("://")) {
    const scp = raw.match(/^(?:([^@\s]+)@)?([^:/\s]+):(.+)$/);
    if (!scp) return null;
    candidate = `ssh://${scp[1] ? `${scp[1]}@` : ""}${scp[2]}/${scp[3]}`;
  }
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }
  if (!["https:", "http:", "ssh:", "git:"].includes(parsed.protocol)) return null;
  const host = parsed.hostname.toLowerCase();
  let pathname;
  try {
    pathname = decodeURIComponent(parsed.pathname);
  } catch {
    return null;
  }
  pathname = pathname.replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "");
  if (!host || !pathname || pathname.includes("..") || pathname.includes("\\")) return null;
  const caseInsensitiveHosts = new Set(["github.com", "gitlab.com", "bitbucket.org"]);
  const safePath = caseInsensitiveHosts.has(host) ? pathname.toLowerCase() : pathname;
  return `${host}/${safePath}`;
}

function detectCategory(projectPath) {
  const has = (name) => existsSync(join(projectPath, name));
  if (has("package.json")) return "Web / Node";
  if (has("pyproject.toml") || has("requirements.txt")) return "Python";
  if (has("Dockerfile") || has("compose.yml") || has("docker-compose.yml") || has("main.tf")) {
    return "Infrastructure";
  }
  if (has("Cargo.toml")) return "Rust";
  if (has("go.mod")) return "Go";
  return "Other";
}

function authorityFor(projectPath) {
  return AUTHORITIES.find((name) => existsSync(join(projectPath, name))) ?? "—";
}
function testsFor(projectPath) {
  return ["test", "tests", "__tests__", "spec"].some((name) => existsSync(join(projectPath, name)));
}

async function inspectProject(projectPath, now) {
  const [statusRaw, lastCommitAtRaw, origin] = await Promise.all([
    git(projectPath, ["status", "--porcelain=v2", "--branch"]),
    git(projectPath, ["log", "-1", "--format=%cI"]),
    git(projectPath, ["remote", "get-url", "origin"]),
  ]);
  const statusLines = statusRaw ? statusRaw.split("\n") : [];
  const head = statusLines.find((line) => line.startsWith("# branch.oid "))?.slice(13, 20) ?? "";
  const branch = statusLines.find((line) => line.startsWith("# branch.head "))?.slice(14) ?? "detached";
  const dirtyFiles = statusLines.filter((line) => !line.startsWith("# ")).length;
  const lastCommitAt = lastCommitAtRaw || null;
  const activityDays = lastCommitAt
    ? Math.max(0, Math.floor((now - new Date(lastCommitAt).getTime()) / 86400000))
    : 9999;
  const hasReadme = ["README.md", "README", "readme.md"].some((file) => existsSync(join(projectPath, file)));
  const authority = authorityFor(projectPath);
  const hasGovernance = authority !== "—" && authority !== "README.md";
  const hasTests = testsFor(projectPath);
  const state = !head ? "No History" : dirtyFiles ? "Changes" : "Clean";
  const signal = Math.min(
    100,
    (head ? 25 : 0) + (hasReadme ? 20 : 0) + (dirtyFiles === 0 ? 20 : 0) +
      (hasGovernance ? 20 : 0) + (hasTests ? 15 : 0),
  );
  return {
    name: basename(projectPath),
    branch,
    head: head || "—",
    state,
    dirtyFiles,
    lastCommitAt,
    category: detectCategory(projectPath),
    activityDays,
    signal,
    hasGovernance,
    hasTests,
    authority,
    repositoryId: normalizeGitRemote(origin),
  };
}

function projectPaths(root) {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && !EXCLUDED.has(entry.name))
    .map((entry) => join(root, entry.name))
    .filter((projectPath) => existsSync(join(projectPath, ".git")));
}

export async function collectPortfolioSnapshot({ root, owner, device } = {}) {
  const targetRoot = resolve(root ?? DEFAULTS.root);
  if (!existsSync(targetRoot)) throw new Error(`Portfolio root does not exist: ${targetRoot}`);
  const now = Date.now();
  const paths = projectPaths(targetRoot);
  const projects = [];
  for (let i = 0; i < paths.length; i += 6) {
    projects.push(...await Promise.all(paths.slice(i, i + 6).map((projectPath) => inspectProject(projectPath, now))));
  }
  projects.sort((a, b) => a.activityDays - b.activityDays || a.name.localeCompare(b.name));
  const snapshot = {
    schemaVersion: DEFAULTS.schemaVersion,
    source: "local-git",
    owner: owner ?? DEFAULTS.owner,
    device: device ?? DEFAULTS.device,
    generatedAt: new Date().toISOString(),
    projectCount: projects.length,
    projects,
  };
  validatePortableSnapshot(snapshot);
  return { snapshot, projectPaths: paths };
}

function rejectSensitiveShape(value) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (/^(password|secret|token|credential|keychainService)$/i.test(key)) {
      throw new Error(`Snapshot contains forbidden field: ${key}`);
    }
    rejectSensitiveShape(child);
  }
}

export function validatePortableSnapshot(snapshot) {
  rejectSensitiveShape(snapshot);
  const serialized = JSON.stringify(snapshot);
  if (serialized.includes("/Users/")) throw new Error("Snapshot must not contain local absolute paths");
  if (snapshot.schemaVersion !== 1 || snapshot.source !== "local-git") {
    throw new Error("Unsupported snapshot contract");
  }
  if (!snapshot.owner || !snapshot.device || Number.isNaN(Date.parse(snapshot.generatedAt))) {
    throw new Error("Snapshot identity or timestamp is invalid");
  }
  if (!Array.isArray(snapshot.projects) || snapshot.projectCount !== snapshot.projects.length) {
    throw new Error("Snapshot projectCount does not match projects");
  }
  for (const [index, project] of snapshot.projects.entries()) {
    if (!project.name || !project.branch || !project.head || !["Clean", "Changes", "No History"].includes(project.state)) {
      throw new Error(`projects[${index}] has invalid identity/state`);
    }
    if (!Number.isInteger(project.dirtyFiles) || project.dirtyFiles < 0) {
      throw new Error(`projects[${index}].dirtyFiles is invalid`);
    }
    if (project.lastCommitAt !== null && Number.isNaN(Date.parse(project.lastCommitAt))) {
      throw new Error(`projects[${index}].lastCommitAt is invalid`);
    }
    if (!Number.isInteger(project.activityDays) || !Number.isInteger(project.signal) || project.signal < 0 || project.signal > 100) {
      throw new Error(`projects[${index}] activity/signal is invalid`);
    }
    if (typeof project.hasGovernance !== "boolean" || typeof project.hasTests !== "boolean" || !project.authority) {
      throw new Error(`projects[${index}] governance/test metadata is invalid`);
    }
    if (project.repositoryId !== null && (project.repositoryId.includes("://") || project.repositoryId.includes("@"))) {
      throw new Error(`projects[${index}].repositoryId is not sanitized`);
    }
  }
  return true;
}
function isInsideProject(outputPath, paths) {
  return paths.some((projectPath) => {
    const rel = relative(resolve(projectPath), outputPath);
    return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`);
  });
}

export async function writeSnapshotAtomic(output, snapshot, paths = []) {
  validatePortableSnapshot(snapshot);
  const outputPath = resolve(output);
  if (isInsideProject(outputPath, paths)) {
    throw new Error("Output must not be written inside a scanned source repository");
  }
  await mkdir(dirname(outputPath), { recursive: true });
  const tempPath = `${outputPath}.tmp-${process.pid}`;
  const body = `${JSON.stringify(snapshot, null, 2)}\n`;
  try {
    await writeFile(tempPath, body, { encoding: "utf8", mode: 0o600 });
    await rename(tempPath, outputPath);
  } catch (error) {
    await unlink(tempPath).catch(() => {});
    throw error;
  }
  return {
    outputPath,
    sha256: createHash("sha256").update(body).digest("hex"),
  };
}

function requiredValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}
export function parseArgs(argv) {
  const options = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--root") options.root = requiredValue(argv, i++, arg);
    else if (arg === "--owner") options.owner = requiredValue(argv, i++, arg);
    else if (arg === "--device") options.device = requiredValue(argv, i++, arg);
    else if (arg === "--output") options.output = requiredValue(argv, i++, arg);
    else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!String(options.owner).trim() || !String(options.device).trim()) {
    throw new Error("owner and device must be non-empty");
  }
  return options;
}

function usage() {
  return [
    "CyberDJS Nexus portable collector",
    "",
    "Usage:",
    "  node cyberdjs-nexus-collector.mjs [options]",
    "",
    `  --root <path>     default: ${DEFAULTS.root}`,
    `  --owner <name>    default: ${DEFAULTS.owner}`,
    `  --device <id>     default: ${DEFAULTS.device}`,
    `  --output <file>   default: ${DEFAULTS.output}`,
  ].join("\n");
}
async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  const { snapshot, projectPaths: paths } = await collectPortfolioSnapshot(options);
  const { outputPath, sha256 } = await writeSnapshotAtomic(options.output, snapshot, paths);
  console.log(JSON.stringify({
    ok: true,
    owner: snapshot.owner,
    device: snapshot.device,
    projectCount: snapshot.projectCount,
    output: basename(outputPath),
    sha256,
  }));
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((error) => {
    console.error(JSON.stringify({ ok: false, error: String(error?.message ?? error) }));
    process.exitCode = 1;
  });
}
