// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {PaymentVault} from "../src/PaymentVault.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}

contract PaymentVaultTest is Test {
    PaymentVault internal vault;
    MockUSDC internal usdc;

    address internal owner = address(0xABCD);
    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    uint256 internal constant MIN_PRICE = 500_000; // 0.5 USDC
    bytes32 internal constant EVENT_ID = keccak256("polymarket:trump-2028");

    event Paid(
        address indexed payer,
        bytes32 indexed eventId,
        uint256 amount,
        uint256 nonce,
        uint256 timestamp
    );

    function setUp() public {
        usdc = new MockUSDC();
        vault = new PaymentVault(address(usdc), MIN_PRICE, owner);

        usdc.mint(alice, 100 * 1e6);
        usdc.mint(bob, 100 * 1e6);
    }

    function test_Pay_Success_EmitsEvent() public {
        vm.startPrank(alice);
        usdc.approve(address(vault), MIN_PRICE);

        vm.expectEmit(true, true, false, true, address(vault));
        emit Paid(alice, EVENT_ID, MIN_PRICE, 1, block.timestamp);

        vault.pay(EVENT_ID, MIN_PRICE, 1);
        vm.stopPrank();

        assertEq(usdc.balanceOf(address(vault)), MIN_PRICE);
        assertTrue(vault.isNonceUsed(alice, 1));
    }

    function test_Pay_RevertsBelowMinPrice() public {
        vm.startPrank(alice);
        usdc.approve(address(vault), MIN_PRICE);

        vm.expectRevert(
            abi.encodeWithSelector(
                PaymentVault.AmountBelowMinPrice.selector,
                MIN_PRICE - 1,
                MIN_PRICE
            )
        );
        vault.pay(EVENT_ID, MIN_PRICE - 1, 1);
        vm.stopPrank();
    }

    function test_Pay_RevertsOnNonceReplay() public {
        vm.startPrank(alice);
        usdc.approve(address(vault), MIN_PRICE * 2);
        vault.pay(EVENT_ID, MIN_PRICE, 7);

        vm.expectRevert(abi.encodeWithSelector(PaymentVault.NonceAlreadyUsed.selector, alice, 7));
        vault.pay(EVENT_ID, MIN_PRICE, 7);
        vm.stopPrank();
    }

    function test_Pay_DifferentPayers_SameNonce_Allowed() public {
        vm.startPrank(alice);
        usdc.approve(address(vault), MIN_PRICE);
        vault.pay(EVENT_ID, MIN_PRICE, 42);
        vm.stopPrank();

        vm.startPrank(bob);
        usdc.approve(address(vault), MIN_PRICE);
        vault.pay(EVENT_ID, MIN_PRICE, 42); // bob uses the same nonce — must succeed
        vm.stopPrank();

        assertEq(usdc.balanceOf(address(vault)), MIN_PRICE * 2);
    }

    function test_Withdraw_OnlyOwner() public {
        // alice pays first
        vm.startPrank(alice);
        usdc.approve(address(vault), MIN_PRICE);
        vault.pay(EVENT_ID, MIN_PRICE, 1);
        vm.stopPrank();

        // non-owner cannot withdraw
        vm.startPrank(alice);
        vm.expectRevert();
        vault.withdraw(alice, MIN_PRICE);
        vm.stopPrank();

        // owner can
        vm.startPrank(owner);
        vault.withdraw(owner, MIN_PRICE);
        vm.stopPrank();

        assertEq(usdc.balanceOf(owner), MIN_PRICE);
        assertEq(usdc.balanceOf(address(vault)), 0);
    }

    function test_SetMinPrice_OnlyOwner() public {
        vm.prank(owner);
        vault.setMinPrice(1_000_000);
        assertEq(vault.minPrice(), 1_000_000);

        vm.prank(alice);
        vm.expectRevert();
        vault.setMinPrice(2);
    }

    function test_View_Usdc() public view {
        assertEq(vault.usdc(), address(usdc));
    }
}
