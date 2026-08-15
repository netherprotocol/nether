import type { Address } from 'viem';
import sepolia from '../../../../contracts/deployments/base-sepolia.json' with { type: 'json' };

export type DeploymentContracts = {
  grave: Address;
  neth: Address;
  reaper: Address;
  adapter: Address;
};

export function contractsFor(chainId: number): DeploymentContracts | undefined {
  if (chainId === sepolia.chainId) {
    return {
      grave: sepolia.contracts.grave as Address,
      neth: sepolia.contracts.neth as Address,
      reaper: sepolia.contracts.reaper as Address,
      adapter: sepolia.contracts.adapter as Address,
    };
  }
  return undefined;
}
