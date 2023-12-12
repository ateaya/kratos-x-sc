// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract AteayaWhitelist is Pausable, AccessControl {
    event Updated(uint256 hash, bool enabled);

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    mapping(uint256 hash => bool) public isWhitelisted;     // hash = uint256(keccak256(abi.encodePacked(address)))

    constructor(address admin, address operator) {
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, operator);

        _setRoleAdmin(ADMIN_ROLE, ADMIN_ROLE);
        _setRoleAdmin(OPERATOR_ROLE, ADMIN_ROLE);
    }

    function update(uint256 hash, bool whitelist) public onlyRole(OPERATOR_ROLE) {
        isWhitelisted[hash] = whitelist;

        emit Updated(hash, whitelist);
    }

    function updateMulti(uint256[] memory hashs, bool whitelist) external {
        for (uint256 i = 0; i < hashs.length; ++i) {
            update(hashs[i], whitelist);
        }
    }

    function pause() public onlyRole(ADMIN_ROLE) {
        _pause();
    }

    function unpause() public onlyRole(ADMIN_ROLE) {
        _unpause();
    }
}
