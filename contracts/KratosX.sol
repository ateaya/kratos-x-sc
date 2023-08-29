// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
// import "hardhat/console.sol";

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
        uint16 id;                   //  deposit id
        address owner;               //  the wallet that baught this slot
        uint32 approveTimestamp;     //  timestamp when the deposit was created
        uint32 lockingPeriod;        //  locking period
        bool hasEarlyAdoptBonus;
        bool hasExtendPeriodBonus;
    }

    ERC20 immutable externalToken;      //  the address for the external token
    uint256 constant slotValue = 5000;        //  the value of each deposit slot
    uint8 constant slotCount = 100;        //  the value of each deposit slot
    uint8 earlyAdoptBonus;            //  the amount of slots that will earn the early adoption bonus

    uint16 autoIncrementedId;

    Deposit[] public deposits;

    constructor(address token) Pausable() Ownable() {
        externalToken = ERC20(token);
        earlyAdoptBonus = 3;
        autoIncrementedId = 0;
    }


    ///////////////////////////////////////////////////////
    //  External
    ///////////////////////////////////////////////////////
    /**
     * @notice  Retrieve the available deposit slots.
     * @dev     Returns a list with the available deposit slots.
     */
    function getAvailableSlotCount() external view returns(uint256) {
        return slotCount - deposits.length;
    }

    /**
     * @notice  Retrieve the used deposit slots.
     * @dev     Returns a list with the used deposit slots.
     */
    function getUsedSlots() external view returns(Deposit[] memory) {
        return deposits;
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
        require(deposits.length < slotCount, "No slots available.");

        // make the value transfer from the depositer account
        externalToken.transferFrom(depositor, owner(), slotValue);

        uint16 id = _createDepositId();

        deposits.push(Deposit(id, depositor, uint32(block.timestamp), uint32(lockPeriod), _hasEarlyAdoptionBonus(), false));

        emit DepositApproved(depositor, id);
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
        Deposit memory deposit = _getDepositById(id);

        // account for 7 days of withdrawal time
        uint256 dayCount = _timestampInDays(block.timestamp + 7 days - deposit.approveTimestamp);
        uint256 estimatedYield = calculateYield(dayCount, deposit.hasEarlyAdoptBonus, deposit.hasExtendPeriodBonus);

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
        Deposit[] memory depositsInMemory = deposits;
        uint256 depositIndex = _findDeposit(depositsInMemory, id);
        Deposit memory deposit = depositsInMemory[depositIndex];

        uint256 calculatedValue = slotValue + calculateYield(_timestampInDays(block.timestamp - deposit.approveTimestamp),
            deposit.hasEarlyAdoptBonus,
            deposit.hasExtendPeriodBonus);

        externalToken.transferFrom(owner(), deposit.owner, calculatedValue);

        deposits[depositIndex] = depositsInMemory[depositsInMemory.length - 1];
        deposits.pop();

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
     * @param   dayCount  The numberber of days after the deposit approval.
     * @param   hasEarlyAdoptBonus  If the deposit benefits from the early adoption bonus.
     * @param   hasExtendBonus  If the deposit benefits from the time extension bonus.
     */
    function calculateYield(uint256 dayCount, bool hasEarlyAdoptBonus, bool hasExtendBonus)
        public pure returns(uint256) {
        uint256 ratePercent;

        if (dayCount <= 180) {
            ratePercent = 0;
        } else if (dayCount <= 365) {    //  < 1 year
            ratePercent = 5;
        } else if (dayCount <= 730) {    //  1 years < dayCount > 2 years
            ratePercent = 5;
        } else if (dayCount <= 1095) {   //  2 years < dayCount > 3 years
            ratePercent = 6;
        } else if (dayCount <= 1460) {   //  3 years < dayCount > 4 years
            ratePercent = 7;
        } else if (dayCount <= 1825) {   //  4 years < dayCount > 5 years
            ratePercent = 8;
        } else {                        //  > 5 years
            dayCount = 1825;            //  cap the day count
            ratePercent = 9;
        }

        if (hasEarlyAdoptBonus) {
            ratePercent = _increment(ratePercent);
        }

        if (hasExtendBonus && dayCount >= 365) {
            ratePercent = _increment(ratePercent);
        }

        return slotValue * ratePercent * dayCount / (100 * 365);
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

    function _createDepositId() private returns(uint16) {
        unchecked { ++autoIncrementedId; }
        return autoIncrementedId;
    }

    function _hasEarlyAdoptionBonus() private returns(bool) {
        if (earlyAdoptBonus > 0) {
            unchecked { --earlyAdoptBonus; }
            return true;
        }
        return false;
    }

    function _timestampInDays(uint256 timestamp) private pure returns(uint256) {
        return timestamp / (60 * 60 * 24);
    }

    function _findDeposit(Deposit[] memory depositsInMemory, uint256 id) private pure returns(uint256) {
        Deposit[] memory _deposits = depositsInMemory;  // TODO: check why this optimizes gas
        for (uint256 index = 0; index < _deposits.length; index = _increment(index)) {
            if (_deposits[index].id == id) {
                return index;
            }
        }
        revert DepositNotFound(id);
    }

    function _getDepositById(uint256 id) private view returns(Deposit memory) {
        Deposit[] memory depositsInMemory = deposits;   // TODO: check why this optimizes gas
        for (uint256 index = 0; index < depositsInMemory.length; index = _increment(index)) {
            if (depositsInMemory[index].id == id) {
                return depositsInMemory[index];
            }
        }
        revert DepositNotFound(id);
    }
}
