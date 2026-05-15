// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title PaymentVault
 * @notice Single-purpose vault that accepts micro USDC payments tied to an x402
 *         insight unlock request. Each payment carries (eventId, nonce) so the
 *         backend can match the on-chain `Paid` event against an off-chain
 *         challenge issued via HTTP 402.
 *
 *         - Users must `approve` the vault on USDC, then call `pay()`.
 *         - Each (payer, nonce) tuple is single-use to prevent replay.
 *         - Owner can withdraw accumulated USDC to fund the TikHub apikey or
 *           any operating wallet.
 */
contract PaymentVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 private immutable _usdc;
    uint256 private _minPrice;

    /// @dev payer => nonce => used
    mapping(address => mapping(uint256 => bool)) private _usedNonces;

    event Paid(
        address indexed payer,
        bytes32 indexed eventId,
        uint256 amount,
        uint256 nonce,
        uint256 timestamp
    );
    event Withdrawn(address indexed to, uint256 amount);
    event MinPriceUpdated(uint256 oldPrice, uint256 newPrice);

    error AmountBelowMinPrice(uint256 sent, uint256 min);
    error NonceAlreadyUsed(address payer, uint256 nonce);
    error InvalidRecipient();
    error InvalidAmount();

    constructor(address usdc_, uint256 minPrice_, address initialOwner) Ownable(initialOwner) {
        if (usdc_ == address(0)) revert InvalidRecipient();
        _usdc = IERC20(usdc_);
        _minPrice = minPrice_;
        emit MinPriceUpdated(0, minPrice_);
    }

    /**
     * @notice Pay USDC to unlock an insight report.
     * @param eventId  Application-level identifier (typically keccak256 of the polymarket slug).
     * @param amount   Amount of USDC base units (USDC has 6 decimals on most chains).
     * @param nonce    Server-issued nonce; must be unique per payer.
     */
    function pay(bytes32 eventId, uint256 amount, uint256 nonce) external nonReentrant {
        if (amount < _minPrice) revert AmountBelowMinPrice(amount, _minPrice);
        if (_usedNonces[msg.sender][nonce]) revert NonceAlreadyUsed(msg.sender, nonce);

        _usedNonces[msg.sender][nonce] = true;
        _usdc.safeTransferFrom(msg.sender, address(this), amount);

        emit Paid(msg.sender, eventId, amount, nonce, block.timestamp);
    }

    /**
     * @notice Owner-only withdrawal of accumulated USDC.
     */
    function withdraw(address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert InvalidRecipient();
        if (amount == 0) revert InvalidAmount();
        _usdc.safeTransfer(to, amount);
        emit Withdrawn(to, amount);
    }

    /**
     * @notice Owner-only update of the minimum payment price.
     */
    function setMinPrice(uint256 newMinPrice) external onlyOwner {
        uint256 old = _minPrice;
        _minPrice = newMinPrice;
        emit MinPriceUpdated(old, newMinPrice);
    }

    function usdc() external view returns (address) {
        return address(_usdc);
    }

    function minPrice() external view returns (uint256) {
        return _minPrice;
    }

    function isNonceUsed(address payer, uint256 nonce) external view returns (bool) {
        return _usedNonces[payer][nonce];
    }
}
