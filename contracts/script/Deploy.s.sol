// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {PaymentVault} from "../src/PaymentVault.sol";

/**
 * @notice Deploy PaymentVault to Arc Testnet (or any EVM chain).
 *
 * Required env vars:
 *   - DEPLOYER_PRIVATE_KEY  (hex, with 0x)
 *   - USDC_ARC_ADDRESS      (USDC ERC20 on the target chain)
 *   - MIN_PRICE_USDC        (decimal string e.g. "0.5")
 */
contract Deploy is Script {
    function run() external returns (PaymentVault vault) {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address usdc = vm.envAddress("USDC_ARC_ADDRESS");
        // assume USDC has 6 decimals; converts e.g. "0.5" → 500_000
        uint256 minPrice = _parseUsdc(vm.envString("MIN_PRICE_USDC"));
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);
        vault = new PaymentVault(usdc, minPrice, deployer);
        vm.stopBroadcast();

        console2.log("PaymentVault deployed at:", address(vault));
        console2.log("Owner:", deployer);
        console2.log("USDC:", usdc);
        console2.log("minPrice (base units):", minPrice);
    }

    function _parseUsdc(string memory amount) internal pure returns (uint256) {
        bytes memory b = bytes(amount);
        uint256 intPart;
        uint256 fracPart;
        uint256 fracDigits;
        bool seenDot;
        for (uint256 i; i < b.length; i++) {
            bytes1 c = b[i];
            if (c == ".") {
                seenDot = true;
                continue;
            }
            require(c >= "0" && c <= "9", "Deploy: invalid char");
            uint256 d = uint8(c) - 48;
            if (!seenDot) {
                intPart = intPart * 10 + d;
            } else {
                require(fracDigits < 6, "Deploy: too many decimals");
                fracPart = fracPart * 10 + d;
                fracDigits++;
            }
        }
        // pad fracPart to 6 decimals
        while (fracDigits < 6) {
            fracPart *= 10;
            fracDigits++;
        }
        return intPart * 1_000_000 + fracPart;
    }
}
