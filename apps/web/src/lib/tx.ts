import type { Abi, Address, Chain, Hex } from 'viem';
import type { PoolClient } from './protocol.ts';

export type WalletWriter = {
  writeContract: (args: {
    account: Address;
    address: Address;
    abi: Abi;
    functionName: string;
    args?: readonly unknown[];
    value?: bigint;
    chain: Chain;
  }) => Promise<Hex>;
};

export async function simulateThenSend(args: {
  publicClient: PoolClient;
  walletClient: WalletWriter;
  account: Address;
  chain: Chain;
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
}): Promise<Hex> {
  const request = {
    account: args.account,
    address: args.address,
    abi: args.abi,
    functionName: args.functionName,
    args: args.args,
    value: args.value,
  };
  await args.publicClient.simulateContract(request as never);
  return args.walletClient.writeContract({
    ...request,
    chain: args.chain,
  });
}

export async function waitOneConfirmation(publicClient: PoolClient, hash: Hex) {
  return publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
}
