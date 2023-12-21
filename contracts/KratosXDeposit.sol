// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @author  PRC
 * @title   Kratos-X Deposit Certificate NFT Smart Contract
 */
contract KratosXDeposit is ERC721, ERC721URIStorage, AccessControl {
    error SoulBoundToken();

    bytes32 private constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 private constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    uint256 private nextTokenId;    // the next token id to mint

    IERC20 public immutable underlyingToken;    // the underlying token used for this contract

    struct Deposit {
        uint256 nominal;        // nominal value of the deposit (based on token)
        uint32  timestamp;      // timestamp when the deposit was created
        bool    hasBonus;       // bonus flag for the vault accounting
    }

    mapping (uint256 tokenId => Deposit) public depositData;

    /**
     * @notice  Constructor
     * @param   token       Underlying token of the deposit certificates
     * @param   admin       Initial admin (owner)
     * @param   operator    Initial operator (minter/burner)
     */
    constructor(address token, address admin, address operator) ERC721("KratosXDeposit", "KXD") {
        underlyingToken = IERC20(token);

        _grantRole(ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, operator);

        _setRoleAdmin(ADMIN_ROLE, ADMIN_ROLE);
        _setRoleAdmin(OPERATOR_ROLE, ADMIN_ROLE);
    }

    /**
     * @notice  This function mints a new deposit cerificate
     * @dev     Call this function to mint a new deposit certificate
     * @param   to      The address of the depositer (soul bound)
     * @param   uri     The uri of the deposit metadata (for UI)
     * @param   data    The deposit internal data
     */
    function safeMint(address to, string calldata uri, Deposit calldata data) external onlyRole(OPERATOR_ROLE) {
        uint256 tokenId = nextTokenId++;
        _safeMint(to, tokenId);
        depositData[tokenId] = data;
        _setTokenURI(tokenId, uri);
    }

    /**
     * @notice  This function burns a deposit certificate
     * @dev     Call this function to burn a deposit certificate
     * @param   tokenId     The deposit certificate token id to burn
     */
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