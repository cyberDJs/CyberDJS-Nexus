export type RemotePortfolioKey = "eimy" | "johny";

export type RemotePortfolioDefinition = {
  key: RemotePortfolioKey;
  label: string;
  expectedOwner: string;
  remotePath: string;
};

export const REMOTE_PORTFOLIOS: readonly RemotePortfolioDefinition[] = Object.freeze([
  { key: "eimy", label: "Eimy", expectedOwner: "Eimy", remotePath: "ProjectCommandCenter/eimy-latest.json" },
  { key: "johny", label: "Johny", expectedOwner: "Johny", remotePath: "ProjectCommandCenter/johny-latest.json" },
]);

export function remotePortfolioDefinition(key: RemotePortfolioKey): RemotePortfolioDefinition {
  const definition = REMOTE_PORTFOLIOS.find((item) => item.key === key);
  if (!definition) throw new Error(`Unknown remote portfolio source: ${key}`);
  return definition;
}
