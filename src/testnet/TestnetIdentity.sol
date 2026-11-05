// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IIdentity} from "../interfaces/IIdentity.sol";

/// @title TestnetIdentity
/// @notice TESTNET ONLY. Mimics GoodDollar IdentityV4 root/connected-account semantics, but anyone can
///         "verify" themselves. Provides NO sybil resistance. Refuses to deploy on Celo mainnet.
contract TestnetIdentity is IIdentity {
    uint256 public constant AUTHENTICATION_PERIOD_DAYS = 180;
    mapping(address => uint256) public dateAuthenticated;
    mapping(address => address) public connectedAccounts;

    error NotOnMainnet();

    event WhitelistedAdded(address indexed account);
    event AccountConnected(address indexed connected, address indexed to);
    event AccountDisconnected(address indexed connected, address indexed from);

    constructor() {
        if (block.chainid == 42220) revert NotOnMainnet();
    }

    /// @notice Self-verify (testnet stand-in for GoodDollar face verification).
    function verifyMe() external {
        require(connectedAccounts[msg.sender] == address(0), "connected account");
        dateAuthenticated[msg.sender] = block.timestamp;
        emit WhitelistedAdded(msg.sender);
    }

    function isWhitelisted(address account) public view returns (bool) {
        uint256 d = dateAuthenticated[account];
        return d != 0 && (block.timestamp - d) / 1 days < AUTHENTICATION_PERIOD_DAYS;
    }

    function connectAccount(address account) external {
        require(isWhitelisted(msg.sender), "not whitelisted");
        require(!isWhitelisted(account), "invalid account");
        require(connectedAccounts[account] == address(0), "already connected");
        connectedAccounts[account] = msg.sender;
        emit AccountConnected(account, msg.sender);
    }

    function disconnectAccount(address connected) external {
        require(connectedAccounts[connected] == msg.sender || msg.sender == connected, "unauthorized");
        address root = connectedAccounts[connected];
        delete connectedAccounts[connected];
        emit AccountDisconnected(connected, root);
    }

    function getWhitelistedRoot(address account) external view returns (address) {
        if (isWhitelisted(account)) return account;
        if (isWhitelisted(connectedAccounts[account])) return connectedAccounts[account];
        return address(0);
    }
}
