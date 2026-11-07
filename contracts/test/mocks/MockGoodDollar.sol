// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface ITokenHooks {
    function tokensToSend(address operator, address from, address to, uint256 amount) external;
    function tokensReceived(address operator, address from, address to, uint256 amount) external;
}

/// @notice Pessimistic G$ mock. Unlike the real SuperGoodDollar (whose ERC20 transfer/transferFrom skip ERC777
///         hooks), this calls sender/recipient hooks on EVERY movement, so reentrancy is tested in the worst case.
///         Optionally charges a receiver-paid transfer fee, like G$'s configurable fee formula.
contract MockGoodDollar is ERC20 {
    mapping(address => address) public hookOf;
    uint256 public feeBps;
    address public feeRecipient = address(0xFEE);

    constructor() ERC20("GoodDollar (mock)", "G$") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @notice Like ERC1820 registration: `account` designates a hook implementer for itself.
    function setHook(address implementer) external {
        hookOf[msg.sender] = implementer;
    }

    function setFeeBps(uint256 bps) external {
        feeBps = bps;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from == address(0) || to == address(0)) {
            super._update(from, to, value);
            return;
        }
        if (hookOf[from] != address(0)) ITokenHooks(hookOf[from]).tokensToSend(msg.sender, from, to, value);
        uint256 fee = value * feeBps / 10_000;
        super._update(from, to, value - fee);
        if (fee > 0) super._update(from, feeRecipient, fee);
        if (hookOf[to] != address(0)) ITokenHooks(hookOf[to]).tokensReceived(msg.sender, from, to, value - fee);
    }
}
