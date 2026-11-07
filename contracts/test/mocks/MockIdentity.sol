// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IIdentity} from "../../src/interfaces/IIdentity.sol";

/// @notice Mirrors IdentityV4 semantics relevant to WhosRight: verification expiry, connected accounts
///         (which can be disconnected and re-connected to another identity), and getWhitelistedRoot.
contract MockIdentity is IIdentity {
    uint256 public authenticationPeriod = 180; // days
    mapping(address => uint256) public dateAuthenticated;
    mapping(address => address) public connectedAccounts;

    function whitelist(address account) external {
        dateAuthenticated[account] = block.timestamp;
    }

    function removeWhitelisted(address account) external {
        delete dateAuthenticated[account];
    }

    function isWhitelisted(address account) public view returns (bool) {
        uint256 d = dateAuthenticated[account];
        return d != 0 && (block.timestamp - d) / 1 days < authenticationPeriod;
    }

    /// @notice Called by a verified root to connect another wallet (as in IdentityV4).
    function connectAccount(address account) external {
        require(isWhitelisted(msg.sender), "not whitelisted");
        require(!isWhitelisted(account), "invalid account");
        require(connectedAccounts[account] == address(0), "already connected");
        connectedAccounts[account] = msg.sender;
    }

    function disconnectAccount(address connected) external {
        require(connectedAccounts[connected] == msg.sender || msg.sender == connected, "unauthorized");
        delete connectedAccounts[connected];
    }

    function getWhitelistedRoot(address account) external view returns (address) {
        if (isWhitelisted(account)) return account;
        if (isWhitelisted(connectedAccounts[account])) return connectedAccounts[account];
        return address(0);
    }
}
