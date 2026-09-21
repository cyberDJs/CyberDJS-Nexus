import { Dashboard } from "@/components/dashboard";
import { scanLocalProjects } from "@/lib/local-projects";
import { loadRemotePortfolioSources } from "@/lib/remote-portfolios";
import { buildSharedPortfolio } from "@/lib/shared-portfolio";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [snapshot, remoteSources] = await Promise.all([
    scanLocalProjects(),
    loadRemotePortfolioSources(),
  ]);
  const sharedProjects = buildSharedPortfolio(snapshot, remoteSources);
  return <Dashboard snapshot={snapshot} remoteSources={remoteSources} sharedProjects={sharedProjects} />;
}
