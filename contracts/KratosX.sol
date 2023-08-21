// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
// import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
// import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
// import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
// Uncomment this line to use console.log
import "hardhat/console.sol";

// contract MyERC20 is Initializable, PausableUpgradeable, OwnableUpgradeable
contract KratosX is Pausable, Ownable
{
    // enum LockPeriod { None, _6Months, _1Year, _2Years, _3Years, _4Years, _5Years }
    // enum SlotStatus { Available, AquireRequested, Accepted, WithdrawalRequested, Finished }
    event DepositRequested(uint256 id, address from);
    event DepositApproved(uint256 id);
    event DepositRejected(uint256 id);
    event WithdrawRequested(uint256 id);
    event WithdrawApproved(uint256 id);
    event WithdrawRejected(uint256 id);

    struct Deposit {
        uint16 id;                  //  deposit id
        address owner;              //  the wallet that baught this slot
        uint256 approveTimestamp;   //  timestamp when the deposit was created
        uint256 predictedYield;     //  the predicted/calculated yield at specific time
        uint256 lockingPeriod;   //  locking period
        bool hasEarlyAdoptBonus;
        bool hasExtendPeriodBonus;
        // SlotStatus status;          //  status of this slot

        // uint256[] _reserved;
    }

    address externalToken;          //  the address for the external token
    uint256 totalAmount;            //  the vaults total amount in the external token
    uint32 slotCount;               //  the amount of deposit slots created in the vault
    uint256 slotValue;              //  the value of each deposit slot
    uint256 earlyAdoptBonus;        //  the amount of slots that will earn the early adoption bonus

    Deposit[] public availableSlots;    //  free slots
    Deposit[] public usedSlots;         //  slots occupied
    Deposit[] public waitingSlots;      //  slots waiting approval

    constructor(address token, uint256 amount, uint16 slots) Pausable() Ownable() {
        externalToken = token;
        totalAmount = amount;
        slotCount = slots;
        slotValue = amount / slots;
        earlyAdoptBonus = 3;

        for (uint16 index = slots; index > 0; --index) {
            availableSlots.push(Deposit(index, msg.sender, 0, 0, 0, false, false)); // , SlotStatus.Available
        }
    }


    ///////////////////////////////////////////////////////
    //  External
    ///////////////////////////////////////////////////////


    ///////////////////////////////////////////////////////
    //  Public
    ///////////////////////////////////////////////////////
    function pause() public virtual onlyOwner {
        _pause();
    }

    function unpause() public virtual onlyOwner {
        _unpause();
    }

    function getAvailableSlots() public view returns(Deposit [] memory) {
        return availableSlots;
    }

    function getUsedSlots() public view returns(Deposit [] memory) {
        return usedSlots;
    }

    function getWaitingSlots() public view returns(Deposit [] memory) {
        return waitingSlots;
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

    function requestDeposit(uint256 periodInDays) public whenNotPaused {
        require(availableSlots.length > 0, "Not enough slots available");
        require(msg.sender != address(this), "The contract can not initiate a deposit");

        // TODO: validate periodInDays

        // Create an allowance on the depositers token, so we
        // can later make the transfer as soon as it's approved.
        // This line will approve the allowance with the right value or
        // increase it if already exists. This allows for multiple requests
        // in the future.
        ERC20(externalToken).increaseAllowance(address(this), slotValue);

        _moveLastSlot(availableSlots, waitingSlots);
        Deposit storage deposit = waitingSlots[waitingSlots.length - 1];
        deposit.owner = msg.sender;
        deposit.lockingPeriod = periodInDays;

        // send a notification regarding the deposit request
        // so it can be approved by the backend
        emit DepositRequested(deposit.id, msg.sender);
    }

    function approveDeposit(uint256 id) public onlyOwner {
        //  move the deposit to the proper list and get the deposit
        Deposit storage deposit = _moveSlot(waitingSlots, usedSlots, id);

        // make the value transfer from the depositer account
        ERC20(externalToken).transferFrom(deposit.owner, address(this), slotValue);

        //  check if this deposit has early access bonus
        if (earlyAdoptBonus > 0) {
            --earlyAdoptBonus;
            deposit.hasEarlyAdoptBonus = true;
        }

        //  calculate predicted yield
        deposit.predictedYield = calculateYield(slotValue, deposit.lockingPeriod, deposit.hasEarlyAdoptBonus, false);

        //  notify that the deposit was approved successfuly
        emit DepositApproved(id);
    }

    function rejectDeposit(uint256 id) public onlyOwner {
        Deposit storage deposit = _moveSlot(waitingSlots, availableSlots, id);

        deposit.owner = msg.sender;
        deposit.hasEarlyAdoptBonus = false;
        deposit.predictedYield = 0;

        emit DepositRejected(id);
    }

    ///////////////////////////////////////////////////////
    //  Internal
    ///////////////////////////////////////////////////////


    ///////////////////////////////////////////////////////
    //  Private
    ///////////////////////////////////////////////////////
    function _findSlotInCollection(Deposit[] memory collection, uint256 id) private pure returns(uint256) {
        // TODO: would start from the end optimize the search?
        for(uint256 index = 0; index < collection.length; ++index) {
            if(collection[index].id == id) {
                return index;
            }
        }
        revert("Item not found in collection");
    }

    function _moveLastSlot(Deposit[] storage from, Deposit[] storage to) private {
        to.push(from[from.length - 1]);
        from.pop();
    }

    function _moveSlot(Deposit[] storage from, Deposit[] storage to, uint256 id) private returns(Deposit storage) {
        uint256 index = _findSlotInCollection(from, id);

        if (index < from.length - 1) {
            from[index] = from[from.length - 1];
        }

        _moveLastSlot(from, to);

        return to[to.length - 1];
    }




    // function requestWidthdraw(uint256 id) public whenNotPaused {
    //     require(id < slotCount, "Invalid slot id");

    //     Deposit storage deposit = availableSlots[id];

    //     require(deposit.owner == msg.sender, "You are not the owner of this slot");
    //     require(deposit.status == SlotStatus.Accepted, "The slot is not in Accepted state");

    //     deposit.status = SlotStatus.WithdrawalRequested;

    //     //  TODO: calculate yield

    //     //  TODO: emit event for a withdrawal request

    // }

    // function requestDeposit(uint8 slots, uint256 periodInDays) public whenNotPaused {
    //     require(slots > 0, "Invalid value for 'slots'");
    //     require(slots < slotCount, "Not enough slots available");
    //     require(availableSlots.length >= slots, "Not enough slots available");

    //     // TODO: validate periodInDays

    //     // create an allowance on the depositers token, so we
    //     // can later make the transfer as soon as it's approved
    //     uint allowanceAmount = slotValue * slots;
    //     ERC20(externalToken).approve(address(this), allowanceAmount);

    //     while(slots > 0) {
    //         _moveLastSlot(availableSlots, waitingSlots);
    //         Deposit storage deposit = waitingSlots[waitingSlots.length - 1];
    //         deposit.owner = msg.sender;
    //         deposit.lockingPeriod = periodInDays;

    //         // send a notification regarding the deposit request
    //         // so it can be approved by the backend
    //         emit depositRequest(deposit.id, msg.sender);

    //         slots--;
    //     }
    // }
}
