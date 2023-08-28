// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "hardhat/console.sol";

error DepositNotFound(uint256 id);

/**
 * @author  Miguel Tadeu
 * @title   Kratos-X Vault Smart Contract
 * @dev     .
 * @notice  .
 */

contract KratosX is Pausable, Ownable
{
    event DepositRequested(uint256 id, address from);
    event DepositApproved(address owner, uint256 id);
    event DepositRejected(uint256 id);
    event WithdrawRequested(uint256 id, uint256 estimatedAmount);
    event WithdrawExecuted(uint256 id, uint256 calculatedAmount);

    struct Deposit {
        uint256 approveTimestamp;   //  timestamp when the deposit was created
        uint256 predictedYield;     //  the predicted/calculated yield at specific time
        uint256 lockingPeriod;      //  locking period
        address owner;              //  the wallet that baught this slot
        uint8 id;                   //  deposit id
        bool hasEarlyAdoptBonus;
        bool hasExtendPeriodBonus;
    }

    ERC20 immutable externalToken;      //  the address for the external token
    uint256 immutable slotValue;        //  the value of each deposit slot
    uint256 earlyAdoptBonus;            //  the amount of slots that will earn the early adoption bonus

    Deposit[] public availableSlots;    //  free slots
    Deposit[] public usedSlots;         //  slots occupied

    constructor(address token, uint256 amount, uint8 slots) Pausable() Ownable() {
        externalToken = ERC20(token);
        slotValue = amount / slots;
        earlyAdoptBonus = 3;

        for (uint8 index = slots; index > 0; --index) {
            availableSlots.push(Deposit(0, 0, 0, address(0), index, false, false));
        }
    }


    ///////////////////////////////////////////////////////
    //  External
    ///////////////////////////////////////////////////////
    /**
     * @notice  Retrieve the available deposit slots.
     * @dev     Returns a list with the available deposit slots.
     */
    function getAvailableSlots() external view returns(Deposit [] memory) {
        return availableSlots;
    }

    /**
     * @notice  Retrieve the used deposit slots.
     * @dev     Returns a list with the used deposit slots.
     */
    function getUsedSlots() external view returns(Deposit [] memory) {
        return usedSlots;
    }

    /**
     * @notice  Allows the back-end to approve a deposit. This is because we require
     * user information in order to create a writen contract for each deposit. The deposit will be locked
     * for the specified locking period but the user may withdraw at any time before that.
     * @dev     After the user called ERC20.approve(...), the backend should detect that and call
     * this function if the user already inserted all the necessary information.
     * @param   depositor  The depositor wallet address on the external token.
     * @param   lockPeriod  The predicted locking period.
     */
    function approveDeposit(address depositor, uint256 lockPeriod) external onlyOwner {
        require(availableSlots.length > 0, "No slots available.");

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

    /**
     * @notice  After the user approve an amount in the external currency, the backend may reject the deposit
     * if the user didn't complete the information required to generate the writen contract. This is the function
     * that should be called in this situation.
     * @dev     Call this function by the backend when the deposit was not accepted.
     * @param   id  The id of the deposit to reject.
     */
    function rejectDeposit(uint256 id) external onlyOwner {
        emit DepositRejected(id);
    }

    /**
     * @notice  The normal case is that the deposit will be automatically resolved when the locking period
     * reaches the end. Dispite that, the user can, at any time, request to withdraw the funds, keeping in
     * mind that, the yiled will be calculated for the amount of time of the deposit and with the corresponding
     * rate.
     * @dev     The user may call this function to request a withdraw before the stipulated locking period.
     * @param   id  The id of the deposit to withdraw.
     */
    function requestWithdrawal(uint256 id) external whenNotPaused {
        Deposit memory deposit = usedSlots[_findSlotInCollection(usedSlots, id)];

        // account for 7 days of withdrawal time
        uint256 dayCount = _timestampInDays(block.timestamp + 7 days - deposit.approveTimestamp);
        uint256 estimatedYield = calculateYield(slotValue, dayCount, deposit.hasEarlyAdoptBonus, deposit.hasExtendPeriodBonus);

        emit WithdrawRequested(id, slotValue + estimatedYield);
    }

    /**
     * @notice  This function may be called under 2 situations. The first is, called by the backend, when the locking
     * time reaches the end. The second situation is, when the user requests to withdraw before the locking time, the
     * backend will call this function after 7 days.
     * @dev     Called by the backend to liquidate the deposit.
     * @param   id  The id of the deposit to liquidate.
     */
    function executeWithdraw(uint256 id) external onlyOwner {
        Deposit storage deposit = _moveSlot(usedSlots, availableSlots, id);
        uint256 dayCount = _timestampInDays(block.timestamp - deposit.approveTimestamp);
        uint256 calculatedYield = calculateYield(slotValue, dayCount, deposit.hasEarlyAdoptBonus, deposit.hasExtendPeriodBonus);
        uint256 calculatedValue = slotValue + calculatedYield;

        require(externalToken.balanceOf(owner()) > calculatedValue, "Not enough liquidity in account");

        externalToken.transferFrom(owner(), deposit.owner, calculatedValue);

        deposit.owner = address(0);
        deposit.hasEarlyAdoptBonus = false;
        deposit.hasExtendPeriodBonus = false;
        deposit.lockingPeriod = 0;
        deposit.predictedYield = 0;
        deposit.approveTimestamp = 0;

        emit WithdrawExecuted(id, calculatedValue);
    }

    ///////////////////////////////////////////////////////
    //  Public
    ///////////////////////////////////////////////////////
    /**
     * @notice  This function pauses the contract in an emergency situation. It will simply not allow new deposits.
     * @dev     Call this function to pause new deposits.
     */
    function pause() public virtual onlyOwner {
        _pause();
    }

    /**
     * @notice  This function will resume the normal functionality of the contract.
     * @dev     Call this function to unpause the contract.
     */
    function unpause() public virtual onlyOwner {
        _unpause();
    }


    /**
     * @notice  Calculate the yield for a value deposited in time.
     * @dev     Call this function to estimate or calculate the yield for a deposit.
     * @param   value  The initial value deposited.
     * @param   dayCount  The numberber of days after the deposit approval.
     * @param   hasEarlyAdoptBonus  If the deposit benefits from the early adoption bonus.
     * @param   hasExtendBonus  If the deposit benefits from the time extension bonus.
     */
    function calculateYield(uint256 value, uint256 dayCount, bool hasEarlyAdoptBonus, bool hasExtendBonus)
        public pure returns(uint256) {
        uint256 ratePercent;

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
            ratePercent = _increment(ratePercent);
        }

        if (hasExtendBonus && dayCount > 365) {
            ratePercent = _increment(ratePercent);
        }

        return value * ratePercent * dayCount / (100 * 365);
    }

    ///////////////////////////////////////////////////////
    //  Internal
    ///////////////////////////////////////////////////////


    ///////////////////////////////////////////////////////
    //  Private
    ///////////////////////////////////////////////////////
    function _increment(uint256 value) private pure returns(uint256) {
        unchecked { ++value; }
        return value;
    }

    function _timestampInDays(uint256 timestamp) private pure returns(uint256) {
        return timestamp / (60 * 60 * 24);
    }

    function _findSlotInCollection(Deposit[] memory collection, uint256 id) private pure returns(uint256) {
        Deposit[] memory _collection = collection;  // TODO: check why does this reduce gas
        for(uint256 index = 0; index < _collection.length; index = _increment(index)) {
            if(_collection[index].id == id) {
                return index;
            }
        }
        revert DepositNotFound(id);
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
