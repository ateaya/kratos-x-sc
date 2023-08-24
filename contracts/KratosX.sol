// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";

// import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
// import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
// import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
// Uncomment this line to use console.log
import "hardhat/console.sol";

contract KratosX is Pausable, Ownable
{
    event DepositRequested(uint256 id, address from);
    event DepositApproved(address owner, uint256 id);
    event DepositRejected(uint256 id);
    event WithdrawRequested(uint256 id, uint256 estimatedAmount);
    event WithdrawExecuted(uint256 id, uint256 calculatedAmount);

    struct Deposit {
        uint16 id;                  //  deposit id
        address owner;              //  the wallet that baught this slot
        uint256 approveTimestamp;   //  timestamp when the deposit was created
        uint256 predictedYield;     //  the predicted/calculated yield at specific time
        uint256 lockingPeriod;      //  locking period
        bool hasEarlyAdoptBonus;
        bool hasExtendPeriodBonus;

        // uint256[] _reserved;
    }

    ERC20 externalToken;          //  the address for the external token
    // uint256 totalAmount;            //  the vaults total amount in the external token
    // uint32 slotCount;               //  the amount of deposit slots created in the vault
    uint256 slotValue;              //  the value of each deposit slot
    uint256 earlyAdoptBonus;        //  the amount of slots that will earn the early adoption bonus

    Deposit[] public availableSlots;    //  free slots
    Deposit[] public usedSlots;         //  slots occupied

    constructor(address token, uint256 amount, uint16 slots) Pausable() Ownable() {
        externalToken = ERC20(token);
        // totalAmount = amount;
        // slotCount = slots;
        slotValue = amount / slots;
        earlyAdoptBonus = 3;

        for (uint16 index = slots; index > 0; --index) {
            availableSlots.push(Deposit(index, address(0), 0, 0, 0, false, false));
        }
    }


    ///////////////////////////////////////////////////////
    //  External
    ///////////////////////////////////////////////////////
    function getAvailableSlots() external view returns(Deposit [] memory) {
        return availableSlots;
    }

    function getUsedSlots() external view returns(Deposit [] memory) {
        return usedSlots;
    }

    function approveDeposit(address depositor, uint256 lockPeriod) external onlyOwner {
        // TODO: check if there are slots available

        // make the value transfer from the depositer account
        externalToken.transferFrom(depositor, owner(), slotValue);

        //  move the deposit to the proper list and get the deposit
        Deposit storage deposit = _moveLastSlot(availableSlots, usedSlots);
        deposit.owner = depositor;
        deposit.lockingPeriod = lockPeriod;
        deposit.approveTimestamp = block.timestamp;

        //  check if this deposit has early access bonus
        if (earlyAdoptBonus > 0) {
            --earlyAdoptBonus;
            deposit.hasEarlyAdoptBonus = true;
        }

        //  calculate predicted yield
        deposit.predictedYield = calculateYield(slotValue, deposit.lockingPeriod, deposit.hasEarlyAdoptBonus, false);

        //  notify that the deposit was approved successfuly
        emit DepositApproved(depositor, deposit.id);
    }

    function rejectDeposit(uint256 id) external onlyOwner {
        emit DepositRejected(id);
    }

    function requestWithdrawal(uint256 id) external {
        Deposit memory deposit = usedSlots[_findSlotInCollection(usedSlots, id)];
        uint256 dayCount = _timestampInDays(block.timestamp + 7 days - deposit.approveTimestamp);
        uint256 estimatedYield = calculateYield(slotValue, dayCount, deposit.hasEarlyAdoptBonus, deposit.hasExtendPeriodBonus);

        emit WithdrawRequested(id, slotValue + estimatedYield);
    }

    function executeWithdraw(uint256 id) external onlyOwner {
        console.log("--> executeWithdraw");
        Deposit storage deposit = _moveSlot(usedSlots, availableSlots, id);
        uint256 dayCount = _timestampInDays(block.timestamp - deposit.approveTimestamp);
        uint256 calculatedYield = calculateYield(slotValue, dayCount, deposit.hasEarlyAdoptBonus, deposit.hasExtendPeriodBonus);

        console.log("days:", dayCount);
        console.log("calculatedAmount:", calculatedYield);

        require(externalToken.balanceOf(owner()) > slotValue + calculatedYield, "Not enough liquidity in account");

        externalToken.transfer(deposit.owner, calculatedYield);

        deposit.owner = address(0);
        deposit.hasEarlyAdoptBonus = false;
        deposit.hasExtendPeriodBonus = false;
        deposit.lockingPeriod = 0;
        deposit.predictedYield = 0;
        deposit.approveTimestamp = 0;

        emit WithdrawExecuted(id, calculatedYield);
    }

    ///////////////////////////////////////////////////////
    //  Public
    ///////////////////////////////////////////////////////
    function pause() public virtual onlyOwner {
        _pause();
    }

    function unpause() public virtual onlyOwner {
        _unpause();
    }

    function calculateYield(uint256 value, uint256 dayCount, bool hasEarlyAdoptBonus, bool hasExtendBonus)
        public pure returns(uint256) {
        uint8 ratePercent = 0;

        if (dayCount < 180) {
            ratePercent = 0;
        } else if (dayCount < 365) {    //  < 1 year
            ratePercent = 5;
        } else if (dayCount < 730) {    //  1 years < dayCount > 2 years
            ratePercent = 5;
        } else if (dayCount < 1095) {   //  2 years < dayCount > 3 years
            ratePercent = 6;
        } else if (dayCount < 1460) {   //  3 years < dayCount > 4 years
            ratePercent = 7;
        } else if (dayCount < 1825) {   //  4 years < dayCount > 5 years
            ratePercent = 8;
        } else {                        //  > 5 years
            dayCount = 1825;            //  cap the day count
            ratePercent = 9;
        }

        if (hasEarlyAdoptBonus) {
            ratePercent += 1;
        }

        if (hasExtendBonus && dayCount > 365) {
            ratePercent += 1;
        }

        return value * ratePercent * dayCount / (100 * 365);
    }

    ///////////////////////////////////////////////////////
    //  Internal
    ///////////////////////////////////////////////////////


    ///////////////////////////////////////////////////////
    //  Private
    ///////////////////////////////////////////////////////
    function _timestampInDays(uint256 timestamp) private pure returns(uint256) {
        return timestamp / (60 * 60 * 24);
    }

    function _findSlotInCollection(Deposit[] memory collection, uint256 id) private pure returns(uint256) {
        // TODO: would start from the end optimize the search?
        for(uint256 index = 0; index < collection.length; ++index) {
            if(collection[index].id == id) {
                return index;
            }
        }
        revert("Item not found in collection");
    }

    function _moveLastSlot(Deposit[] storage from, Deposit[] storage to) private returns(Deposit storage) {
        to.push(from[from.length - 1]);
        from.pop();
        return to[to.length - 1];
    }

    function _moveSlot(Deposit[] storage from, Deposit[] storage to, uint256 id) private returns(Deposit storage) {
        uint256 index = _findSlotInCollection(from, id);

        if (index < from.length - 1) {
            from[index] = from[from.length - 1];
        }

        return _moveLastSlot(from, to);
    }
}
