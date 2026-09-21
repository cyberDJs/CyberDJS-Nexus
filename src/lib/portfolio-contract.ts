import type { ActivityEventKind } from "./local-projects.ts";

export type PortableRepoState = "Clean" | "Changes" | "No History";
export type PortableActivityEvent = { at: string; kind: ActivityEventKind; head: string | null; from: string | null; to: string | null; count: number | null };
export type PortableProjectSnapshot = {
  name: string; branch: string; head: string; state: PortableRepoState; dirtyFiles: number; lastCommitAt: string | null;
  category: string; activityDays: number; signal: number; hasGovernance: boolean; hasTests: boolean; authority: string;
  repositoryId: string | null; dayStartHead: string | null; commitsToday: number; changedFilesToday: number;
  insertionsToday: number; deletionsToday: number; ahead: number | null; behind: number | null; upstream: string | null;
  fetchAgeMinutes: number | null; events: PortableActivityEvent[];
};
export type PortablePortfolioSnapshot = {
  schemaVersion: 1; source: "local-git"; owner: string; device: string; generatedAt: string; localDate: string;
  projectCount: number; projects: PortableProjectSnapshot[];
};
const FORBIDDEN_FIELD = /^(password|secret|token|credential|keychainService)$/i;
const STATES = new Set<PortableRepoState>(["Clean", "Changes", "No History"]);
const EVENT_KINDS = new Set<ActivityEventKind>(["commit", "branch-switch", "working-tree", "head-change"]);
function record(value: unknown, label: string): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`); return value as Record<string, unknown>; }
function text(value: unknown, label: string): string { if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`); return value; }
function nullableText(value: unknown, label: string): string | null { if (value === undefined || value === null || value === "") return null; return text(value, label); }
function integer(value: unknown, label: string, max = Number.MAX_SAFE_INTEGER): number { if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > max) throw new Error(`${label} must be an integer between 0 and ${max}`); return value as number; }
function optionalInteger(value: unknown, label: string, fallback: number | null = 0): number | null { if (value === undefined || value === null) return fallback; return integer(value, label); }
function boolean(value: unknown, label: string): boolean { if (typeof value !== "boolean") throw new Error(`${label} must be boolean`); return value; }
function isoDate(value: unknown, label: string): string { const result = text(value, label); if (Number.isNaN(Date.parse(result))) throw new Error(`${label} must be a valid date`); return result; }
function nullableDate(value: unknown, label: string): string | null { if (value === null) return null; return isoDate(value, label); }
function repositoryId(value: unknown, label: string): string | null { if (value === undefined || value === null) return null; const result = text(value, label); if (result.includes("://") || result.includes("@") || result.includes("?") || result.includes("#") || result.includes("\\")) throw new Error(`${label} must be a normalized repository identity`); if (!/^[a-z0-9.-]+\/[a-z0-9._~-]+(?:\/[a-z0-9._~-]+)+$/i.test(result)) throw new Error(`${label} must be host/path/repository`); return result; }
function rejectSensitiveShape(value: unknown): void { if (!value || typeof value !== "object") return; for (const [key, child] of Object.entries(value as Record<string, unknown>)) { if (FORBIDDEN_FIELD.test(key)) throw new Error(`Portfolio snapshot contains forbidden field: ${key}`); rejectSensitiveShape(child); } }
function localDate(value: unknown, generatedAt: string): string { if (value === undefined) return generatedAt.slice(0, 10); const result = text(value, "localDate"); if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) throw new Error("localDate must be YYYY-MM-DD"); return result; }
function parseEvent(value: unknown, index: number, eventIndex: number): PortableActivityEvent { const item = record(value, `projects[${index}].events[${eventIndex}]`); const kind = text(item.kind, `projects[${index}].events[${eventIndex}].kind`) as ActivityEventKind; if (!EVENT_KINDS.has(kind)) throw new Error(`projects[${index}].events[${eventIndex}].kind is unsupported`); return { at: isoDate(item.at, `projects[${index}].events[${eventIndex}].at`), kind, head: nullableText(item.head, `projects[${index}].events[${eventIndex}].head`), from: nullableText(item.from, `projects[${index}].events[${eventIndex}].from`), to: nullableText(item.to, `projects[${index}].events[${eventIndex}].to`), count: optionalInteger(item.count, `projects[${index}].events[${eventIndex}].count`, null) }; }
function parseProject(value: unknown, index: number): PortableProjectSnapshot {
  const item = record(value, `projects[${index}]`); const state = text(item.state, `projects[${index}].state`) as PortableRepoState; if (!STATES.has(state)) throw new Error(`projects[${index}].state is unsupported`);
  const eventsRaw = item.events === undefined ? [] : item.events; if (!Array.isArray(eventsRaw) || eventsRaw.length > 50) throw new Error(`projects[${index}].events must be an array with at most 50 items`);
  return { name: text(item.name, `projects[${index}].name`), branch: text(item.branch, `projects[${index}].branch`), head: text(item.head, `projects[${index}].head`), state, dirtyFiles: integer(item.dirtyFiles, `projects[${index}].dirtyFiles`), lastCommitAt: nullableDate(item.lastCommitAt, `projects[${index}].lastCommitAt`), category: text(item.category, `projects[${index}].category`), activityDays: integer(item.activityDays, `projects[${index}].activityDays`), signal: integer(item.signal, `projects[${index}].signal`, 100), hasGovernance: boolean(item.hasGovernance, `projects[${index}].hasGovernance`), hasTests: boolean(item.hasTests, `projects[${index}].hasTests`), authority: text(item.authority, `projects[${index}].authority`), repositoryId: repositoryId(item.repositoryId, `projects[${index}].repositoryId`), dayStartHead: nullableText(item.dayStartHead, `projects[${index}].dayStartHead`), commitsToday: optionalInteger(item.commitsToday, `projects[${index}].commitsToday`, 0) ?? 0, changedFilesToday: optionalInteger(item.changedFilesToday, `projects[${index}].changedFilesToday`, 0) ?? 0, insertionsToday: optionalInteger(item.insertionsToday, `projects[${index}].insertionsToday`, 0) ?? 0, deletionsToday: optionalInteger(item.deletionsToday, `projects[${index}].deletionsToday`, 0) ?? 0, ahead: optionalInteger(item.ahead, `projects[${index}].ahead`, null), behind: optionalInteger(item.behind, `projects[${index}].behind`, null), upstream: nullableText(item.upstream, `projects[${index}].upstream`), fetchAgeMinutes: optionalInteger(item.fetchAgeMinutes, `projects[${index}].fetchAgeMinutes`, null), events: eventsRaw.map((event, eventIndex) => parseEvent(event, index, eventIndex)) };
}
export function parsePortablePortfolioSnapshot(value: unknown): PortablePortfolioSnapshot {
  rejectSensitiveShape(value); const serialized = JSON.stringify(value); if (serialized.includes("/Users/")) throw new Error("Portfolio snapshot must not contain local absolute paths");
  const root = record(value, "portfolio snapshot"); if (root.schemaVersion !== 1) throw new Error("Unsupported portfolio schemaVersion"); if (root.source !== "local-git") throw new Error("Unsupported portfolio source"); if (!Array.isArray(root.projects)) throw new Error("projects must be an array");
  const generatedAt = isoDate(root.generatedAt, "generatedAt"); const projects = root.projects.map(parseProject); const projectCount = integer(root.projectCount, "projectCount"); if (projectCount !== projects.length) throw new Error("projectCount does not match projects length");
  return { schemaVersion: 1, source: "local-git", owner: text(root.owner, "owner"), device: text(root.device, "device"), generatedAt, localDate: localDate(root.localDate, generatedAt), projectCount, projects };
}
export function assertPortablePortfolioSnapshot(value: unknown): asserts value is PortablePortfolioSnapshot { parsePortablePortfolioSnapshot(value); }
