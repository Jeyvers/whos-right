import { getAddress, type Address } from "viem";
import { network } from "./network";

/** WhosRight.MAX_CASE_FEE: no approval may ever exceed it. */
export const MAX_CASE_FEE = 10_000n * 10n ** 18n;

export type CallDescriptor = { address: Address; functionName: string; args?: readonly unknown[]; value?: bigint };

/**
 * Whether a call may be signed WITHOUT Privy's confirmation pop-up.
 *
 * Privy's policy engine can't enforce this for a user's own browser-signed wallet (the pop-up is client-side UI),
 * so per the agreed rule silent signing is TESTNET ONLY. On mainnet this always returns false and Privy confirms
 * every action. Default is "show the pop-up": anything not explicitly allowed here gets one.
 *
 * Allowed (testnet, built-in wallet):
 *  - any call to WhosRight with no CELO attached (it can only take the case's locked fee, which the approval caps)
 *  - G$ approve(spender = WhosRight, amount <= the fee cap). Never unlimited, never another spender.
 *  - the testnet stand-ins: faucet() and verifyMe()
 * Everything else (transfers, other contracts, other spenders, larger amounts, attached CELO) shows the pop-up.
 */
export function maySignSilently(call: CallDescriptor): boolean {
  const t = network.testnet;
  const wr = network.whosRight;
  if (!t || !wr) return false;
  const to = getAddress(call.address);
  const value = call.value ?? 0n;

  if (to === getAddress(wr)) return value === 0n;
  if (value !== 0n) return false;
  if (to === getAddress(network.goodDollar) && call.functionName === "approve") {
    const [spender, amount] = (call.args ?? []) as [Address, bigint];
    return Boolean(spender) && getAddress(spender) === getAddress(wr) && typeof amount === "bigint" && amount > 0n && amount <= MAX_CASE_FEE;
  }
  if (to === getAddress(t.faucetToken) && call.functionName === "faucet") return true;
  if (to === getAddress(t.selfVerifyIdentity) && call.functionName === "verifyMe") return true;
  return false;
}
