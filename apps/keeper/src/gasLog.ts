import fs from 'node:fs';
import path from 'node:path';

export type CrankAction = 'harvest' | 'startAuction' | 'finalizeAuction' | 'recoverImpaired';

export type GasDetail = Record<string, string>;

export type GasRecord = {
  ts: string;
  chainId: number;
  action: CrankAction;
  sent: boolean;
  tx: string | null;
  blockNumber: string | null;
  gasUsed: string | null;
  effectiveGasPrice: string | null;
  l1Fee: string;
  feeWei: string;
  sessionFeeWei: string;
  lifetimeFeeWei: string;
  detail: GasDetail | null;
  skipReason?: string;
};

export type GasStore = {
  path: string;
  sessionFeeWei: bigint;
  lifetimeFeeWei: bigint;
};

export function openGasLog(filePath: string): GasStore {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  let lifetimeFeeWei = 0n;
  if (fs.existsSync(filePath)) {
    const text = fs.readFileSync(filePath, 'utf8');
    for (const line of text.split('\n')) {
      if (line.trim() === '') {
        continue;
      }
      try {
        const parsed = JSON.parse(line) as { sent?: unknown; feeWei?: unknown };
        if (parsed.sent === true && typeof parsed.feeWei === 'string') {
          lifetimeFeeWei += BigInt(parsed.feeWei);
        }
      } catch {
        continue;
      }
    }
  } else {
    fs.writeFileSync(filePath, '', 'utf8');
  }
  return { path: filePath, sessionFeeWei: 0n, lifetimeFeeWei };
}

export function appendGasRecord(
  store: GasStore,
  input: {
    chainId: number;
    action: CrankAction;
    sent: boolean;
    tx?: string | null;
    blockNumber?: bigint | null;
    gasUsed?: bigint | null;
    effectiveGasPrice?: bigint | null;
    l1Fee?: bigint;
    feeWei: bigint;
    detail?: GasDetail | null;
    skipReason?: string;
    ts?: string;
  },
): GasRecord {
  if (input.sent) {
    store.sessionFeeWei += input.feeWei;
    store.lifetimeFeeWei += input.feeWei;
  }
  const record: GasRecord = {
    ts: input.ts ?? new Date().toISOString(),
    chainId: input.chainId,
    action: input.action,
    sent: input.sent,
    tx: input.tx ?? null,
    blockNumber: input.blockNumber == null ? null : input.blockNumber.toString(),
    gasUsed: input.gasUsed == null ? null : input.gasUsed.toString(),
    effectiveGasPrice: input.effectiveGasPrice == null ? null : input.effectiveGasPrice.toString(),
    l1Fee: (input.l1Fee ?? 0n).toString(),
    feeWei: input.feeWei.toString(),
    sessionFeeWei: store.sessionFeeWei.toString(),
    lifetimeFeeWei: store.lifetimeFeeWei.toString(),
    detail: input.detail ?? null,
  };
  if (input.skipReason !== undefined) {
    record.skipReason = input.skipReason;
  }
  fs.appendFileSync(store.path, `${JSON.stringify(record)}\n`, 'utf8');
  return record;
}
