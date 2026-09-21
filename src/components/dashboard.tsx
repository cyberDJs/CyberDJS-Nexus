"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FolderGit2, Gauge, GitBranch, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PortfolioSnapshot, RepoState } from "@/lib/local-projects";
import type { RemotePortfolioSource } from "@/lib/remote-portfolios";
import { matchesPortfolioScope, type PortfolioScope, type SharedProject, type SharedProjectSide } from "@/lib/shared-portfolio";

const stateColors: Record<RepoState, string> = { Clean: "#46d8a0", Changes: "#f9bd4a", "No History": "#ff6d7a" };
const categoryColors = ["#6ea8ff", "#ff9f62", "#a38bff", "#42d8b3", "#f9bd4a", "#ff6d7a"];
const driftLabels = { aligned: "Aligned", "head-drift": "HEAD / branch drift", "working-tree": "Local changes", "head-and-working-tree": "HEAD + local changes", "single-source": "Single source" } as const;

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

export function Dashboard({ snapshot, remoteSources, sharedProjects }: { snapshot: PortfolioSnapshot; remoteSources: RemotePortfolioSource[]; sharedProjects: SharedProject[] }) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<PortfolioScope>("All");
  const [state, setState] = useState<"All" | RepoState>("All");
  const [category, setCategory] = useState("All");
  const projects = snapshot.projects;
  const categories = [...new Set(sharedProjects.flatMap((p) => [p.eimy?.category, p.johny?.category]).filter((x): x is string => Boolean(x)))].sort();
  const filtered = useMemo(() => sharedProjects.filter((p) => {
    const sides = [p.eimy, p.johny].filter((x): x is SharedProjectSide => Boolean(x));
    const haystack = `${p.name} ${p.repositoryId ?? ""} ${sides.map((x) => `${x.branch} ${x.head}`).join(" ")}`.toLowerCase();
    return matchesPortfolioScope(p, scope)
      && (state === "All" || sides.some((x) => x.state === state))
      && (category === "All" || sides.some((x) => x.category === category))
      && haystack.includes(query.toLowerCase());
  }), [sharedProjects, scope, state, category, query]);

  const sharedCount = sharedProjects.filter((p) => p.isShared).length;
  const driftCount = sharedProjects.filter((p) => p.isShared && p.drift !== "aligned").length;
  const eimyCount = sharedProjects.filter((p) => p.eimy).length;
  const johnyCount = sharedProjects.filter((p) => p.johny).length;
  const governed = sharedProjects.filter((p) => p.eimy?.hasGovernance || p.johny?.hasGovernance).length;
  const localCategories = [...new Set(projects.map((p) => p.category))].sort();
  const stateData = (["Clean", "Changes", "No History"] as RepoState[]).map((name) => ({ name, value: projects.filter((p) => p.state === name).length, fill: stateColors[name] }));
  const categoryData = localCategories.map((name) => ({ name, value: projects.filter((p) => p.category === name).length }));
  const recent = [...projects].sort((a, b) => a.activityDays - b.activityDays).slice(0, 8);
  const attention = projects.filter((p) => p.state !== "Clean" || p.activityDays > 30).sort((a, b) => b.dirtyFiles - a.dirtyFiles || b.activityDays - a.activityDays).slice(0, 8);

  return <main className="shell">
    <header className="hero"><div><div className="eyebrow"><Gauge size={14}/> CYBERDJS SHARED PROJECT TELEMETRY</div><h1>CyberDJS Nexus</h1><p>Eimy live Git state plus validated cached snapshots from shared collaborators. Source repositories remain read-only.</p></div><div className="hero-meta"><span>Eimy live snapshot</span><strong>{new Date(snapshot.generatedAt).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"})}</strong></div></header>

    <section className="filterbar nexus-filterbar"><label className="searchbox"><Search size={16}/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search project, repository, branch or HEAD"/></label><select value={scope} onChange={(e)=>setScope(e.target.value as PortfolioScope)} aria-label="Portfolio scope"><option>All</option><option>Eimy</option><option>Johny</option><option>Shared</option></select><select value={state} onChange={(e)=>setState(e.target.value as "All"|RepoState)}><option>All</option><option>Clean</option><option>Changes</option><option>No History</option></select><select value={category} onChange={(e)=>setCategory(e.target.value)}><option>All</option>{categories.map((x)=><option key={x}>{x}</option>)}</select><div className="readonly-badge"><ShieldCheck size={15}/> read-only sources</div></section>

    <section className="remote-source-grid">{remoteSources.map((source) => <article key={source.key} className={`remote-source-card ${source.status}`}><div><span className="remote-source-name">{source.label}</span><span className="remote-source-status">{source.status === "ready" ? <CheckCircle2 size={14}/> : source.status === "invalid" ? <AlertTriangle size={14}/> : <RefreshCw size={14}/>} {source.status === "ready" ? "Cached" : source.status === "invalid" ? "Invalid cache" : "Not synced"}</span></div>{source.snapshot ? <><strong>{source.snapshot.projectCount} projects</strong><small>{source.snapshot.device} · generated {new Date(source.snapshot.generatedAt).toLocaleString()}</small></> : <><strong>—</strong><small>{source.message}</small></>}</article>)}</section>

    <section className="stats-grid"><Stat label="Project identities" value={sharedProjects.length} helper="Deduplicated when Git origin is known" icon={<FolderGit2 size={19}/>} tone="#8aa5ff"/><Stat label="Shared" value={sharedCount} helper="Seen by Eimy and Johny" icon={<CheckCircle2 size={19}/>} tone="#46d8a0"/><Stat label="Drift" value={driftCount} helper="Shared projects not aligned" icon={<AlertTriangle size={19}/>} tone="#f9bd4a"/><Stat label="Eimy" value={eimyCount} helper="Live local projects" icon={<RefreshCw size={19}/>} tone="#67b9ff"/><Stat label="Johny" value={johnyCount} helper="Validated cached projects" icon={<GitBranch size={19}/>} tone="#a38bff"/><Stat label="Governed" value={governed} helper="Authority beyond README on either side" icon={<ShieldCheck size={19}/>} tone="#ff8ab3"/></section>

    <Panel title="Shared project matrix" subtitle={`${filtered.length} visible identities · scope ${scope} · dedupe uses normalized Git origin when available`} className="table-panel shared-matrix"><div className="table-scroll"><table><thead><tr><th>Project</th><th>Repository identity</th><th>Eimy</th><th>Johny</th><th>Drift</th></tr></thead><tbody>{filtered.map((p)=><tr key={p.key}><td><strong>{p.name}</strong><span>{p.isShared ? "Shared identity" : p.eimy ? "Eimy only" : "Johny only"}</span></td><td>{p.repositoryId ? <code>{p.repositoryId}</code> : <span className="identity-missing">name-only · not deduplicated</span>}</td><td><SideState side={p.eimy}/></td><td><SideState side={p.johny}/></td><td><span className={`drift-pill ${p.drift}`}>{driftLabels[p.drift]}</span></td></tr>)}</tbody></table>{filtered.length===0&&<div className="empty-state">No projects match this scope and filters.</div>}</div></Panel>

    <div className="dashboard-grid primary-grid"><Panel title="Eimy repository state" subtitle="Live working-tree state on VoodooBook"><div className="chart-box short"><ResponsiveContainer width="100%" height="100%"><BarChart data={stateData} margin={{top:10,right:4,left:-28,bottom:0}}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#273451"/><XAxis dataKey="name" tick={{fill:"#8190ad",fontSize:11}} axisLine={false} tickLine={false}/><YAxis allowDecimals={false} tick={{fill:"#8190ad",fontSize:11}} axisLine={false} tickLine={false}/><Tooltip contentStyle={{background:"#111a2d",border:"1px solid #2c3a58",borderRadius:12}}/><Bar dataKey="value" radius={[7,7,2,2]}>{stateData.map((x)=><Cell key={x.name} fill={x.fill}/>)}</Bar></BarChart></ResponsiveContainer></div></Panel>
    <Panel title="Eimy stack mix" subtitle="Detected from local repository entry files"><div className="donut-wrap"><div className="chart-box donut"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={categoryData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={82} paddingAngle={3}>{categoryData.map((x,i)=><Cell key={x.name} fill={categoryColors[i%categoryColors.length]}/>)}</Pie><Tooltip contentStyle={{background:"#111a2d",border:"1px solid #2c3a58",borderRadius:12}}/></PieChart></ResponsiveContainer><div className="donut-center"><strong>{projects.length}</strong><span>repos</span></div></div><div className="legend-list">{categoryData.map((x,i)=><div key={x.name}><span><i style={{background:categoryColors[i%categoryColors.length]}}/>{x.name}</span><strong>{x.value}</strong></div>)}</div></div></Panel>
    <Panel title="Governance coverage" subtitle="Across unified project identities"><div className="coverage-big"><strong>{sharedProjects.length ? Math.round(governed/sharedProjects.length*100) : 0}%</strong><span>{governed} of {sharedProjects.length} identities</span><div className="budget-meter"><i style={{width:`${sharedProjects.length ? governed/sharedProjects.length*100 : 0}%`}}/></div><p>Remote identity is metadata only. No collaborator source tree is mounted or modified.</p></div></Panel></div>

    <div className="dashboard-grid lower-grid"><Panel title="Eimy recent activity" subtitle="Local repositories with newest commits"><div className="milestone-list">{recent.map((p)=><div key={p.path}><span className="milestone-dot" style={{background:p.activityDays<=7?"#46d8a0":"#67b9ff"}}/><div><strong>{p.name}</strong><small>{p.lastSubject}</small></div><time>{relative(p.activityDays)}</time></div>)}</div></Panel><Panel title="Eimy attention queue" subtitle="Dirty, stale or history-less local repositories"><div className="risk-list">{attention.length ? attention.map((p)=><div key={p.path} className={`risk-item ${p.state==="Changes"?"medium":"info"}`}><span className="risk-icon">{p.state==="Changes"?<AlertTriangle size={19}/>:<Gauge size={19}/>}</span><div><strong>{p.name}</strong><small>{p.state === "Changes" ? `${p.dirtyFiles} changed paths` : `${relative(p.activityDays)} · ${p.state}`}</small></div><b>{p.signal}</b></div>) : <div className="empty-state">Nothing needs attention.</div>}</div></Panel></div>
    <footer><span>CyberDJS Nexus · shared portfolio slice</span><span><ShieldCheck size={14}/> Git metadata only · no source mutation</span></footer>
  </main>;
}
