// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @author  PRC
 * @title   Ateaya KYC Account Whitelist Smart Contract
 */
contract AteayaWhitelist is Pausable, AccessControl {
    event Updated(uint256 hash, bool enabled);

    bytes32 private constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 private constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    mapping(uint256 hash => bool) public isWhitelisted;

    /**
     * @notice  Constructor
     * @param   admin       Initial admin (owner)
     * @param   operator    Initial operator (updater)
     */
    constructor(address admin, address operator) {
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, operator);

        _setRoleAdmin(ADMIN_ROLE, ADMIN_ROLE);
        _setRoleAdmin(OPERATOR_ROLE, ADMIN_ROLE);
    }

    /**
     * @notice  This function updates an entry in the whitelist.
     * @dev     Call this function to update an entry hash.
     * @param   hash        The address hash to update -> hash = uint256(keccak256(abi.encodePacked(address)))
     * @param   whitelist   The whitelist state for the address hash.
     */
    function update(uint256 hash, bool whitelist) public onlyRole(OPERATOR_ROLE) {
        isWhitelisted[hash] = whitelist;

        emit Updated(hash, whitelist);
    }

    /**
     * @notice  This function updates a set of entries in the whitelist.
     * @dev     Call this function to update a set of entries hashes.
     * @param   hashes      The address hashes to update -> hash = uint256(keccak256(abi.encodePacked(address)))
     * @param   whitelist   The whitelist state for the address hashes.
     */
    function updateMulti(uint256[] memory hashes, bool whitelist) external {
        for (uint256 i = 0; i < hashes.length; ++i) {
            update(hashes[i], whitelist);
        }
    }

    /**
     * @notice  This function pauses the contract in an emergency situation. It will simply not allow new deposits.
     * @dev     Call this function to pause new deposits.
     */
    function pause() public onlyRole(ADMIN_ROLE) {
        _pause();
    }

    /**
     * @notice  This function will resume the normal functionality of the contract.
     * @dev     Call this function to unpause the contract.
     */
    function unpause() public onlyRole(ADMIN_ROLE) {
        _unpause();
    }
}
