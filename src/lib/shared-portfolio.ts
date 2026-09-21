import type { PortfolioSnapshot, ProjectSnapshot, RepoState } from "./local-projects";
import type { PortableProjectSnapshot } from "./portfolio-contract";
import type { RemotePortfolioSource } from "./remote-portfolios";

export type PortfolioOwner = "Eimy" | "Johny";
export type PortfolioScope = "All" | PortfolioOwner | "Shared";
export type RepositoryNamespace = "cyberdjs" | "eimyroot" | "horsedriver" | "external" | "unknown";
export type RepositoryNamespaceScope = "All" | RepositoryNamespace;
export type DriftState = "aligned" | "head-drift" | "working-tree" | "head-and-working-tree" | "single-source";

export function ownerForLocalRoot(root: string): PortfolioOwner {
  const normalized = root.replace(/\/+$/, "");
  if (normalized === "/Users/eimyna/0_DEV") return "Eimy";
  if (normalized === "/Users/horsedriver/0_DEV") return "Johny";
  throw new Error(`Unsupported local portfolio root for owner attribution: ${root}`);
}

export function repositoryNamespaceFor(repositoryId: string | null): RepositoryNamespace {
  if (!repositoryId) return "unknown";
  const [host = "", namespace = ""] = repositoryId.split("/");
  if (host.toLowerCase() !== "github.com" || !namespace) return "external";
  const normalized = namespace.toLowerCase();
  if (normalized === "cyberdjs") return "cyberdjs";
  if (normalized === "eimyroot") return "eimyroot";
  if (normalized === "horsedriver") return "horsedriver";
  return "external";
}

export type SharedProjectSide = {
  owner: PortfolioOwner;
  source: "local" | "remote";
  branch: string;
  head: string;
  state: RepoState;
  dirtyFiles: number;
  category: string;
  activityDays: number;
  signal: number;
  hasGovernance: boolean;
  hasTests: boolean;
  authority: string;
};

export type SharedProject = {
  key: string;
  name: string;
  repositoryId: string | null;
  repositoryNamespace: RepositoryNamespace;
  eimy: SharedProjectSide | null;
  johny: SharedProjectSide | null;
  isShared: boolean;
  drift: DriftState;
};

type ProjectLike = Pick<ProjectSnapshot | PortableProjectSnapshot,
  "name" | "repositoryId" | "branch" | "head" | "state" | "dirtyFiles" | "category" |
  "activityDays" | "signal" | "hasGovernance" | "hasTests" | "authority">;

function side(owner: PortfolioOwner, source: "local" | "remote", project: ProjectLike): SharedProjectSide {
  return { owner, source, branch: project.branch, head: project.head, state: project.state, dirtyFiles: project.dirtyFiles,
    category: project.category, activityDays: project.activityDays, signal: project.signal, hasGovernance: project.hasGovernance,
    hasTests: project.hasTests, authority: project.authority };
}

function keyFor(owner: PortfolioOwner, project: ProjectLike) {
  return project.repositoryId ? `repo:${project.repositoryId}` : `${owner.toLowerCase()}:name:${project.name.toLowerCase()}`;
}

function driftFor(eimy: SharedProjectSide | null, johny: SharedProjectSide | null): DriftState {
  if (!eimy || !johny) return "single-source";
  const headDrift = eimy.head !== johny.head || eimy.branch !== johny.branch;
  const workingTree = eimy.state === "Changes" || johny.state === "Changes";
  if (headDrift && workingTree) return "head-and-working-tree";
  if (headDrift) return "head-drift";
  if (workingTree) return "working-tree";
  return "aligned";
}

export function buildSharedPortfolio(local: PortfolioSnapshot, remoteSources: RemotePortfolioSource[]): SharedProject[] {
  const map = new Map<string, SharedProject>();
  const add = (owner: PortfolioOwner, source: "local" | "remote", project: ProjectLike) => {
    const key = keyFor(owner, project);
    const current = map.get(key) ?? { key, name: project.name, repositoryId: project.repositoryId, repositoryNamespace: repositoryNamespaceFor(project.repositoryId), eimy: null, johny: null, isShared: false, drift: "single-source" as DriftState };
    if (owner === "Eimy") current.eimy = side(owner, source, project);
    else current.johny = side(owner, source, project);
    current.isShared = Boolean(current.eimy && current.johny);
    current.drift = driftFor(current.eimy, current.johny);
    map.set(key, current);
  };

  const localOwner = ownerForLocalRoot(local.root);
  local.projects.forEach((project) => add(localOwner, "local", project));

  remoteSources
    .filter((source) => source.status === "ready" && source.snapshot && source.snapshot.owner !== localOwner)
    .forEach((source) => {
      const owner = source.snapshot!.owner as PortfolioOwner;
      source.snapshot!.projects.forEach((project) => add(owner, "remote", project));
    });

  return [...map.values()].sort((a, b) => Number(b.isShared) - Number(a.isShared) || a.name.localeCompare(b.name));
}

export function matchesPortfolioScope(project: SharedProject, scope: PortfolioScope): boolean {
  if (scope === "All") return true;
  if (scope === "Shared") return project.isShared;
  return scope === "Eimy" ? Boolean(project.eimy) : Boolean(project.johny);
}

export function matchesRepositoryNamespace(project: SharedProject, scope: RepositoryNamespaceScope): boolean {
  return scope === "All" || project.repositoryNamespace === scope;
}
