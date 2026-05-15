/**
 * Typed ABI for PaymentVault.sol — kept in lockstep with contracts/src/PaymentVault.sol.
 * Use `viem`'s parseAbi-style const-assertion to enable full type inference downstream.
 */
export const paymentVaultAbi = [
  // events
  {
    type: "event",
    name: "Paid",
    inputs: [
      { name: "payer", type: "address", indexed: true },
      { name: "eventId", type: "bytes32", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "nonce", type: "uint256", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Withdrawn",
    inputs: [
      { name: "to", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "MinPriceUpdated",
    inputs: [
      { name: "oldPrice", type: "uint256", indexed: false },
      { name: "newPrice", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
  // functions
  {
    type: "function",
    name: "pay",
    stateMutability: "nonpayable",
    inputs: [
      { name: "eventId", type: "bytes32" },
      { name: "amount", type: "uint256" },
      { name: "nonce", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "setMinPrice",
    stateMutability: "nonpayable",
    inputs: [{ name: "newMinPrice", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "usdc",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "minPrice",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "isNonceUsed",
    stateMutability: "view",
    inputs: [
      { name: "payer", type: "address" },
      { name: "nonce", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  // custom errors (mirror PaymentVault.sol)
  {
    type: "error",
    name: "AmountBelowMinPrice",
    inputs: [
      { name: "sent", type: "uint256" },
      { name: "min", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "NonceAlreadyUsed",
    inputs: [
      { name: "payer", type: "address" },
      { name: "nonce", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "InvalidRecipient",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidAmount",
    inputs: [],
  },
] as const;

export type PaymentVaultAbi = typeof paymentVaultAbi;
