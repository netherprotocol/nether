// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.36;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {NETH} from "./NETH.sol";
import {Grave} from "./Grave.sol";

contract Reaper is ReentrancyGuard {
    uint256 internal constant AUCTION_DURATION = 7 days;
    uint256 internal constant START_NUM = 200;
    uint256 internal constant SLOPE_NUM = 95;
    uint256 internal constant DENOM = 100;
    uint256 internal constant WAD = 1 ether;

    struct Auction {
        uint256 id;
        uint256 ethBudget;
        uint256 ethRemaining;
        uint256 snapshottedRewardRate;
        uint256 startTime;
        uint256 endTime;
        uint256 nethBurned;
        bool active;
    }

    NETH public immutable neth;
    Grave public immutable grave;

    uint256 public availableReaperETH;
    uint256 public totalNethReaped;
    uint256 public totalHarvestedETH;
    uint256 public totalDonatedETH;

    Auction internal _auction;

    error ZeroAddress();
    error NotContract();
    error ZeroValue();
    error ZeroEthOut();
    error ZeroRewardRate();
    error AuctionActive();
    error NoActiveAuction();
    error AuctionExpired();
    error AuctionNotExpired();
    error InsufficientEthOut(uint256 ethOut, uint256 minEthOut);

    event ReapingStarted(
        uint256 indexed auctionId, uint256 ethBudget, uint256 snapshottedRewardRate, uint256 startTime, uint256 endTime
    );
    event Reaped(uint256 indexed auctionId, address indexed seller, uint256 nethBurned, uint256 ethPaid, uint256 rate);
    event ReapingFinalized(uint256 indexed auctionId, uint256 ethSpent, uint256 nethBurned, uint256 ethRolledOver);
    event ReaperDonation(address indexed from, uint256 amount);

    constructor(address neth_, address grave_) {
        if (neth_ == address(0) || grave_ == address(0)) {
            revert ZeroAddress();
        }
        if (neth_.code.length == 0 || grave_.code.length == 0) {
            revert NotContract();
        }
        neth = NETH(neth_);
        grave = Grave(payable(grave_));
    }

    receive() external payable {
        if (msg.value == 0) {
            return;
        }
        availableReaperETH += msg.value;
        if (msg.sender == address(grave)) {
            totalHarvestedETH += msg.value;
        } else {
            totalDonatedETH += msg.value;
            emit ReaperDonation(msg.sender, msg.value);
        }
    }

    function activeAuction() external view returns (Auction memory) {
        return _auction;
    }

    function currentReaperRate() public view returns (uint256) {
        if (!_auction.active) {
            return 0;
        }
        return _rateAt(_elapsed(), _auction.snapshottedRewardRate);
    }

    function quoteReaperSale(uint256 nethAmount) external view returns (uint256 ethOut) {
        (, ethOut,) = _quote(nethAmount);
    }

    function startAuction() external nonReentrant returns (uint256 auctionId) {
        _collectSurplus();
        if (_auction.active) {
            revert AuctionActive();
        }
        uint256 budget = availableReaperETH;
        if (budget == 0) {
            revert ZeroValue();
        }
        uint256 r = grave.currentRewardRate();
        if (r == 0) {
            revert ZeroRewardRate();
        }

        availableReaperETH = 0;
        auctionId = _auction.id + 1;
        uint256 startTime = block.timestamp;
        uint256 endTime = startTime + AUCTION_DURATION;
        _auction = Auction({
            id: auctionId,
            ethBudget: budget,
            ethRemaining: budget,
            snapshottedRewardRate: r,
            startTime: startTime,
            endTime: endTime,
            nethBurned: 0,
            active: true
        });
        emit ReapingStarted(auctionId, budget, r, startTime, endTime);
    }

    function sellToReaper(uint256 nethIn, uint256 minEthOut) external nonReentrant returns (uint256 ethOut) {
        (uint256 nethTaken, uint256 ethPaid, uint256 rate) = _quote(nethIn);
        if (ethPaid < minEthOut) {
            revert InsufficientEthOut(ethPaid, minEthOut);
        }

        if (!neth.transferFrom(msg.sender, address(this), nethTaken)) {
            revert ZeroValue();
        }
        neth.burn(nethTaken);

        _auction.ethRemaining -= ethPaid;
        _auction.nethBurned += nethTaken;
        totalNethReaped += nethTaken;

        Address.sendValue(payable(msg.sender), ethPaid);
        emit Reaped(_auction.id, msg.sender, nethTaken, ethPaid, rate);
        return ethPaid;
    }

    function finalizeAuction() external nonReentrant {
        if (!_auction.active) {
            revert NoActiveAuction();
        }
        if (block.timestamp < _auction.endTime) {
            revert AuctionNotExpired();
        }
        _collectSurplus();
        uint256 rolled = _auction.ethRemaining;
        availableReaperETH += rolled;
        _auction.ethRemaining = 0;
        _auction.active = false;
        emit ReapingFinalized(_auction.id, _auction.ethBudget - rolled, _auction.nethBurned, rolled);
    }

    function collectSurplus() external returns (uint256 amount) {
        return _collectSurplus();
    }

    function _elapsed() internal view returns (uint256 elapsed) {
        elapsed = block.timestamp - _auction.startTime;
        if (elapsed > AUCTION_DURATION) {
            elapsed = AUCTION_DURATION;
        }
    }

    function _rateAt(uint256 elapsed, uint256 r) internal pure returns (uint256) {
        return Math.mulDiv(r, START_NUM * AUCTION_DURATION - SLOPE_NUM * elapsed, DENOM * AUCTION_DURATION);
    }

    function _quote(uint256 nethIn) internal view returns (uint256 nethTaken, uint256 ethOut, uint256 rate) {
        if (!_auction.active) {
            revert NoActiveAuction();
        }
        if (block.timestamp >= _auction.endTime) {
            revert AuctionExpired();
        }
        if (nethIn == 0) {
            revert ZeroValue();
        }
        rate = _rateAt(_elapsed(), _auction.snapshottedRewardRate);
        (nethTaken, ethOut) = _fill(nethIn, rate, _auction.ethRemaining);
    }

    function _fill(uint256 nethIn, uint256 rate, uint256 ethRemaining)
        internal
        pure
        returns (uint256 nethTaken, uint256 ethOut)
    {
        ethOut = Math.mulDiv(nethIn, WAD, rate);
        if (ethOut == 0) {
            revert ZeroEthOut();
        }
        if (ethOut <= ethRemaining) {
            nethTaken = nethIn;
            return (nethTaken, ethOut);
        }
        ethOut = ethRemaining;
        if (ethOut == 0) {
            revert ZeroEthOut();
        }
        nethTaken = Math.mulDiv(ethOut, rate, WAD, Math.Rounding.Ceil);
        if (nethTaken > nethIn) {
            nethTaken = nethIn;
        }
        if (nethTaken == 0) {
            revert ZeroEthOut();
        }
    }

    function _collectSurplus() internal returns (uint256 amount) {
        uint256 allocated = availableReaperETH;
        if (_auction.active) {
            allocated += _auction.ethRemaining;
        }
        uint256 bal = address(this).balance;
        if (bal <= allocated) {
            return 0;
        }
        amount = bal - allocated;
        availableReaperETH += amount;
        totalDonatedETH += amount;
        emit ReaperDonation(address(this), amount);
    }
}
