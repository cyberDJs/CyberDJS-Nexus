import { execFile } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

export type RepoState = "Clean" | "Changes" | "No History";
export type ProjectSnapshot = {
  name: string; path: string; branch: string; head: string; state: RepoState;
  dirtyFiles: number; lastCommitAt: string | null; lastSubject: string;
  category: string; activityDays: number; signal: number;
  hasReadme: boolean; hasGovernance: boolean; hasTests: boolean; authority: string;
  repositoryId: string | null;
};
export type PortfolioSnapshot = { root: string; generatedAt: string; projects: ProjectSnapshot[] };

const DEFAULT_EXCLUDED = ["SKILLS", "VOODOO-SOURCES", "VOODOO-SKILLSET", "ProjectCommandCenter"];
const AUTHORITIES = ["WORLD_CLASS_SOFTWARE_DEVOPS_OPERATING_MODE.md", "PROJECT_CONSTITUTION.md", "PROJECT_STATE.md", "CURRENT_PRODUCT_STATE.md", "README.md"];
const exec = promisify(execFile);

async function git(cwd: string, args: string[]) {
  try {
    const { stdout } = await exec("git", ["-C", cwd, ...args], { encoding: "utf8", timeout: 2500, maxBuffer: 1024 * 1024 });
    return stdout.trim();
  } catch { return ""; }
}

export function normalizeGitRemote(remote: string): string | null {
  const raw = remote.trim();
  if (!raw) return null;
  let candidate = raw;
  if (!raw.includes("://")) {
    const scp = raw.match(/^(?:([^@\s]+)@)?([^:/\s]+):(.+)$/);
    if (!scp) return null;
    candidate = `ssh://${scp[1] ? `${scp[1]}@` : ""}${scp[2]}/${scp[3]}`;
  }
  let parsed: URL;
  try { parsed = new URL(candidate); } catch { return null; }
  if (!["https:", "http:", "ssh:", "git:"].includes(parsed.protocol)) return null;
  const host = parsed.hostname.toLowerCase();
  let pathname: string;
  try { pathname = decodeURIComponent(parsed.pathname); } catch { return null; }
  pathname = pathname.replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "");
  if (!host || !pathname || pathname.includes("..") || pathname.includes("\\")) return null;
  const caseInsensitiveHosts = new Set(["github.com", "gitlab.com", "bitbucket.org"]);
  const safePath = caseInsensitiveHosts.has(host) ? pathname.toLowerCase() : pathname;
  return `${host}/${safePath}`;
}

function detectCategory(path: string) {
  const has = (name: string) => existsSync(join(path, name));
  if (has("package.json")) return "Web / Node";
  if (has("pyproject.toml") || has("requirements.txt")) return "Python";
  if (has("Dockerfile") || has("compose.yml") || has("docker-compose.yml") || has("main.tf")) return "Infrastructure";
  if (has("Cargo.toml")) return "Rust";
  if (has("go.mod")) return "Go";
  return "Other";
}
function authorityFor(path: string) { return AUTHORITIES.find((name) => existsSync(join(path, name))) ?? "—"; }
function testsFor(path: string) { return ["test", "tests", "__tests__", "spec"].some((name) => existsSync(join(path, name))); }

async function inspectProject(path: string, now: number): Promise<ProjectSnapshot> {
  const [statusRaw, meta, origin] = await Promise.all([
    git(path, ["status", "--porcelain=v2", "--branch"]),
    git(path, ["log", "-1", "--format=%cI%x1f%s"]),
    git(path, ["remote", "get-url", "origin"]),
  ]);
  const statusLines = statusRaw ? statusRaw.split("\n") : [];
  const head = statusLines.find((line) => line.startsWith("# branch.oid "))?.slice(13, 20) ?? "";
  const branch = statusLines.find((line) => line.startsWith("# branch.head "))?.slice(14) ?? "detached";
  const dirtyFiles = statusLines.filter((line) => !line.startsWith("# ")).length;
  const [date = "", subject = ""] = meta.split("\x1f");
  const lastCommitAt = date || null;
  const activityDays = lastCommitAt ? Math.max(0, Math.floor((now - new Date(lastCommitAt).getTime()) / 86400000)) : 9999;
  const hasReadme = ["README.md", "README", "readme.md"].some((file) => existsSync(join(path, file)));
  const authority = authorityFor(path);
  const hasGovernance = authority !== "—" && authority !== "README.md";
  const hasTests = testsFor(path);
  const state: RepoState = !head ? "No History" : dirtyFiles ? "Changes" : "Clean";
  const signal = Math.min(100, (head ? 25 : 0) + (hasReadme ? 20 : 0) + (dirtyFiles === 0 ? 20 : 0) + (hasGovernance ? 20 : 0) + (hasTests ? 15 : 0));
  return { name: path.split("/").pop() ?? path, path, branch, head: head || "—", state, dirtyFiles, lastCommitAt, lastSubject: subject || "No commit history", category: detectCategory(path), activityDays, signal, hasReadme, hasGovernance, hasTests, authority, repositoryId: normalizeGitRemote(origin) };
}

export function resolvePortfolioRoot(options: { root?: string; envRoot?: string; home?: string } = {}): string {
  return options.root ?? options.envRoot ?? process.env.PCC_PORTFOLIO_ROOT ?? join(options.home ?? homedir(), "0_DEV");
}

export async function scanLocalProjects(options: { root?: string; excluded?: string[] } = {}): Promise<PortfolioSnapshot> {
  const root = resolvePortfolioRoot({ root: options.root });
  if (!existsSync(root)) throw new Error(`Portfolio root does not exist: ${root}`);
  const excluded = new Set(options.excluded ?? DEFAULT_EXCLUDED);
  const now = Date.now();
  const paths = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && !excluded.has(entry.name))
    .map((entry) => join(root, entry.name))
    .filter((path) => existsSync(join(path, ".git")));
  const projects: ProjectSnapshot[] = [];
  for (let i = 0; i < paths.length; i += 6) {
    projects.push(...await Promise.all(paths.slice(i, i + 6).map((path) => inspectProject(path, now))));
  }
  projects.sort((a, b) => a.activityDays - b.activityDays || a.name.localeCompare(b.name));
  return { root, generatedAt: new Date().toISOString(), projects };
}
