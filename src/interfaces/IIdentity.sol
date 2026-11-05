// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice Minimal view of GoodDollar's Identity contract (IdentityV4 on Celo).
/// @dev `getWhitelistedRoot` returns the verified ("whitelisted") root address for `account`:
///      the account itself if it is verified, the verified identity it is connected to via
///      `connectAccount`, or address(0). Verification expires on an admin-set schedule
///      (IdentityV4 `reverifyDaysOptions`, currently 1, 7, then 180 days by verification count).
interface IIdentity {
    function getWhitelistedRoot(address account) external view returns (address whitelisted);
}
