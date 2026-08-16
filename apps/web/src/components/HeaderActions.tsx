import { WalletProviders } from './wallet/WalletProviders.tsx';
import { NetworkSwitch } from './NetworkSwitch.tsx';
import { ConnectButton } from './wallet/ConnectButton.tsx';

export function HeaderActions() {
  return (
    <WalletProviders>
      <div className="flex items-center justify-end gap-2">
        <NetworkSwitch />
        <ConnectButton />
      </div>
    </WalletProviders>
  );
}
