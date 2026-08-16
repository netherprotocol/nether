import { parseAbi } from 'viem';

export const graveAbi = parseAbi([
  'function currentEra() view returns (uint256)',
  'function currentEraBuried() view returns (uint256)',
  'function currentEraCapacity() view returns (uint256)',
  'function currentRewardRate() view returns (uint256)',
  'function quoteBury(uint256 ethAmount) view returns (uint256 nethOut)',
  'function protectedPrincipal() view returns (uint256)',
  'function currentNAV() view returns (uint256)',
  'function harvestableYield() view returns (uint256)',
  'function activeStrategy() view returns (address)',
  'function pendingStrategy() view returns (address adapter, uint256 executeAfter)',
  'function bury(uint256 minNethOut) payable returns (uint256 nethOut)',
]);

export const nethAbi = parseAbi([
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
]);

export const reaperAbi = parseAbi([
  'struct Auction { uint256 id; uint256 ethBudget; uint256 ethRemaining; uint256 snapshottedRewardRate; uint256 startTime; uint256 endTime; uint256 nethBurned; bool active; }',
  'function availableReaperETH() view returns (uint256)',
  'function activeAuction() view returns (Auction)',
  'function currentReaperRate() view returns (uint256)',
  'function quoteReaperSale(uint256 nethAmount) view returns (uint256 ethOut)',
  'function totalNethReaped() view returns (uint256)',
  'function totalHarvestedETH() view returns (uint256)',
  'function sellToReaper(uint256 nethIn, uint256 minEthOut) returns (uint256 ethOut)',
  'function startAuction() returns (uint256 auctionId)',
  'function finalizeAuction()',
]);
