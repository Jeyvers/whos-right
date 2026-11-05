// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice Minimal view of GoodDollar's Identity contract (IdentityV4 on Celo).
/// @dev `getWhitelistedRoot` returns the verified ("whitelisted") root address for `account`:
///      the account itself if it is verified, the verified identity it is connected to via
///      `connectAccount`, or address(0). Verification expires (authenticationPeriod, 180 days on Celo).
interface IIdentity {
    function getWhitelistedRoot(address account) external view returns (address whitelisted);
}
