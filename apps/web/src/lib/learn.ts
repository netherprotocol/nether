import { contractsFor, type DeploymentContracts } from './deployments.ts';
import {
  NETWORK_ORDER,
  NETWORKS,
  explorerAddressUrl,
  type NetworkConfig,
} from './networks.ts';

export const GROSS_NETH_PER_ERA = 10_000_000;

export const ERA_TABLE = [
  { era: 0, ethCapacity: 10, nethPerEth: 1_000_000, grossNeth: GROSS_NETH_PER_ERA },
  { era: 1, ethCapacity: 20, nethPerEth: 500_000, grossNeth: GROSS_NETH_PER_ERA },
  { era: 2, ethCapacity: 40, nethPerEth: 250_000, grossNeth: GROSS_NETH_PER_ERA },
  { era: 3, ethCapacity: 80, nethPerEth: 125_000, grossNeth: GROSS_NETH_PER_ERA },
  { era: 4, ethCapacity: 160, nethPerEth: 62_500, grossNeth: GROSS_NETH_PER_ERA },
] as const;

export type AuditReport = {
  title: string;
  href: string;
  independentProduction: boolean;
};

export const AUDIT_REPORTS: readonly AuditReport[] = [];

export type MarketListing = {
  name: string;
  href: string;
  venue: string;
};

export const OFFICIAL_MARKETS: readonly MarketListing[] = [];

export const HAS_PROTOCOL_PRESALE = false;

export const CONTRACT_LABELS = [
  ['neth', 'NETH'],
  ['grave', 'Grave'],
  ['reaper', 'Reaper'],
  ['adapter', 'Strategy'],
] as const satisfies readonly (readonly [keyof DeploymentContracts, string])[];

export type ContractDirectoryEntry = {
  network: NetworkConfig;
  contracts: DeploymentContracts | undefined;
};

export function hasIndependentProductionAudit(): boolean {
  return AUDIT_REPORTS.some((report) => report.independentProduction);
}

export function formatLearnNumber(value: number): string {
  return value.toLocaleString('en-US');
}

export function contractDirectory(): ContractDirectoryEntry[] {
  return NETWORK_ORDER.map((id) => {
    const network = NETWORKS[id];
    return { network, contracts: contractsFor(network.chainId) };
  });
}

export function contractExplorerUrl(network: NetworkConfig, address: string): string {
  return explorerAddressUrl(network, address);
}
