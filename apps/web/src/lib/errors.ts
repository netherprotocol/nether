import { BaseError, ContractFunctionRevertedError } from 'viem';
import { isUserRejected } from './chainSwitch.ts';

export { isUserRejected };

export function revertErrorName(error: unknown): string | undefined {
  if (error instanceof ContractFunctionRevertedError) {
    return error.data?.errorName;
  }
  if (error instanceof BaseError) {
    const walked = error.walk((candidate) => candidate instanceof ContractFunctionRevertedError);
    if (walked instanceof ContractFunctionRevertedError) {
      return walked.data?.errorName;
    }
  }
  return undefined;
}

export function revertShortMessage(error: unknown): string {
  const name = revertErrorName(error);
  if (name) {
    return name;
  }
  if (error && typeof error === 'object' && 'shortMessage' in error) {
    const short = (error as { shortMessage?: unknown }).shortMessage;
    if (typeof short === 'string' && short.trim()) {
      return short.trim();
    }
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message.split('\n')[0]!.trim();
  }
  return 'Transaction would revert';
}
