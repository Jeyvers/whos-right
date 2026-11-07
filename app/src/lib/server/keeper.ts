import "server-only";
import { createWalletClient, parseEther, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { whosRightAbi } from "@/lib/abi/whosRight";
import { identityAbi } from "@/lib/abi/tokens";
import type { ChainCase } from "@/lib/cases";
import { decide, type Action } from "@/lib/keeperRules";
import { network, rpcTransport } from "@/lib/network";
import { publicClient } from "./chain";
import { db } from "./supabase";

/**
 * The keeper moves cases forward so nobody has to press buttons:
 *   requestJury, drawJury, finalize, cancelExpired (refunds), removeInvalidPoolEntry (pool hygiene).
 * Every action is also callable by anyone, so if the keeper is capped or down, users can still press the buttons
 * themselves and every case can still reach a refund.
 *
 * Spending limit: KEEPER_DAILY_CAP_CELO per UTC day (gas + randomness fees). The last 20% of the cap is reserved
 * for refunds, verdicts and draws, so paying for new jury requests can never use up the budget refunds need.
 */

const LEASE_SECONDS = 55;
const MAX_TX_PER_RUN = 6;
const MAX_CASES_SCANNED = 100;
const MAX_POOL_CHECKED = 40;
const REFUND_RESERVE_PCT = 20n;

type Step = { action: Action | "removeInvalidPoolEntry"; caseId?: bigint; poolIndex?: bigint; txHash: Hex; costWei: bigint };
export type KeeperResult = {
  ran: boolean;
  reason?: "busy" | "capped" | "not-configured";
  steps: Step[];
  capped: boolean;
  error?: string;
};

function dailyCap(): bigint {
  return parseEther(process.env.KEEPER_DAILY_CAP_CELO ?? "1");
}

function keeperAccount() {
  const pk = process.env.KEEPER_PRIVATE_KEY as Hex | undefined;
  if (!pk) return null;
  return privateKeyToAccount(pk);
}

function nextUtcMidnight(): string {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d.toISOString();
}

export async function runKeeper(trigger: string): Promise<KeeperResult> {
  const account = keeperAccount();
  const wr = network.whosRight;
  if (!account || !wr) return { ran: false, reason: "not-configured", steps: [], capped: false };

  const { data: gotLease } = await db().rpc("keeper_take_lease", { p_network: network.name, p_seconds: LEASE_SECONDS });
  if (!gotLease) return { ran: false, reason: "busy", steps: [], capped: false };

  const wallet = createWalletClient({ account, chain: network.chain, transport: rpcTransport() });
  const steps: Step[] = [];
  let capped = false; // full daily cap reached: nothing more today
  let budgetLow = false; // past the reserve line: only refunds, verdicts and draws
  let error: string | undefined;

  const { data: state } = await db().from("keeper_state").select("*").eq("network", network.name).single();
  let nextCaseId = BigInt(state?.next_case_id ?? 1);
  let nextPoolIndex = BigInt(state?.next_pool_index ?? 0);

  const today = new Date().toISOString().slice(0, 10);
  const { data: spendRow } = await db()
    .from("keeper_spend")
    .select("spent_wei")
    .eq("network", network.name)
    .eq("day", today)
    .maybeSingle();
  let spent = BigInt(spendRow?.spent_wei ?? 0);
  const cap = dailyCap();
  const reserveStart = cap - (cap * REFUND_RESERVE_PCT) / 100n; // spending above this is refunds/verdicts only

  /** Dry-run, check the budget, send, wait, record. Returns false if the budget stops it. */
  async function send(
    action: Step["action"],
    args: readonly unknown[],
    meta: { caseId?: bigint; poolIndex?: bigint },
    value = 0n,
  ): Promise<boolean> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { request } = await publicClient.simulateContract({ account, address: wr!, abi: whosRightAbi, functionName: action, args: args as any, value } as any);
    const [gas, gasPrice] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Celo tx-type unions confuse viem's typing
      publicClient.estimateContractGas(request as any),
      publicClient.getGasPrice(),
    ]);
    const estimate = (gas * gasPrice * 13n) / 10n + value;
    const reserveOnly = action === "requestJury" || action === "removeInvalidPoolEntry";
    if (spent + estimate > (reserveOnly ? reserveStart : cap)) {
      if (reserveOnly) budgetLow = true;
      else capped = true;
      return false;
    }
    const hash = await wallet.writeContract(request);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const cost = receipt.gasUsed * receipt.effectiveGasPrice + value;
    const { data: total } = await db().rpc("keeper_add_spend", { p_network: network.name, p_wei: cost.toString() });
    spent = total !== null && total !== undefined ? BigInt(total) : spent + cost;
    await db().from("keeper_txs").insert({
      network: network.name,
      action,
      case_id: meta.caseId?.toString() ?? null,
      tx_hash: hash,
      cost_wei: cost.toString(),
    });
    steps.push({ action, ...meta, txHash: hash, costWei: cost });
    if (receipt.status !== "success") throw new Error(`${action} reverted (${hash})`);
    return true;
  }

  try {
    if (spent >= cap) capped = true;
    if (spent >= reserveStart) budgetLow = true;
    const block = await publicClient.getBlock();
    const now = block.timestamp;
    const caseCount = await publicClient.readContract({ address: wr, abi: whosRightAbi, functionName: "caseCount" });

    // 1. Cases, oldest unfinished first.
    let cursorMovable = true;
    const end = caseCount < nextCaseId + BigInt(MAX_CASES_SCANNED) ? caseCount : nextCaseId + BigInt(MAX_CASES_SCANNED) - 1n;
    for (let id = nextCaseId; id <= end && steps.length < MAX_TX_PER_RUN && !capped; id++) {
      const [c, jurors, ready] = await Promise.all([
        publicClient.readContract({ address: wr, abi: whosRightAbi, functionName: "getCase", args: [id] }) as Promise<ChainCase>,
        publicClient.readContract({ address: wr, abi: whosRightAbi, functionName: "getJurors", args: [id] }),
        publicClient.readContract({ address: wr, abi: whosRightAbi, functionName: "isRandomnessReady", args: [id] }),
      ]);
      const finished = c.status === 5 || c.status === 6;
      if (finished && cursorMovable) {
        nextCaseId = id + 1n;
        continue;
      }
      const atCursor = cursorMovable;
      cursorMovable = false;
      const action = decide(c, jurors.length, ready, now);
      if (!action) continue;
      if (action === "requestJury" && budgetLow) continue;
      let value = 0n;
      if (action === "requestJury") {
        const fee = await publicClient.readContract({
          address: wr,
          abi: whosRightAbi,
          functionName: "randomnessFee",
          args: [await publicClient.getGasPrice()],
        });
        value = fee === 0n ? 0n : (fee * 12n) / 10n; // excess is returned by the adapter
      }
      const sent = await send(action, [id], { caseId: id }, value);
      if (!sent) {
        if (capped) break;
        continue; // jury request skipped to protect the refund reserve
      }
      // cancelExpired and finalize always end the case.
      if (atCursor && (action === "cancelExpired" || action === "finalize")) {
        nextCaseId = id + 1n;
        cursorMovable = true;
      }
    }

    // 2. Pool pruning: drop entries whose wallet is no longer the same verified identity.
    if (!capped && !budgetLow && steps.length < MAX_TX_PER_RUN) {
      const poolLength = await publicClient.readContract({ address: wr, abi: whosRightAbi, functionName: "poolLength" });
      if (nextPoolIndex >= poolLength) nextPoolIndex = 0n;
      const stop = nextPoolIndex + BigInt(MAX_POOL_CHECKED);
      for (let i = nextPoolIndex; i < poolLength && i < stop && steps.length < MAX_TX_PER_RUN && !capped && !budgetLow; i++) {
        const e = (await publicClient.readContract({ address: wr, abi: whosRightAbi, functionName: "poolEntry", args: [i] })) as {
          wallet: Address;
          root: Address;
          leftBlock: bigint;
        };
        nextPoolIndex = i + 1n;
        if (e.leftBlock !== 0n) continue;
        const root = await publicClient.readContract({
          address: network.identity,
          abi: identityAbi,
          functionName: "getWhitelistedRoot",
          args: [e.wallet],
        });
        if (root.toLowerCase() === e.root.toLowerCase()) continue;
        await send("removeInvalidPoolEntry", [i], { poolIndex: i });
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message.slice(0, 500) : String(e);
  } finally {
    await db()
      .from("keeper_state")
      .update({
        lease_until: null,
        next_case_id: nextCaseId.toString(),
        next_pool_index: nextPoolIndex.toString(),
        capped_until: capped || budgetLow ? nextUtcMidnight() : null,
        last_run_at: new Date().toISOString(),
        last_error: error ?? null,
      })
      .eq("network", network.name);
  }
  void trigger;
  return { ran: true, steps, capped: capped || budgetLow, error };
}

export type KeeperStatus = { configured: boolean; capped: boolean; cappedUntil: string | null; lastRunAt: string | null; healthy: boolean };

/** Public status for the app banner. */
export async function keeperStatus(): Promise<KeeperStatus> {
  if (!keeperAccount()) return { configured: false, capped: false, cappedUntil: null, lastRunAt: null, healthy: false };
  const { data } = await db()
    .from("keeper_state")
    .select("capped_until, last_run_at")
    .eq("network", network.name)
    .maybeSingle();
  const cappedUntil = data?.capped_until ?? null;
  const capped = Boolean(cappedUntil && new Date(cappedUntil) > new Date());
  const lastRunAt = data?.last_run_at ?? null;
  const healthy = Boolean(lastRunAt && Date.now() - new Date(lastRunAt).getTime() < 5 * 60_000);
  return { configured: true, capped, cappedUntil: capped ? cappedUntil : null, lastRunAt, healthy };
}
