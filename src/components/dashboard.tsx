"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FolderGit2, Gauge, GitBranch, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PortfolioSnapshot, RepoState } from "@/lib/local-projects";
import type { RemotePortfolioSource } from "@/lib/remote-portfolios";
import { matchesPortfolioScope, matchesRepositoryNamespace, ownerForLocalRoot, type PortfolioOwner, type PortfolioScope, type RepositoryNamespaceScope, type SharedProject, type SharedProjectSide } from "@/lib/shared-portfolio";

const stateColors: Record<RepoState, string> = { Clean: "#46d8a0", Changes: "#f9bd4a", "No History": "#ff6d7a" };
const personaColors: Record<PortfolioOwner, string> = { Eimy: "#67b9ff", Johny: "#a38bff" };
const driftLabels = { aligned: "Aligned", "head-drift": "HEAD / branch drift", "working-tree": "Local changes", "head-and-working-tree": "HEAD + local changes", "single-source": "Single source" } as const;
const namespaceLabels: Record<RepositoryNamespaceScope, string> = { All: "All namespaces", cyberdjs: "CyberDJS", eimyroot: "Eimy · eimyroot", horsedriver: "Johny · horsedriver", external: "External", unknown: "Unknown" };

type PersonaEntry = SharedProjectSide & { name: string; repositoryId: string | null };

function Panel({ title, subtitle, children, className = "" }: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return <section className={`panel ${className}`}><div className="panel-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div></div>{children}</section>;
}
function Stat({ label, value, helper, icon, tone }: { label: string; value: string | number; helper: string; icon: React.ReactNode; tone: string }) {
  return <div className="stat-card" style={{ "--tone": tone } as React.CSSProperties}><div className="stat-top"><span>{label}</span><span className="icon-bubble">{icon}</span></div><strong>{value}</strong><small>{helper}</small></div>;
}
function SideState({ side }: { side: SharedProjectSide | null }) {
  if (!side) return <span className="source-missing">—</span>;
  return <div className="side-state"><span className="status-pill" style={{ "--status-color": stateColors[side.state] } as React.CSSProperties}>{side.state}{side.dirtyFiles ? ` · ${side.dirtyFiles}` : ""}</span><code>{side.branch} · {side.head}</code></div>;
}
const relative = (days: number) => days === 9999 ? "No history" : days === 0 ? "Today" : days === 1 ? "Yesterday" : `${days}d ago`;

function personaEntries(projects: SharedProject[], owner: PortfolioOwner): PersonaEntry[] {
  return projects.flatMap((project) => {
    const value = owner === "Eimy" ? project.eimy : project.johny;
    return value ? [{ ...value, name: project.name, repositoryId: project.repositoryId }] : [];
  });
}
function sourceHelper(entries: PersonaEntry[]) {
  if (entries.some((entry) => entry.source === "local")) return "Live local projects";
  if (entries.some((entry) => entry.source === "remote")) return "Validated cached projects";
  return "No portfolio data";
}
function ActivityList({ entries }: { entries: PersonaEntry[] }) {
  const recent = [...entries].sort((a, b) => a.activityDays - b.activityDays || a.name.localeCompare(b.name)).slice(0, 5);
  return <div className="milestone-list">{recent.length ? recent.map((entry) => <div key={`${entry.owner}:${entry.name}:${entry.repositoryId ?? "none"}`}><span className="milestone-dot" style={{ background: personaColors[entry.owner] }}/><div><strong>{entry.name}</strong><small>{entry.branch} · {entry.head}</small></div><time>{relative(entry.activityDays)}</time></div>) : <div className="empty-state compact">No data.</div>}</div>;
}
function AttentionList({ entries }: { entries: PersonaEntry[] }) {
  const attention = entries.filter((entry) => entry.state !== "Clean" || entry.activityDays > 30).sort((a, b) => b.dirtyFiles - a.dirtyFiles || b.activityDays - a.activityDays).slice(0, 5);
  return <div className="risk-list">{attention.length ? attention.map((entry) => <div key={`${entry.owner}:${entry.name}:${entry.repositoryId ?? "none"}`} className={`risk-item ${entry.state === "Changes" ? "medium" : "info"}`}><span className="risk-icon">{entry.state === "Changes" ? <AlertTriangle size={19}/> : <Gauge size={19}/>}</span><div><strong>{entry.name}</strong><small>{entry.state === "Changes" ? `${entry.dirtyFiles} changed paths` : `${relative(entry.activityDays)} · ${entry.state}`}</small></div><b>{entry.signal}</b></div>) : <div className="empty-state compact">Nothing needs attention.</div>}</div>;
}

export function Dashboard({ snapshot, remoteSources, sharedProjects }: { snapshot: PortfolioSnapshot; remoteSources: RemotePortfolioSource[]; sharedProjects: SharedProject[] }) {
  const localOwner = ownerForLocalRoot(snapshot.root);
  const collaborator: PortfolioOwner = localOwner === "Eimy" ? "Johny" : "Eimy";
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<PortfolioScope>("All");
  const [namespaceScope, setNamespaceScope] = useState<RepositoryNamespaceScope>("All");
  const [state, setState] = useState<"All" | RepoState>("All");
  const [category, setCategory] = useState("All");
  const categories = [...new Set(sharedProjects.flatMap((p) => [p.eimy?.category, p.johny?.category]).filter((x): x is string => Boolean(x)))].sort();
  const filtered = useMemo(() => sharedProjects.filter((p) => {
    const sides = [p.eimy, p.johny].filter((x): x is SharedProjectSide => Boolean(x));
    const haystack = `${p.name} ${p.repositoryId ?? ""} ${p.repositoryNamespace} ${sides.map((x) => `${x.branch} ${x.head}`).join(" ")}`.toLowerCase();
    return matchesPortfolioScope(p, scope)
      && matchesRepositoryNamespace(p, namespaceScope)
      && (state === "All" || sides.some((x) => x.state === state))
      && (category === "All" || sides.some((x) => x.category === category))
      && haystack.includes(query.toLowerCase());
  }), [sharedProjects, scope, namespaceScope, state, category, query]);

  const eimyEntries = personaEntries(sharedProjects, "Eimy");
  const johnyEntries = personaEntries(sharedProjects, "Johny");
  const sharedCount = sharedProjects.filter((p) => p.isShared).length;
  const driftCount = sharedProjects.filter((p) => p.isShared && p.drift !== "aligned").length;
  const eimyGoverned = eimyEntries.filter((p) => p.hasGovernance).length;
  const johnyGoverned = johnyEntries.filter((p) => p.hasGovernance).length;
  const governed = sharedProjects.filter((p) => p.eimy?.hasGovernance || p.johny?.hasGovernance).length;
  const stateData = (["Clean", "Changes", "No History"] as RepoState[]).map((name) => ({ name, Eimy: eimyEntries.filter((p) => p.state === name).length, Johny: johnyEntries.filter((p) => p.state === name).length }));
  const categoryData = categories.map((name) => ({ name, Eimy: eimyEntries.filter((p) => p.category === name).length, Johny: johnyEntries.filter((p) => p.category === name).length }));
  const pct = (part: number, total: number) => total ? Math.round(part / total * 100) : 0;

  return <main className="shell">
    <header className="hero"><div><div className="eyebrow"><Gauge size={14}/> CYBERDJS SHARED PROJECT TELEMETRY</div><h1>CyberDJS Nexus</h1><p>Symmetric Eimy + Johny project telemetry. Local and cached measurements stay persona-separated; repository namespace is an independent axis.</p></div><div className="hero-meta"><span>{localOwner} live snapshot</span><strong>{new Date(snapshot.generatedAt).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"})}</strong></div></header>

    <section className="filterbar nexus-filterbar"><label className="searchbox"><Search size={16}/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search project, namespace, repository, branch or HEAD"/></label><select value={scope} onChange={(e)=>setScope(e.target.value as PortfolioScope)} aria-label="Persona presence"><option>All</option><option>Eimy</option><option>Johny</option><option>Shared</option></select><select value={namespaceScope} onChange={(e)=>setNamespaceScope(e.target.value as RepositoryNamespaceScope)} aria-label="Repository namespace"><option value="All">All namespaces</option><option value="cyberdjs">CyberDJS</option><option value="eimyroot">Eimy · eimyroot</option><option value="horsedriver">Johny · horsedriver</option><option value="external">External</option><option value="unknown">Unknown</option></select><select value={state} onChange={(e)=>setState(e.target.value as "All"|RepoState)} aria-label="Repository state"><option>All</option><option>Clean</option><option>Changes</option><option>No History</option></select><select value={category} onChange={(e)=>setCategory(e.target.value)} aria-label="Stack category"><option>All</option>{categories.map((x)=><option key={x}>{x}</option>)}</select><div className="readonly-badge"><ShieldCheck size={15}/> read-only sources</div></section>

    <section className="remote-source-grid">{remoteSources.map((source) => <article key={source.key} className={`remote-source-card ${source.status}`}><div><span className="remote-source-name">{source.label}{source.label === localOwner ? " · local persona cache" : " · collaborator cache"}</span><span className="remote-source-status">{source.status === "ready" ? <CheckCircle2 size={14}/> : source.status === "invalid" ? <AlertTriangle size={14}/> : <RefreshCw size={14}/>} {source.status === "ready" ? "Cached" : source.status === "invalid" ? "Invalid cache" : "Not synced"}</span></div>{source.snapshot ? <><strong>{source.snapshot.projectCount} projects</strong><small>{source.snapshot.device} · generated {new Date(source.snapshot.generatedAt).toLocaleString()}</small></> : <><strong>—</strong><small>{source.message}</small></>}</article>)}</section>

    <section className="stats-grid"><Stat label="Project identities" value={sharedProjects.length} helper="Deduplicated only by repositoryId" icon={<FolderGit2 size={19}/>} tone="#8aa5ff"/><Stat label="Shared" value={sharedCount} helper="Seen by both personas" icon={<CheckCircle2 size={19}/>} tone="#46d8a0"/><Stat label="Drift" value={driftCount} helper="Shared identities not aligned" icon={<AlertTriangle size={19}/>} tone="#f9bd4a"/><Stat label="Eimy" value={eimyEntries.length} helper={sourceHelper(eimyEntries)} icon={<RefreshCw size={19}/>} tone={personaColors.Eimy}/><Stat label="Johny" value={johnyEntries.length} helper={sourceHelper(johnyEntries)} icon={<GitBranch size={19}/>} tone={personaColors.Johny}/><Stat label="Governed" value={governed} helper={`Eimy ${eimyGoverned} · Johny ${johnyGoverned}`} icon={<ShieldCheck size={19}/>} tone="#ff8ab3"/></section>

    <Panel title="Shared project matrix" subtitle={`${filtered.length} visible identities · persona ${scope} · namespace ${namespaceLabels[namespaceScope]} · repositoryId-only dedupe`} className="table-panel shared-matrix"><div className="table-scroll"><table><thead><tr><th>Project</th><th>Namespace</th><th>Repository identity</th><th>Eimy</th><th>Johny</th><th>Drift</th></tr></thead><tbody>{filtered.map((p)=><tr key={p.key}><td><strong>{p.name}</strong><span>{p.isShared ? "Shared identity" : p.eimy ? "Eimy only" : "Johny only"}</span></td><td><span className={`namespace-pill ${p.repositoryNamespace}`}>{namespaceLabels[p.repositoryNamespace]}</span></td><td>{p.repositoryId ? <code>{p.repositoryId}</code> : <span className="identity-missing">name-only · not deduplicated</span>}</td><td><SideState side={p.eimy}/></td><td><SideState side={p.johny}/></td><td><span className={`drift-pill ${p.drift}`}>{driftLabels[p.drift]}</span></td></tr>)}</tbody></table>{filtered.length===0&&<div className="empty-state">No projects match this persona, namespace and filters.</div>}</div></Panel>

    <div className="dashboard-grid primary-grid"><Panel title="Repository state by persona" subtitle="Same metric, independently measurable for Eimy and Johny"><div className="chart-box short"><ResponsiveContainer width="100%" height="100%"><BarChart data={stateData} margin={{top:10,right:4,left:-28,bottom:0}}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#273451"/><XAxis dataKey="name" tick={{fill:"#8190ad",fontSize:11}} axisLine={false} tickLine={false}/><YAxis allowDecimals={false} tick={{fill:"#8190ad",fontSize:11}} axisLine={false} tickLine={false}/><Tooltip contentStyle={{background:"#111a2d",border:"1px solid #2c3a58",borderRadius:12}}/><Legend/><Bar dataKey="Eimy" fill={personaColors.Eimy} radius={[5,5,2,2]}/><Bar dataKey="Johny" fill={personaColors.Johny} radius={[5,5,2,2]}/></BarChart></ResponsiveContainer></div></Panel>
    <Panel title="Stack mix by persona" subtitle="Detected stack categories remain separable"><div className="chart-box short"><ResponsiveContainer width="100%" height="100%"><BarChart data={categoryData} margin={{top:10,right:4,left:-28,bottom:18}}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#273451"/><XAxis dataKey="name" tick={{fill:"#8190ad",fontSize:9}} axisLine={false} tickLine={false} interval={0} angle={-18} textAnchor="end"/><YAxis allowDecimals={false} tick={{fill:"#8190ad",fontSize:11}} axisLine={false} tickLine={false}/><Tooltip contentStyle={{background:"#111a2d",border:"1px solid #2c3a58",borderRadius:12}}/><Legend/><Bar dataKey="Eimy" fill={personaColors.Eimy} radius={[5,5,2,2]}/><Bar dataKey="Johny" fill={personaColors.Johny} radius={[5,5,2,2]}/></BarChart></ResponsiveContainer></div></Panel>
    <Panel title="Governance coverage by persona" subtitle="Authority beyond README is measured independently"><div className="persona-coverage"><div><span>Eimy</span><strong>{pct(eimyGoverned, eimyEntries.length)}%</strong><small>{eimyGoverned} of {eimyEntries.length}</small><div className="budget-meter"><i style={{width:`${pct(eimyGoverned, eimyEntries.length)}%`, background: personaColors.Eimy}}/></div></div><div><span>Johny</span><strong>{pct(johnyGoverned, johnyEntries.length)}%</strong><small>{johnyGoverned} of {johnyEntries.length}</small><div className="budget-meter"><i style={{width:`${pct(johnyGoverned, johnyEntries.length)}%`, background: personaColors.Johny}}/></div></div><p>Persona is the measured source. Namespace describes where the repository lives. Shared is presence on both sides, not a third owner.</p></div></Panel></div>

    <div className="dashboard-grid lower-grid"><Panel title="Recent activity by persona" subtitle={`${localOwner} is live here; ${collaborator} is read from validated cache when available`}><div className="persona-split"><div><h3>Eimy</h3><ActivityList entries={eimyEntries}/></div><div><h3>Johny</h3><ActivityList entries={johnyEntries}/></div></div></Panel><Panel title="Attention queue by persona" subtitle="Dirty, stale or history-less repositories stay attributable"><div className="persona-split stacked"><div><h3>Eimy</h3><AttentionList entries={eimyEntries}/></div><div><h3>Johny</h3><AttentionList entries={johnyEntries}/></div></div></Panel></div>
    <footer><span>CyberDJS Nexus · Eimy + Johny symmetric telemetry</span><span><ShieldCheck size={14}/> Git metadata only · no source mutation</span></footer>
  </main>;
}
