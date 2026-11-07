/** The parts of GoodDollar's UBISchemeV2 the app uses (same as citizen-sdk's ubiSchemeV2ABI). */
export const ubiSchemeAbi = [
  { type: "function", name: "claim", stateMutability: "nonpayable", inputs: [], outputs: [{ type: "bool" }] },
  {
    type: "function",
    name: "checkEntitlement",
    stateMutability: "view",
    inputs: [{ name: "_member", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  { type: "function", name: "periodStart", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "currentDay", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;
