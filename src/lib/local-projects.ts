import { execFile } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { promisify } from "node:util";

export type RepoState = "Clean" | "Changes" | "No History";
export type ActivityEventKind = "commit" | "branch-switch" | "working-tree" | "head-change";
export type ProjectActivityEvent = {
  at: string;
  kind: ActivityEventKind;
  head: string | null;
  from: string | null;
  to: string | null;
  count: number | null;
};
export type ProjectSnapshot = {
  name: string; path: string; branch: string; head: string; state: RepoState;
  dirtyFiles: number; lastCommitAt: string | null; lastSubject: string;
  category: string; activityDays: number; signal: number;
  hasReadme: boolean; hasGovernance: boolean; hasTests: boolean; authority: string;
  repositoryId: string | null;
  dayStartHead: string | null;
  commitsToday: number;
  changedFilesToday: number;
  insertionsToday: number;
  deletionsToday: number;
  ahead: number | null;
  behind: number | null;
  upstream: string | null;
  fetchAgeMinutes: number | null;
  events: ProjectActivityEvent[];
};
export type PortfolioSnapshot = { root: string; generatedAt: string; localDate: string; projects: ProjectSnapshot[] };

const DEFAULT_EXCLUDED = ["SKILLS", "VOODOO-SOURCES", "VOODOO-SKILLSET", "ProjectCommandCenter", "CyberDJS-Nexus"];
const AUTHORITIES = ["WORLD_CLASS_SOFTWARE_DEVOPS_OPERATING_MODE.md", "PROJECT_CONSTITUTION.md", "PROJECT_STATE.md", "CURRENT_PRODUCT_STATE.md", "README.md"];
const exec = promisify(execFile);

async function git(cwd: string, args: string[]) {
  try {
    const { stdout } = await exec("git", ["-C", cwd, ...args], { encoding: "utf8", timeout: 3500, maxBuffer: 2 * 1024 * 1024 });
    return stdout.trim();
  } catch { return ""; }
}

export function localDateKey(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
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

export function parseShortStat(raw: string): { files: number; insertions: number; deletions: number } {
  const files = Number(raw.match(/(\d+) files? changed/)?.[1] ?? 0);
  const insertions = Number(raw.match(/(\d+) insertions?\(\+\)/)?.[1] ?? 0);
  const deletions = Number(raw.match(/(\d+) deletions?\(-\)/)?.[1] ?? 0);
  return { files, insertions, deletions };
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

function parseCommitEvents(raw: string): ProjectActivityEvent[] {
  return raw.split("\n").filter(Boolean).flatMap((line) => {
    const [head, at] = line.split("\x1f");
    if (!head || !at || Number.isNaN(Date.parse(at))) return [];
    return [{ at, kind: "commit" as const, head: head.slice(0, 7), from: null, to: null, count: 1 }];
  });
}

function parseCheckoutEvents(raw: string): ProjectActivityEvent[] {
  return raw.split("\n").filter(Boolean).flatMap((line) => {
    const [head, selector, message] = line.split("\x1f");
    const change = message?.match(/^checkout: moving from (.+) to (.+)$/);
    const date = selector?.match(/@\{(.+)\}$/)?.[1];
    if (!change || !date || Number.isNaN(Date.parse(date))) return [];
    return [{ at: date, kind: "branch-switch" as const, head: head?.slice(0, 7) || null, from: change[1], to: change[2], count: null }];
  });
}

function fetchAgeMinutes(projectPath: string, gitPath: string, now: number): number | null {
  if (!gitPath) return null;
  const candidate = isAbsolute(gitPath) ? gitPath : join(projectPath, gitPath);
  try {
    const age = Math.floor((now - statSync(candidate).mtimeMs) / 60000);
    return Math.max(0, age);
  } catch { return null; }
}

async function inspectProject(path: string, now: number, generatedAt: string): Promise<ProjectSnapshot> {
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const since = start.toISOString();
  const [statusRaw, meta, origin, dayStartRaw, commitLog, reflog, fetchPath] = await Promise.all([
    git(path, ["status", "--porcelain=v2", "--branch"]),
    git(path, ["log", "-1", "--format=%cI%x1f%s"]),
    git(path, ["remote", "get-url", "origin"]),
    git(path, ["rev-list", "-1", `--before=${since}`, "HEAD"]),
    git(path, ["log", `--since=${since}`, "--format=%h%x1f%cI", "--max-count=20"]),
    git(path, ["reflog", `--since=${since}`, "--date=iso-strict", "--format=%h%x1f%gd%x1f%gs", "-20"]),
    git(path, ["rev-parse", "--git-path", "FETCH_HEAD"]),
  ]);
  const statusLines = statusRaw ? statusRaw.split("\n") : [];
  const oid = statusLines.find((line) => line.startsWith("# branch.oid "))?.slice(13).trim() ?? "";
  const head = oid && !oid.startsWith("(initial") ? oid.slice(0, 7) : "";
  const branch = statusLines.find((line) => line.startsWith("# branch.head "))?.slice(14).trim() ?? "detached";
  const upstream = statusLines.find((line) => line.startsWith("# branch.upstream "))?.slice(18).trim() || null;
  const ab = statusLines.find((line) => line.startsWith("# branch.ab "))?.match(/\+(\d+)\s+-(\d+)/);
  const ahead = ab ? Number(ab[1]) : null;
  const behind = ab ? Number(ab[2]) : null;
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
  const dayStartHead = dayStartRaw ? dayStartRaw.slice(0, 7) : null;
  const [committedStatRaw, dirtyStatRaw, stagedStatRaw] = await Promise.all([
    dayStartRaw && head ? git(path, ["diff", "--shortstat", `${dayStartRaw}..HEAD`]) : head ? git(path, ["show", "--shortstat", "--format=", "HEAD"]) : Promise.resolve(""),
    head ? git(path, ["diff", "--shortstat"]) : Promise.resolve(""),
    head ? git(path, ["diff", "--cached", "--shortstat", "HEAD"]) : Promise.resolve(""),
  ]);
  const stats = [committedStatRaw, dirtyStatRaw, stagedStatRaw].map(parseShortStat).reduce((sum, item) => ({ files: sum.files + item.files, insertions: sum.insertions + item.insertions, deletions: sum.deletions + item.deletions }), { files: 0, insertions: 0, deletions: 0 });
  const events = [...parseCommitEvents(commitLog), ...parseCheckoutEvents(reflog)];
  if (dirtyFiles) events.push({ at: generatedAt, kind: "working-tree", head: head || null, from: null, to: null, count: dirtyFiles });
  events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return {
    name: path.split("/").pop() ?? path, path, branch, head: head || "—", state, dirtyFiles,
    lastCommitAt, lastSubject: subject || "No commit history", category: detectCategory(path), activityDays, signal,
    hasReadme, hasGovernance, hasTests, authority, repositoryId: normalizeGitRemote(origin), dayStartHead,
    commitsToday: parseCommitEvents(commitLog).length, changedFilesToday: stats.files, insertionsToday: stats.insertions,
    deletionsToday: stats.deletions, ahead, behind, upstream, fetchAgeMinutes: fetchAgeMinutes(path, fetchPath, now), events: events.slice(0, 24),
  };
}

export function resolvePortfolioRoot(options: { root?: string; envRoot?: string; home?: string } = {}): string {
  return options.root ?? options.envRoot ?? process.env.PCC_PORTFOLIO_ROOT ?? join(options.home ?? homedir(), "0_DEV");
}

export async function scanLocalProjects(options: { root?: string; excluded?: string[] } = {}): Promise<PortfolioSnapshot> {
  const root = resolvePortfolioRoot({ root: options.root });
  if (!existsSync(root)) throw new Error(`Portfolio root does not exist: ${root}`);
  const excluded = new Set(options.excluded ?? DEFAULT_EXCLUDED);
  const now = Date.now();
  const generatedAt = new Date(now).toISOString();
  const paths = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && !excluded.has(entry.name))
    .map((entry) => join(root, entry.name))
    .filter((path) => existsSync(join(path, ".git")));
  const projects: ProjectSnapshot[] = [];
  for (let i = 0; i < paths.length; i += 6) projects.push(...await Promise.all(paths.slice(i, i + 6).map((path) => inspectProject(path, now, generatedAt))));
  projects.sort((a, b) => a.activityDays - b.activityDays || a.name.localeCompare(b.name));
  return { root, generatedAt, localDate: localDateKey(new Date(now)), projects };
}
