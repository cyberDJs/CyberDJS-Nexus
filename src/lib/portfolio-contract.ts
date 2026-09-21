export type PortableRepoState = "Clean" | "Changes" | "No History";

export type PortableProjectSnapshot = {
  name: string;
  branch: string;
  head: string;
  state: PortableRepoState;
  dirtyFiles: number;
  lastCommitAt: string | null;
  category: string;
  activityDays: number;
  signal: number;
  hasGovernance: boolean;
  hasTests: boolean;
  authority: string;
  repositoryId: string | null;
};

export type PortablePortfolioSnapshot = {
  schemaVersion: 1;
  source: "local-git";
  owner: string;
  device: string;
  generatedAt: string;
  projectCount: number;
  projects: PortableProjectSnapshot[];
};
const FORBIDDEN_FIELD = /^(password|secret|token|credential|keychainService)$/i;
const STATES = new Set<PortableRepoState>(["Clean", "Changes", "No History"]);

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function integer(value: unknown, label: string, max = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > max) {
    throw new Error(`${label} must be an integer between 0 and ${max}`);
  }
  return value as number;
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} must be boolean`);
  return value;
}
function isoDate(value: unknown, label: string): string {
  const result = text(value, label);
  if (Number.isNaN(Date.parse(result))) throw new Error(`${label} must be a valid date`);
  return result;
}

function nullableDate(value: unknown, label: string): string | null {
  if (value === null) return null;
  return isoDate(value, label);
}

function repositoryId(value: unknown, label: string): string | null {
  if (value === undefined || value === null) return null;
  const result = text(value, label);
  if (result.includes("://") || result.includes("@") || result.includes("?") || result.includes("#") || result.includes("\\")) {
    throw new Error(`${label} must be a normalized repository identity`);
  }
  if (!/^[a-z0-9.-]+\/[a-z0-9._~-]+(?:\/[a-z0-9._~-]+)+$/i.test(result)) {
    throw new Error(`${label} must be host/path/repository`);
  }
  return result;
}

function rejectSensitiveShape(value: unknown): void {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_FIELD.test(key)) throw new Error(`Portfolio snapshot contains forbidden field: ${key}`);
    rejectSensitiveShape(child);
  }
}

function parseProject(value: unknown, index: number): PortableProjectSnapshot {
  const item = record(value, `projects[${index}]`);
  const state = text(item.state, `projects[${index}].state`) as PortableRepoState;
  if (!STATES.has(state)) throw new Error(`projects[${index}].state is unsupported`);

  return {
    name: text(item.name, `projects[${index}].name`),
    branch: text(item.branch, `projects[${index}].branch`),
    head: text(item.head, `projects[${index}].head`),
    state,
    dirtyFiles: integer(item.dirtyFiles, `projects[${index}].dirtyFiles`),
    lastCommitAt: nullableDate(item.lastCommitAt, `projects[${index}].lastCommitAt`),
    category: text(item.category, `projects[${index}].category`),
    activityDays: integer(item.activityDays, `projects[${index}].activityDays`),
    signal: integer(item.signal, `projects[${index}].signal`, 100),
    hasGovernance: boolean(item.hasGovernance, `projects[${index}].hasGovernance`),
    hasTests: boolean(item.hasTests, `projects[${index}].hasTests`),
    authority: text(item.authority, `projects[${index}].authority`),
    repositoryId: repositoryId(item.repositoryId, `projects[${index}].repositoryId`),
  };
}

export function parsePortablePortfolioSnapshot(value: unknown): PortablePortfolioSnapshot {
  rejectSensitiveShape(value);
  const serialized = JSON.stringify(value);
  if (serialized.includes("/Users/")) throw new Error("Portfolio snapshot must not contain local absolute paths");

  const root = record(value, "portfolio snapshot");
  if (root.schemaVersion !== 1) throw new Error("Unsupported portfolio schemaVersion");
  if (root.source !== "local-git") throw new Error("Unsupported portfolio source");
  if (!Array.isArray(root.projects)) throw new Error("projects must be an array");

  const projects = root.projects.map(parseProject);
  const projectCount = integer(root.projectCount, "projectCount");
  if (projectCount !== projects.length) throw new Error("projectCount does not match projects length");

  return {
    schemaVersion: 1,
    source: "local-git",
    owner: text(root.owner, "owner"),
    device: text(root.device, "device"),
    generatedAt: isoDate(root.generatedAt, "generatedAt"),
    projectCount,
    projects,
  };
}

export function assertPortablePortfolioSnapshot(value: unknown): asserts value is PortablePortfolioSnapshot {
  parsePortablePortfolioSnapshot(value);
}
