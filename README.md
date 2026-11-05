# Who's Right? — contracts

Two verified humans settle an argument with a randomly drawn jury of verified humans on Celo.
Both parties pay the same G$ fee. The whole pot goes to jurors who reveal their vote on time;
the winner receives nothing. If no verdict is reached, both parties are refunded.

Built with Foundry, OpenZeppelin v5.1.0, GoodDollar G$ + Identity, and Witnet randomness.

## Contracts

| Contract | Purpose |
|---|---|
| `src/WhosRight.sol` | Cases, juror pool, jury draw, commit-reveal voting, payouts |
| `src/randomness/WitnetRandomnessSource.sol` | Mainnet randomness (Witnet Randomness V2) |
| `src/randomness/InsecureTestnetRandomness.sol` | **Testnet only, insecure.** Refuses to deploy on Celo mainnet |
| `src/testnet/TestnetGoodDollar.sol` | Testnet only. G$ stand-in with a faucet |
| `src/testnet/TestnetIdentity.sol` | Testnet only. Identity stand-in; anyone can self-verify |

## External addresses (Celo mainnet, chain 42220)

| What | Address | Source |
|---|---|---|
| G$ (18 decimals) | `0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A` | GoodProtocol `releases/deployment.json` → `production-celo`; GoodSDKs `citizen-sdk` |
| Identity | `0xC361A6E67822a0EDc17D899227dd9FC50BD62F42` | same |
| WitnetRandomnessV2 | `0xC0FFEE98AD1434aCbDB894BbB752e138c1006fAB` | docs.witnet.io randomness contract-address catalog; `class()` returns `WitnetRandomnessV2` |

GoodDollar has no contracts on Celo Sepolia, and Witnet is not deployed there, so testnet uses the stand-ins above.
GoodDollar's "development"/"staging" G$ and Identity also live on Celo **mainnet**, not a testnet.

## Speeds

Party A picks one of two presets when opening a case. There are no custom time limits.

| Speed | Fee per party | Max commit stage | Max reveal stage |
|---|---|---|---|
| Standard | 500 G$ | 6 hours | 6 hours |
| Fast | 1,500 G$ | 1 hour | 1 hour |

The fee and both windows are copied onto the case when it is opened. Later fee changes by the owner never affect
existing cases. B must pass the speed and fee they were shown to `joinCase`; if they differ the join reverts,
and B always pays exactly what A paid.

Stages end early: the commit stage ends the moment every juror has committed (the full reveal window starts then),
and the reveal stage ends the moment every committed juror has revealed, so `finalize` can run immediately.

## How a case works

1. **Juror pool.** Verified humans call `joinPool()` (free). One active entry per identity and per wallet.
2. **Open.** A approves the speed's fee (`speedFee(speed)`) and calls `openCase(speed, contentHash, inviteSigner)`.
   Only a hash is stored.
   `inviteSigner` is the address of a one-time key generated in A's browser; its private key goes in the share link.
3. **Join.** B's client signs `joinDigest(caseId, B)` with the invite key and B calls
   `joinCase(caseId, contentHash, expectedSpeed, expectedFee, signature)`, paying the same locked fee before
   `joinDeadline`. The frontend reads `getCase(caseId)` and shows the speed and fee before B signs.
   The signature commits to B's address, so someone copying it from the mempool cannot take the seat.
4. **Request jury.** Anyone calls `requestJury(caseId)` with the CELO randomness fee. This freezes the pool snapshot.
5. **Draw.** Once randomness is ready (Witnet: usually 5–10 min), anyone calls `drawJury(caseId)`.
6. **Commit.** Each juror calls `commitVote(caseId, computeCommitment(caseId, juror, vote, salt))`. Vote 1 = A, 2 = B.
7. **Reveal.** Once the commit stage ends (deadline, or every juror committed) jurors call `revealVote(caseId, vote, salt)`.
8. **Finalize.** Anyone calls `finalize(caseId)` once the reveal stage ends (deadline, or every committed juror revealed).
9. **Withdraw.** Everyone pulls what they are owed with `withdraw()`.

### Outcomes

| Situation | Result |
|---|---|
| Majority of revealed votes | Verdict recorded; pot split equally among revealers |
| B never joins | `cancelExpired` after `joinDeadline` → A refunded |
| Active pool `< minPoolSize` at `requestJury` | Case refunded immediately; caller's CELO returned |
| Fewer distinct eligible jurors than `jurySize` | Case refunded at `drawJury` |
| Randomness late or failed past `drawDeadline` | `cancelExpired` → both refunded |
| Nobody reveals | Both refunded |
| Tie (even number of reveals, split) | Both refunded; jurors unpaid |
| Juror doesn't commit or reveal | Gets nothing |

Rounding: each revealer gets `pot / r`; the first `pot % r` revealers (in jury order) get 1 extra wei. Nothing is left over.

## Owner powers (complete list)

The deployer keystore is the owner at launch. Move ownership to a multisig after launch
(`transferOwnership(multisig)` then `acceptOwnership()` from the multisig — `Ownable2Step`).

1. `setNewCasesPaused(bool)` — stops/starts `openCase` only.
2. `setSpeedFee(speed, uint256)` — per-party fee for NEW cases of that speed; must be `> 0` and
   `<= MAX_CASE_FEE` (10,000 G$). Existing cases keep the fee and windows locked at creation.
   The owner cannot change the commit/reveal windows (they are constants).
3. `transferOwnership` / `acceptOwnership` / `renounceOwnership`.

The owner **cannot** move or withdraw funds, change verdicts, change jurors, change the token/identity/randomness
source, or block joining, voting, finalizing, refunds or withdrawals. There is no upgrade path.

## Randomness (Witnet)

- **Who pays:** whoever calls `requestJury` / `retryRandomness` pays the Witnet fee in CELO.
  Read it with `randomnessFee(gasPrice)` (≈0.05 CELO at 200 gwei on 2026‑11‑05). The adapter forwards exactly
  Witnet's estimate for the transaction's gas price and returns any excess to the caller in the same transaction.
- **Fee changes:** the fee is read live from Witnet at call time. If it rises between estimate and call,
  the call reverts with `InsufficientFee` and nothing changes; the frontend re-quotes and retries.
- **Late randomness:** typical latency is 5–10 minutes. The draw window (mainnet default 2 hours) is far longer.
- **Failed randomness:** `retryRandomness` posts another Witnet request. The seed is keyed to the original
  request block (Witnet returns the first successful result at or after it), so a retry cannot re-roll a known seed.
- **Never trapped:** if no jury is drawn by `drawDeadline`, `cancelExpired` refunds both parties.
- **Pool manipulation:** the draw only uses pool entries that were active at the request block. Joining or leaving
  the pool after that block cannot change who is drawn.

## Why expired jurors are not skipped during the draw

The draw deliberately reads no Identity state, because everything it could read can be changed after the random
seed is public, which would let someone steer who fills a seat:

- **Timing:** anyone may call `drawJury`, at any time in the draw window. GoodDollar verification expires on an
  admin-set schedule (currently 1, then 7, then 180 days by verification count), so expiries happen constantly.
  A caller could wait for a specific juror to expire, or draw before one does, to change the jury.
- **Disconnecting:** a pool wallet that is a connected account can be disconnected instantly and for free.
- **Renouncing or re-verifying:** a juror can change their own status after seeing the seed.

Storing an expiry date at `joinPool` is not reliable either: the schedule depends on internal Identity counters
and can be changed by GoodDollar's admins at any time.

Instead, expired jurors are handled without any lever:
- `removeInvalidPoolEntry(index)` lets anyone prune a pool entry that is no longer verified. Pruning only affects
  future snapshots, so it cannot alter a pending draw. A keeper should prune regularly.
- A drawn juror must still resolve to the same verified identity to commit; if not, the seat simply stays empty.
  Fees are shared only among jurors who reveal, and a case with no reveals refunds both parties.

## Tests

```sh
forge test                                             # unit, reentrancy, fuzz, invariant (no network)
RUN_FORK_TESTS=true forge test --match-path test/fork  # real G$, Identity and Witnet on a Celo fork
```

## Deployment

Uses an encrypted Foundry keystore. Never commit private keys or `.env` files.

```sh
cast wallet import whosright-deployer --interactive

# Celo Sepolia
forge script script/DeployTestnet.s.sol --rpc-url celo_sepolia --account whosright-deployer --broadcast

# Celo mainnet — dry run first; broadcast only after explicit approval
forge script script/DeployMainnet.s.sol --rpc-url celo --account whosright-deployer
```

Fees start at the presets (Standard 500, Fast 1,500 per party) on both networks. Voting windows are fixed presets.
Other defaults (env-overridable: `JURY_SIZE`, `MIN_POOL_SIZE`, `JOIN_WINDOW`, `DRAW_WINDOW`):

| | Testnet | Mainnet |
|---|---|---|
| Jury size | 5 | 5 |
| Min pool size | 7 | 11 |
| Join window / draw window | 1 day / 1 hour | 3 days / 2 hours |

## Post-launch list

- Move ownership to a multisig
- External audit
- Juror stake and rewards for voting with the majority (today a random vote earns the same as a careful one)
- Replace no-show jurors; drop jurors from the pool after repeated no-shows
- Appeals / larger juries
- Indexer or subgraph for case discovery
