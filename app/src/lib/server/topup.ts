import "server-only";
import { createWalletClient, formatEther, parseEther, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { identityAbi } from "@/lib/abi/tokens";
import { ZERO_ADDRESS } from "@/lib/cases";
import { GAS_BUDGET, TESTNET_ONLY_STEPS, type GasStep } from "@/lib/gasSteps";
import { network, rpcTransport } from "@/lib/network";
import { publicClient } from "./chain";
import { db } from "./supabase";

/**
 * Gas top-up: sends a verified user just enough CELO for the steps they're about to take, only if they don't
 * already have enough. Separate wallet and limits from the keeper. Limits (rolling 24h): per wallet, per verified
 * person (identity root, so connected wallets share one allowance), per Privy user, and a global cap.
 * Mainnet: verified people only. Testnet: unverified users allowed too (the test "Verify" itself needs gas),
 * keyed by their Privy user id.
 */
const cfg = () => ({
  maxPerTx: parseEther(process.env.TOPUP_MAX_PER_TX_CELO ?? "0.05"),
  maxWallet: parseEther(process.env.TOPUP_MAX_PER_WALLET_DAY_CELO ?? "0.15"),
  maxPerson: parseEther(process.env.TOPUP_MAX_PER_PERSON_DAY_CELO ?? "0.15"),
  maxGlobal: parseEther(process.env.TOPUP_DAILY_CAP_CELO ?? "1"),
});
const ROUND = parseEther("0.001");
const MIN_TOPUP = parseEther("0.002");

export type TopupResult =
  | { sent: false; reason: "enough"; balanceWei: string; needWei: string }
  | { sent: true; amountWei: string; txHash: Hex }
  | { sent: false; reason: "not_verified" | "limit" | "unavailable" | "too_large"; message: string };

export async function requestTopup(input: { userId: string; address: Address; steps: GasStep[] }): Promise<TopupResult> {
  const { userId, address, steps } = input;
  const pk = process.env.TOPUP_PRIVATE_KEY as Hex | undefined;
  if (!pk) return { sent: false, reason: "unavailable", message: "Gas top-ups aren't available right now." };
  if (!network.testnet && steps.some((s) => TESTNET_ONLY_STEPS.includes(s))) {
    return { sent: false, reason: "unavailable", message: "That step isn't available on this network." };
  }

  const root = await publicClient.readContract({
    address: network.identity,
    abi: identityAbi,
    functionName: "getWhitelistedRoot",
    args: [address],
  });
  const verified = root !== ZERO_ADDRESS;
  if (!verified && !network.testnet) {
    return { sent: false, reason: "not_verified", message: "Verify you're a real person to get free gas." };
  }
  const person = verified ? root.toLowerCase() : `privy:${userId}`;

  const [gasPrice, balance] = await Promise.all([publicClient.getGasPrice(), publicClient.getBalance({ address })]);
  const units = steps.reduce((sum, s) => sum + GAS_BUDGET[s], 0n);
  const need = (units * gasPrice * 15n) / 10n; // 50% margin for price moves
  if (balance >= need) return { sent: false, reason: "enough", balanceWei: balance.toString(), needWei: need.toString() };

  const c = cfg();
  let amount = need - balance;
  amount = ((amount + ROUND - 1n) / ROUND) * ROUND;
  if (amount < MIN_TOPUP) amount = MIN_TOPUP;
  if (amount > c.maxPerTx) {
    return { sent: false, reason: "too_large", message: "That needs more gas than we can cover in one go." };
  }

  const { data: reserved, error } = await db()
    .rpc("gas_topup_reserve", {
      p_network: network.name,
      p_wallet: address.toLowerCase(),
      p_person: person,
      p_user: userId,
      p_amount: amount.toString(),
      p_max_wallet: c.maxWallet.toString(),
      p_max_person: c.maxPerson.toString(),
      p_max_user: c.maxPerson.toString(),
      p_max_global: c.maxGlobal.toString(),
    })
    .single<{ id: number | null; reason: string | null }>();
  if (error || !reserved) return { sent: false, reason: "unavailable", message: "Gas top-ups aren't available right now." };
  if (!reserved.id) {
    return {
      sent: false,
      reason: "limit",
      message:
        reserved.reason === "global"
          ? "Today's free gas is used up. Add a little CELO yourself, or try again tomorrow."
          : `You've had today's free gas (up to ${formatEther(c.maxPerson)} CELO a day). Add a little CELO yourself, or try again tomorrow.`,
    };
  }

  const account = privateKeyToAccount(pk);
  const wallet = createWalletClient({ account, chain: network.chain, transport: rpcTransport() });
  try {
    let hash: Hex | undefined;
    for (let attempt = 0; attempt < 2 && !hash; attempt++) {
      try {
        hash = await wallet.sendTransaction({ to: address, value: amount });
      } catch (e) {
        // Two top-ups at once can collide on nonce; retry once with a fresh one.
        if (attempt === 1 || !/nonce|replacement/i.test(String(e))) throw e;
      }
    }
    const receipt = await publicClient.waitForTransactionReceipt({ hash: hash! });
    const ok = receipt.status === "success";
    await db().from("gas_topups").update({ status: ok ? "sent" : "failed", tx_hash: hash }).eq("id", reserved.id);
    if (!ok) throw new Error("top-up reverted");
    return { sent: true, amountWei: amount.toString(), txHash: hash! };
  } catch {
    await db().from("gas_topups").update({ status: "failed" }).eq("id", reserved.id);
    return { sent: false, reason: "unavailable", message: "Couldn't send gas right now. Try again in a minute." };
  }
}
