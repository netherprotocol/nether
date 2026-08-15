import { parseAbi } from 'viem';

export const graveAbi = parseAbi([
  'function harvestableYield() view returns (uint256)',
  'function currentNAV() view returns (uint256)',
  'function protectedPrincipal() view returns (uint256)',
  'function activeStrategy() view returns (address)',
  'function reaper() view returns (address)',
  'function pendingStrategy() view returns (address adapter, uint256 executeAfter)',
  'function harvest() returns (uint256 ethHarvested)',
  'event YieldHarvested(uint256 ethAmount, uint256 reaperBalance)',
  'error NoHarvestableYield()',
  'error ZeroHarvest()',
  'error ReaperNotSet()',
  'error HarvestBreachesPrincipal()',
]);

export const reaperAbi = parseAbi([
  'struct Auction { uint256 id; uint256 ethBudget; uint256 ethRemaining; uint256 snapshottedRewardRate; uint256 startTime; uint256 endTime; uint256 nethBurned; bool active; }',
  'function availableReaperETH() view returns (uint256)',
  'function activeAuction() view returns (Auction)',
  'function startAuction() returns (uint256 auctionId)',
  'function finalizeAuction()',
  'event ReapingStarted(uint256 indexed auctionId, uint256 ethBudget, uint256 snapshottedRewardRate, uint256 startTime, uint256 endTime)',
  'event ReapingFinalized(uint256 indexed auctionId, uint256 ethSpent, uint256 nethBurned, uint256 ethRolledOver)',
  'error AuctionActive()',
  'error ZeroValue()',
  'error NoActiveAuction()',
  'error AuctionNotExpired()',
  'error ZeroRewardRate()',
]);
