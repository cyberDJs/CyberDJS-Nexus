import { Dashboard } from "@/components/dashboard";
import { recordPortfolioHistory } from "@/lib/activity-history";
import { loadGitHubCollaboration } from "@/lib/github-collaboration";
import { scanLocalProjects } from "@/lib/local-projects";
import { buildNexusInsights } from "@/lib/nexus-insights";
import { loadRemotePortfolioSources } from "@/lib/remote-portfolios";
import { buildSharedPortfolio } from "@/lib/shared-portfolio";
export const dynamic = "force-dynamic";
export default async function Home() {
  const [snapshot, remoteSources] = await Promise.all([scanLocalProjects(), loadRemotePortfolioSources()]);
  const sharedProjects = buildSharedPortfolio(snapshot, remoteSources);
  const [history, github] = await Promise.all([recordPortfolioHistory(snapshot, remoteSources), loadGitHubCollaboration(sharedProjects)]);
  const insights = buildNexusInsights(sharedProjects, snapshot, remoteSources, history, github);
  return <Dashboard snapshot={snapshot} remoteSources={remoteSources} sharedProjects={sharedProjects} insights={insights} />;
}
