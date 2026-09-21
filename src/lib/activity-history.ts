import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir, hostname } from "node:os";
import { join } from "node:path";
import type { PortfolioSnapshot } from "./local-projects.ts";
import type { PortablePortfolioSnapshot } from "./portfolio-contract.ts";
import type { RemotePortfolioSource } from "./remote-portfolios.ts";
import { ownerForLocalRoot, type PortfolioOwner } from "./shared-portfolio.ts";

export type HistoryProject = { name: string; repositoryId: string | null; branch: string; head: string; state: string; dirtyFiles: number; commitsToday: number; changedFilesToday: number; insertionsToday: number; deletionsToday: number; ahead: number | null; behind: number | null; lastCommitAt: string | null };
export type HistorySample = { owner: PortfolioOwner; device: string; generatedAt: string; localDate: string; projects: HistoryProject[] };
export function historyDir(): string { return process.env.PCC_HISTORY_DIR ?? join(homedir(), "Library", "Application Support", "ProjectCommandCenter", "history"); }
function historyPath(owner: PortfolioOwner, dir = historyDir()) { return join(dir, `${owner.toLowerCase()}.json`); }
function projectShape(project: { name: string; repositoryId: string | null; branch: string; head: string; state: string; dirtyFiles: number; commitsToday?: number; changedFilesToday?: number; insertionsToday?: number; deletionsToday?: number; ahead?: number | null; behind?: number | null; lastCommitAt: string | null }): HistoryProject { return { name: project.name, repositoryId: project.repositoryId, branch: project.branch, head: project.head, state: project.state, dirtyFiles: project.dirtyFiles, commitsToday: project.commitsToday ?? 0, changedFilesToday: project.changedFilesToday ?? 0, insertionsToday: project.insertionsToday ?? 0, deletionsToday: project.deletionsToday ?? 0, ahead: project.ahead ?? null, behind: project.behind ?? null, lastCommitAt: project.lastCommitAt }; }
export function sampleFromLocal(snapshot: PortfolioSnapshot): HistorySample { return { owner: ownerForLocalRoot(snapshot.root), device: hostname().replace(/\.local$/i, ""), generatedAt: snapshot.generatedAt, localDate: snapshot.localDate, projects: snapshot.projects.map(projectShape) }; }
export function sampleFromPortable(snapshot: PortablePortfolioSnapshot): HistorySample { return { owner: snapshot.owner as PortfolioOwner, device: snapshot.device, generatedAt: snapshot.generatedAt, localDate: snapshot.localDate, projects: snapshot.projects.map(projectShape) }; }
function signature(sample: HistorySample): string { return sample.projects.map((p) => `${p.repositoryId ?? p.name}|${p.branch}|${p.head}|${p.state}|${p.dirtyFiles}|${p.commitsToday}|${p.ahead ?? ""}|${p.behind ?? ""}`).sort().join("\n"); }
export async function loadOwnerHistory(owner: PortfolioOwner, dir = historyDir()): Promise<HistorySample[]> { try { const decoded = JSON.parse(await readFile(historyPath(owner, dir), "utf8")); return Array.isArray(decoded) ? decoded : []; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; return []; } }
export async function recordHistorySample(sample: HistorySample, dir = historyDir()): Promise<HistorySample[]> {
  const existing = await loadOwnerHistory(sample.owner, dir); const last = existing.at(-1); const now = Date.parse(sample.generatedAt); const cutoff = now - 8 * 86400000;
  const shouldAppend = !last || last.generatedAt !== sample.generatedAt && (signature(last) !== signature(sample) || now - Date.parse(last.generatedAt) >= 15 * 60000);
  let next = existing.filter((item) => Date.parse(item.generatedAt) >= cutoff); if (shouldAppend) next.push(sample); next = next.slice(-800);
  if (shouldAppend || next.length !== existing.length) { await mkdir(dir, { recursive: true, mode: 0o700 }); const target = historyPath(sample.owner, dir); const temp = `${target}.${process.pid}.${Date.now()}.tmp`; try { await writeFile(temp, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", mode: 0o600 }); await rename(temp, target); } catch (error) { await rm(temp, { force: true }).catch(() => {}); throw error; } }
  return next;
}
export async function recordPortfolioHistory(local: PortfolioSnapshot, remoteSources: RemotePortfolioSource[], dir = historyDir()): Promise<HistorySample[]> { const samples: HistorySample[] = []; samples.push(...await recordHistorySample(sampleFromLocal(local), dir)); for (const source of remoteSources) if (source.status === "ready" && source.snapshot) await recordHistorySample(sampleFromPortable(source.snapshot), dir); const [eimy, johny] = await Promise.all([loadOwnerHistory("Eimy", dir), loadOwnerHistory("Johny", dir)]); return [...eimy, ...johny].sort((a, b) => Date.parse(a.generatedAt) - Date.parse(b.generatedAt)); }
