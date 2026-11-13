# Who's Right? — contracts

Two verified humans settle an argument with a randomly drawn jury of verified humans on Celo.
Two modes, chosen by the person opening the case:

- **One-sided ("Ask the jury", the app's default):** only A pays. There is no second party and no join step;
  the jury votes **Right** or **Wrong**.
- **Two-sided ("Settle it together"):** A invites B, both pay the same fee, and the jury picks a side.

The whole pot goes to jurors who reveal their vote on time; the winner receives nothing. If no verdict is reached,
everyone who paid is refunded.

Built with Foundry, OpenZeppelin v5.1.0, GoodDollar G$ + Identity, and Witnet randomness.

## Contracts

| Contract | Purpose |
|---|---|
| `src/RestMyCase.sol` | Cases, juror pool, jury draw, commit-reveal voting, payouts |
| `src/randomness/WitnetRandomnessSource.sol` | Mainnet randomness (Witnet Randomness V2) |
| `src/randomness/InsecureTestnetRandomness.sol` | **Testnet only, insecure.** Refuses to deploy on Celo mainnet |
| `src/testnet/TestnetGoodDollar.sol` | Testnet only. G$ stand-in with a faucet |
| `src/testnet/TestnetIdentity.sol` | Testnet only. Identity stand-in; anyone can self-verify |

## Deployments

### Celo Sepolia (chain 11142220) — testnet, v2 (one-sided cases) deployed 2026-11-07

| Contract | Address |
|---|---|
| WhosRight (v2, deployed before the rename to RestMyCase) | `0x94a36d3437daA547c25c4Bf41907dD891e196d14` |
| TestnetGoodDollar (tG$) | `0xB4e8a6c837744A21b6d94C08FDeB3cf4E0696a36` |
| TestnetIdentity | `0x71386420228BF609FA916EE1B676f3A81c803B2F` |
| InsecureTestnetRandomness | `0x9C8943Cd33FC2e315b54b4CB761b88Dc6f70D804` |

Owner `0x72ded37D6090671231b41ceEAb34f60A0FEA320c`. Jury 5, min pool 7, join window 1 day, draw window 1 hour,
Standard 100 tG$ / Fast 300 tG$, cap 1,000. v2 reuses the tG$, Identity and randomness stand-ins from the first
deployment. The v1 WhosRight (`0xCbF0AD90F0F48BBf5367Be07FED166d07bCE3f6b`, no one-sided cases) is retired. Testers: call `faucet()` on TestnetGoodDollar and `verifyMe()` on TestnetIdentity.

### Celo mainnet (chain 42220), deployed 2026-11-10, block 82508249

| Contract | Address |
|---|---|
| WhosRight | `0x71386420228bf609fa916ee1b676f3a81c803b2f` |
| WitnetRandomnessSource | `0xb4e8a6c837744a21b6d94c08fdeb3cf4e0696a36` |

Owner `0x72ded37D6090671231b41ceEAb34f60A0FEA320c` (move to a multisig after launch). Real G$ and GoodDollar Identity,
Witnet randomness. Jury 5, min pool 11, join window 3 days, draw window 2 hours, Standard 100 G$ / Fast 300 G$,
cap 1,000. Source verified on Blockscout. Same deployer and nonces as the Sepolia stand-ins, so these two addresses
match the Sepolia TestnetIdentity and tG$ addresses; they are different contracts on different chains.

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
| Standard | 100 G$ | 6 hours | 6 hours |
| Fast | 300 G$ | 1 hour | 1 hour |

The fee and both windows are copied onto the case when it is opened. Later fee changes by the owner never affect
existing cases. B must pass the speed and fee they were shown to `joinCase`; if they differ the join reverts,
and B always pays exactly what A paid.

### Paying the fee ("use today's claim")

Users can pay with the G$ they claim from GoodDollar UBI that day. Don't assume one claim covers either fee: the
daily claim amount changes and can be less than the Fast fee or even the Standard fee. Before any payment
(open or join), the frontend:

1. Reads the fee: `speedFee(speed)` for A, or `getCase(caseId).fee` for B.
2. Reads the user's G$ balance and today's unclaimed amount (`checkEntitlement(user)` on GoodDollar's UBIScheme;
   0 if already claimed).
3. If `balance >= fee`: one tap pays (approve + `openCase`/`joinCase`).
4. If `balance < fee` but `balance + todaysClaim >= fee`: one tap claims and pays. Use one batched wallet request
   (`wallet_sendCalls`: `claim()` → `approve` → `openCase`/`joinCase`) when the wallet supports it, otherwise
   send the same calls one after another from the same tap.
5. Otherwise, block payment with a clear message, for example: "You need 300 G$ for Fast. You have 120 G$
   (including today's claim). Choose Standard (100 G$) or come back after your next claim."

There is no welcome credit or subsidy.

Stages end early: the commit stage ends the moment every juror has committed (the full reveal window starts then),
and the reveal stage ends the moment every committed juror has revealed, so `finalize` can run immediately.

## Modes

| | One-sided | Two-sided |
|---|---|---|
| Who pays | A only | A and B, the same locked fee |
| Join step | None: the case opens ready for the jury (`status = Joined`, `drawDeadline = now + drawWindow`) | B joins with the invite before `joinDeadline` |
| `inviteSigner` | Must be `address(0)` | Must be non-zero |
| Votes | 1 = Right (A is right), 2 = Wrong (`VOTE_RIGHT` / `VOTE_WRONG`) | 1 = A, 2 = B |
| Pot | A's deposit | Both deposits |
| No verdict | A refunded | Both refunded |

The mode is stored on the case (`getCase(id).mode`). Everything after opening (jury request, draw, commit-reveal,
early stage endings, finalize, refunds, withdraw) is the same code path for both modes. `partyB`/`rootB` stay zero
on one-sided cases; refunds skip a zero deposit, and nothing is ever credited to `address(0)` (an invariant test
checks this).

## How a case works

1. **Juror pool.** Verified humans call `joinPool()` (free). One active entry per identity and per wallet.
2. **Open.** A approves the speed's fee (`speedFee(speed)`) and calls `openCase(speed, mode, contentHash, inviteSigner)`.
   One-sided cases skip step 3 and go straight to step 4.
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
| Nobody reveals | Everyone who paid refunded (one-sided: A) |
| Tie (even number of reveals, split) | Everyone who paid refunded; jurors unpaid |
| Juror doesn't commit or reveal | Gets nothing |

Rounding: each revealer gets `pot / r`; the first `pot % r` revealers (in jury order) get 1 extra wei. Nothing is left over.

## Owner powers (complete list)

The deployer keystore is the owner at launch. Move ownership to a multisig after launch
(`transferOwnership(multisig)` then `acceptOwnership()` from the multisig — `Ownable2Step`).

1. `setNewCasesPaused(bool)` — stops/starts `openCase` only.
2. `setSpeedFee(speed, uint256)` — per-party fee for NEW cases of that speed; must be `> 0` and
   `<= MAX_CASE_FEE` (1,000 G$). Existing cases keep the fee and windows locked at creation.
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

Run all commands from `contracts/`.

```sh
forge test                                             # unit, reentrancy, fuzz, invariant (no network)
RUN_FORK_TESTS=true forge test --match-path test/fork  # real G$, Identity and Witnet on a Celo fork
```

## Deployment

Uses an encrypted Foundry keystore. Never commit private keys or `.env` files.

```sh
cast wallet import whos-right --interactive

# Celo Sepolia
forge script script/DeployTestnet.s.sol --rpc-url celo_sepolia --account whos-right --broadcast

# Celo mainnet — dry run first; broadcast only after explicit approval
forge script script/DeployMainnet.s.sol --rpc-url celo --account whos-right
```

Fees start at the presets (Standard 100, Fast 300 G$ per party; cap 1,000) on both networks. Voting windows are fixed presets.
Other defaults (env-overridable: `JURY_SIZE`, `MIN_POOL_SIZE`, `JOIN_WINDOW`, `DRAW_WINDOW`):

| | Testnet | Mainnet |
|---|---|---|
| Jury size | 5 | 5 |
| Min pool size | 7 | 5 |
| Join window / draw window | 1 day / 1 hour | 3 days / 2 hours |

## Post-launch list

- Move ownership to a multisig
- External audit
- Juror stake and rewards for voting with the majority (today a random vote earns the same as a careful one)
- Replace no-show jurors; drop jurors from the pool after repeated no-shows
- Appeals / larger juries
- Indexer or subgraph for case discovery
- Past verdicts: a public, endless-scroll feed of past verdicts (Twitter-style), with "Start a case" prompts mixed in.
  Only cases both parties agreed to make public; either side can have a case removed at any time
- Voice input for sides: record a side, convert it to text, and use AI to tidy it into a short case without changing
  its meaning or making it more persuasive. Then run the privacy filters and let the person edit and confirm before
  paying. The audio is deleted after transcription; only the final text is stored
