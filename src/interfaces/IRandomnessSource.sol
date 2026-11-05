// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice Randomness adapter used by WhosRight. Fixed at WhosRight deployment.
interface IRandomnessSource {
    /// @notice Native-token (CELO) fee required to request randomness at the given gas price.
    function fee(uint256 gasPrice) external view returns (uint256);

    /// @notice Requests randomness. Any unspent msg.value is returned to `refundTo`.
    /// @return requestId Key used to read the randomness later.
    function request(address refundTo) external payable returns (uint256 requestId);

    /// @notice Re-requests randomness for an unresolved request. Any unspent msg.value is returned to `refundTo`.
    /// @return newRequestId Key to use from now on (the Witnet adapter keeps the same key, so the
    ///         eventual seed cannot be re-rolled).
    function retry(uint256 requestId, address refundTo) external payable returns (uint256 newRequestId);

    function isReady(uint256 requestId) external view returns (bool);

    /// @dev Must only be called when `isReady(requestId)` is true.
    function randomness(uint256 requestId) external view returns (bytes32);
}
