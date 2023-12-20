// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract KratosXBond is ERC721, ERC721URIStorage, AccessControl {
    error SoulBoundToken();

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    struct Metadata {
        
        uint32 approveTimestamp;     //  timestamp when the deposit was created
        bool hasEarlyAdoptBonus;
    }

    uint256 private _nextTokenId;

    mapping (uint256 tokenId => Metadata) public metadata;

    constructor(address admin, address operator) ERC721("KratosXNFT", "KXN") {
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, operator);

        _setRoleAdmin(ADMIN_ROLE, ADMIN_ROLE);
        _setRoleAdmin(OPERATOR_ROLE, ADMIN_ROLE);
    }

    function safeMint(address to, string memory uri) external onlyRole(OPERATOR_ROLE) {
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);
    }

    function burn(uint256 tokenId) external onlyRole(OPERATOR_ROLE) {
        _burn(tokenId);
    }

    // Soulbound token

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        if (auth != address(0) && to != address(0)) revert SoulBoundToken();
        return super._update(to, tokenId, auth);
    }

    // Required overrides

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721URIStorage, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}