// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

import {IIdentity} from "./interfaces/IIdentity.sol";
import {IRandomnessSource} from "./interfaces/IRandomnessSource.sol";

/// @title Who's Right?
/// @notice Two verified humans settle an argument with a randomly drawn jury of verified humans.
///         Both parties pay the same G$ fee; the whole pot is shared equally by jurors who reveal on time.
///         The winner receives no money. If no verdict is reached, both parties are refunded.
/// @dev Owner powers (complete list): pause/unpause NEW cases, change the fee for NEW cases (<= MAX_CASE_FEE),
///      and transfer/renounce ownership. The owner cannot move funds, change verdicts, or block
///      joins, votes, refunds or withdrawals. All payouts are pulled via `withdraw()`.
contract WhosRight is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------------------------------------
    // Constants & immutables
    // ---------------------------------------------------------------------------------------------

    /// @notice Hard cap on the per-party fee. G$ on Celo has 18 decimals.
    uint256 public constant MAX_CASE_FEE = 10_000e18;
    uint256 public constant MAX_JURY_SIZE = 31;
    /// @notice Upper bound on random picks per draw (keeps drawJury gas bounded).
    uint256 public constant MAX_DRAW_ATTEMPTS = 300;
    uint256 public constant MAX_WINDOW = 30 days;

    /// @notice Preset maximum commit and reveal windows. Not configurable by anyone.
    uint256 public constant STANDARD_STAGE_WINDOW = 6 hours;
    uint256 public constant FAST_STAGE_WINDOW = 1 hours;

    uint8 public constant VOTE_PARTY_A = 1;
    uint8 public constant VOTE_PARTY_B = 2;

    IERC20 public immutable token;
    IIdentity public immutable identity;
    IRandomnessSource public immutable randomnessSource;

    uint256 public immutable jurySize;
    /// @notice Minimum number of active pool entries required before a jury can be requested.
    uint256 public immutable minPoolSize;
    uint256 public immutable joinWindow;
    uint256 public immutable drawWindow;

    // ---------------------------------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------------------------------

    enum Status {
        None,
        Open, // A paid, waiting for B
        Joined, // B paid, waiting for a jury request
        Drawing, // randomness requested, waiting to draw
        Voting, // jury drawn: commit, then reveal
        Resolved, // verdict reached, jurors credited
        Refunded // no verdict, parties credited
    }

    /// @notice Chosen by Party A. Standard: 6h max commit + 6h max reveal. Fast: 1h + 1h, higher fee.
    enum Speed {
        Standard,
        Fast
    }

    enum Verdict {
        None,
        PartyA,
        PartyB
    }

    enum RefundReason {
        None,
        NotJoined,
        PoolTooSmall,
        NotEnoughEligibleJurors,
        DrawTimeout,
        NoReveals,
        Tie
    }

    struct Case {
        address partyA;
        address rootA;
        address partyB;
        address rootB;
        address inviteSigner;
        Speed speed;
        Status status;
        Verdict verdict;
        RefundReason refundReason;
        bytes32 contentA;
        bytes32 contentB;
        uint256 fee; // per party, locked at creation
        uint64 commitWindow; // max commit stage length, locked at creation
        uint64 revealWindow; // max reveal stage length, locked at creation
        uint256 depositA; // G$ actually received from A
        uint256 depositB; // G$ actually received from B
        uint64 joinDeadline;
        uint64 drawDeadline;
        uint64 commitDeadline;
        uint64 revealDeadline;
        uint64 snapshotBlock;
        uint64 snapshotPoolLength;
        uint256 randomnessId;
        uint8 commits;
        uint8 reveals;
        uint8 votesA;
        uint8 votesB;
    }

    struct JurorVote {
        address root; // non-zero iff the wallet is on this case's jury
        bytes32 commitment;
        uint8 vote;
        bool revealed;
    }

    struct PoolEntry {
        address wallet;
        address root;
        uint64 joinedBlock;
        uint64 leftBlock; // 0 while active
    }

    // ---------------------------------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------------------------------

    /// @notice Per-party fee for NEW cases of each speed. Existing cases keep their locked fee.
    mapping(Speed => uint256) public speedFee;
    bool public newCasesPaused;
    uint256 public caseCount;

    mapping(uint256 => Case) internal _cases;
    mapping(uint256 => address[]) internal _jurors;
    mapping(uint256 => mapping(address => JurorVote)) internal _jurorVotes;

    /// @notice Append-only juror pool. An entry is eligible for a case if it was active at the case's snapshot block.
    PoolEntry[] internal _pool;
    /// @notice root => pool index + 1 of its active entry (0 = none).
    mapping(address => uint256) public activeEntryOfRoot;
    /// @notice wallet => pool index + 1 of its active entry (0 = none).
    mapping(address => uint256) public activeEntryOfWallet;
    uint256 public activePoolSize;

    /// @notice G$ owed to each account, claimable with `withdraw()`.
    mapping(address => uint256) public owed;
    uint256 public totalOwed;
    /// @notice G$ held for cases that have not been resolved or refunded yet.
    uint256 public totalEscrowed;

    // ---------------------------------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------------------------------

    event CaseOpened(
        uint256 indexed caseId,
        address indexed partyA,
        address rootA,
        Speed speed,
        bytes32 contentHash,
        address inviteSigner,
        uint256 fee,
        uint64 commitWindow,
        uint64 revealWindow,
        uint256 deposit,
        uint64 joinDeadline
    );
    event CaseJoined(
        uint256 indexed caseId, address indexed partyB, address rootB, bytes32 contentHash, uint256 deposit, uint64 drawDeadline
    );
    event JuryRequested(uint256 indexed caseId, uint256 randomnessId, uint64 snapshotBlock, uint64 snapshotPoolLength);
    event RandomnessRetried(uint256 indexed caseId, uint256 randomnessId);
    event JuryDrawn(uint256 indexed caseId, address[] jurors, uint64 commitDeadline, uint64 revealDeadline);
    event VoteCommitted(uint256 indexed caseId, address indexed juror);
    event CommitStageEnded(uint256 indexed caseId, uint64 revealDeadline);
    event RevealStageEnded(uint256 indexed caseId);
    event VoteRevealed(uint256 indexed caseId, address indexed juror, uint8 vote);
    event CaseResolved(
        uint256 indexed caseId, Verdict verdict, uint8 votesA, uint8 votesB, uint8 reveals, uint256 pot
    );
    event CaseRefunded(uint256 indexed caseId, RefundReason reason);
    event Credited(address indexed account, uint256 indexed caseId, uint256 amount);
    event Withdrawn(address indexed account, uint256 amount);
    event JurorJoinedPool(address indexed wallet, address indexed root, uint256 entryIndex);
    event JurorLeftPool(address indexed wallet, address indexed root, uint256 entryIndex);
    event SpeedFeeChanged(Speed indexed speed, uint256 oldFee, uint256 newFee);
    event NewCasesPausedSet(bool paused);

    // ---------------------------------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------------------------------

    error InvalidConfig();
    error InvalidFee();
    error NewCasesArePaused();
    error NotVerified();
    error SameIdentity();
    error InvalidInvite();
    error InvalidContentHash();
    error TermsMismatch();
    error WrongStatus();
    error DeadlinePassed();
    error DeadlineNotReached();
    error NothingReceived();
    error AlreadyInPool();
    error NotInPool();
    error EntryStillValid();
    error RandomnessNotReady();
    error RandomnessAlreadyReady();
    error NotJuror();
    error IdentityChanged();
    error AlreadyCommitted();
    error NotCommitted();
    error AlreadyRevealed();
    error RevealNotOpen();
    error InvalidVote();
    error InvalidReveal();
    error NothingToWithdraw();
    error NativeRefundFailed();

    // ---------------------------------------------------------------------------------------------
    // Construction
    // ---------------------------------------------------------------------------------------------

    struct Config {
        IERC20 token;
        IIdentity identity;
        IRandomnessSource randomnessSource;
        address owner;
        uint256 standardFee;
        uint256 fastFee;
        uint256 jurySize;
        uint256 minPoolSize;
        uint256 joinWindow;
        uint256 drawWindow;
    }

    constructor(Config memory cfg) Ownable(cfg.owner) {
        if (
            address(cfg.token) == address(0) || address(cfg.identity) == address(0)
                || address(cfg.randomnessSource) == address(0)
        ) revert InvalidConfig();
        if (cfg.jurySize == 0 || cfg.jurySize % 2 == 0 || cfg.jurySize > MAX_JURY_SIZE) revert InvalidConfig();
        if (cfg.minPoolSize < cfg.jurySize) revert InvalidConfig();
        if (
            cfg.joinWindow == 0 || cfg.drawWindow == 0 || cfg.joinWindow > MAX_WINDOW || cfg.drawWindow > MAX_WINDOW
        ) revert InvalidConfig();
        if (cfg.standardFee == 0 || cfg.standardFee > MAX_CASE_FEE) revert InvalidFee();
        if (cfg.fastFee == 0 || cfg.fastFee > MAX_CASE_FEE) revert InvalidFee();

        token = cfg.token;
        identity = cfg.identity;
        randomnessSource = cfg.randomnessSource;
        jurySize = cfg.jurySize;
        minPoolSize = cfg.minPoolSize;
        joinWindow = cfg.joinWindow;
        drawWindow = cfg.drawWindow;
        speedFee[Speed.Standard] = cfg.standardFee;
        speedFee[Speed.Fast] = cfg.fastFee;
    }

    // ---------------------------------------------------------------------------------------------
    // Owner (limited powers)
    // ---------------------------------------------------------------------------------------------

    /// @notice Stops/starts `openCase`. Never affects existing cases, refunds or withdrawals.
    function setNewCasesPaused(bool paused) external onlyOwner {
        newCasesPaused = paused;
        emit NewCasesPausedSet(paused);
    }

    /// @notice Sets the per-party fee for NEW cases of `speed`. Existing cases keep their locked fee and windows.
    function setSpeedFee(Speed speed, uint256 newFee) external onlyOwner {
        if (newFee == 0 || newFee > MAX_CASE_FEE) revert InvalidFee();
        emit SpeedFeeChanged(speed, speedFee[speed], newFee);
        speedFee[speed] = newFee;
    }

    // ---------------------------------------------------------------------------------------------
    // Juror pool
    // ---------------------------------------------------------------------------------------------

    /// @notice Opt in to jury duty. One active entry per verified identity and per wallet.
    function joinPool() external nonReentrant {
        address root = _rootOf(msg.sender);
        if (activeEntryOfRoot[root] != 0 || activeEntryOfWallet[msg.sender] != 0) revert AlreadyInPool();

        _pool.push(PoolEntry({wallet: msg.sender, root: root, joinedBlock: uint64(block.number), leftBlock: 0}));
        uint256 index = _pool.length - 1;
        activeEntryOfRoot[root] = index + 1;
        activeEntryOfWallet[msg.sender] = index + 1;
        activePoolSize++;
        emit JurorJoinedPool(msg.sender, root, index);
    }

    /// @notice Leave the pool. Cases whose snapshot was taken before this block can still draw you.
    function leavePool() external nonReentrant {
        uint256 slot = activeEntryOfWallet[msg.sender];
        if (slot == 0) revert NotInPool();
        _deactivate(slot - 1);
    }

    /// @notice Anyone can remove a pool entry whose wallet no longer resolves to the same verified identity
    ///         (verification expired, wallet disconnected, ...). Does not affect existing snapshots.
    function removeInvalidPoolEntry(uint256 index) external nonReentrant {
        PoolEntry storage e = _pool[index];
        if (e.leftBlock != 0) revert NotInPool();
        if (identity.getWhitelistedRoot(e.wallet) == e.root) revert EntryStillValid();
        _deactivate(index);
    }

    function _deactivate(uint256 index) private {
        PoolEntry storage e = _pool[index];
        e.leftBlock = uint64(block.number);
        delete activeEntryOfRoot[e.root];
        delete activeEntryOfWallet[e.wallet];
        activePoolSize--;
        emit JurorLeftPool(e.wallet, e.root, index);
    }

    // ---------------------------------------------------------------------------------------------
    // Case lifecycle
    // ---------------------------------------------------------------------------------------------

    /// @notice Party A opens a case at a preset speed and pays that speed's current fee (approve it first).
    /// @param speed Standard (6h max per voting stage) or Fast (1h max per stage, higher fee).
    /// @param contentHash Hash/digest of A's off-chain argument. Never put text or personal data on-chain.
    /// @param inviteSigner Address of a one-time key generated by A's client. Its private key goes in the
    ///        share link; B proves possession by signing their own address (see `joinCase`).
    function openCase(Speed speed, bytes32 contentHash, address inviteSigner)
        external
        nonReentrant
        returns (uint256 caseId)
    {
        if (newCasesPaused) revert NewCasesArePaused();
        if (contentHash == bytes32(0)) revert InvalidContentHash();
        if (inviteSigner == address(0)) revert InvalidInvite();
        address rootA = _rootOf(msg.sender);

        caseId = ++caseCount;
        Case storage c = _cases[caseId];
        c.partyA = msg.sender;
        c.rootA = rootA;
        c.inviteSigner = inviteSigner;
        c.contentA = contentHash;
        c.speed = speed;
        c.fee = speedFee[speed];
        uint64 stageWindow = uint64(speed == Speed.Fast ? FAST_STAGE_WINDOW : STANDARD_STAGE_WINDOW);
        c.commitWindow = stageWindow;
        c.revealWindow = stageWindow;
        c.status = Status.Open;
        c.joinDeadline = uint64(block.timestamp + joinWindow);

        uint256 received = _pull(msg.sender, c.fee);
        c.depositA = received;
        totalEscrowed += received;

        emit CaseOpened(
            caseId,
            msg.sender,
            rootA,
            speed,
            contentHash,
            inviteSigner,
            c.fee,
            stageWindow,
            stageWindow,
            received,
            c.joinDeadline
        );
    }

    /// @notice Party B joins with the invite and pays the case's locked fee (the same amount A paid).
    /// @param expectedSpeed / expectedFee The terms B was shown (`getCase`); reverts if they differ.
    /// @param inviteSignature Signature by the invite key over `joinDigest(caseId, msg.sender)`.
    ///        It is bound to msg.sender, so copying it from the mempool is useless to anyone else.
    function joinCase(
        uint256 caseId,
        bytes32 contentHash,
        Speed expectedSpeed,
        uint256 expectedFee,
        bytes calldata inviteSignature
    ) external nonReentrant {
        Case storage c = _cases[caseId];
        if (c.status != Status.Open) revert WrongStatus();
        if (c.speed != expectedSpeed || c.fee != expectedFee) revert TermsMismatch();
        if (block.timestamp > c.joinDeadline) revert DeadlinePassed();
        if (contentHash == bytes32(0)) revert InvalidContentHash();
        address rootB = _rootOf(msg.sender);
        if (rootB == c.rootA) revert SameIdentity();

        (address signer, ECDSA.RecoverError err,) = ECDSA.tryRecover(joinDigest(caseId, msg.sender), inviteSignature);
        if (err != ECDSA.RecoverError.NoError || signer != c.inviteSigner) revert InvalidInvite();

        c.partyB = msg.sender;
        c.rootB = rootB;
        c.contentB = contentHash;
        c.status = Status.Joined;
        c.drawDeadline = uint64(block.timestamp + drawWindow);

        uint256 received = _pull(msg.sender, c.fee);
        c.depositB = received;
        totalEscrowed += received;

        emit CaseJoined(caseId, msg.sender, rootB, contentHash, received, c.drawDeadline);
    }

    /// @notice Requests randomness for the jury draw. Anyone may call; the caller pays the randomness fee in
    ///         CELO (see `randomnessFee`); unspent CELO is returned. Freezes the eligible pool snapshot.
    ///         If the active pool is smaller than `minPoolSize`, the case is refunded instead (and CELO returned).
    function requestJury(uint256 caseId) external payable nonReentrant {
        Case storage c = _cases[caseId];
        if (c.status != Status.Joined) revert WrongStatus();
        if (block.timestamp > c.drawDeadline) revert DeadlinePassed();

        if (activePoolSize < minPoolSize) {
            _refundParties(caseId, RefundReason.PoolTooSmall);
            _returnNative(msg.value);
            return;
        }

        c.status = Status.Drawing;
        c.snapshotBlock = uint64(block.number);
        c.snapshotPoolLength = uint64(_pool.length);
        c.randomnessId = randomnessSource.request{value: msg.value}(msg.sender);

        emit JuryRequested(caseId, c.randomnessId, c.snapshotBlock, c.snapshotPoolLength);
    }

    /// @notice Re-requests randomness if it has not arrived (e.g. Witnet error). Caller pays the CELO fee.
    ///         With Witnet the seed key does not change, so this cannot re-roll a known seed.
    function retryRandomness(uint256 caseId) external payable nonReentrant {
        Case storage c = _cases[caseId];
        if (c.status != Status.Drawing) revert WrongStatus();
        if (block.timestamp > c.drawDeadline) revert DeadlinePassed();
        if (randomnessSource.isReady(c.randomnessId)) revert RandomnessAlreadyReady();

        c.randomnessId = randomnessSource.retry{value: msg.value}(c.randomnessId, msg.sender);
        emit RandomnessRetried(caseId, c.randomnessId);
    }

    /// @notice Draws the jury once randomness is ready. Anyone may call.
    ///         Picks uniformly from pool entries that were active at the snapshot block, skipping the parties'
    ///         identities (including their connected wallets) and duplicates. If not enough distinct eligible
    ///         jurors are found within MAX_DRAW_ATTEMPTS, both parties are refunded.
    function drawJury(uint256 caseId) external nonReentrant {
        Case storage c = _cases[caseId];
        if (c.status != Status.Drawing) revert WrongStatus();
        if (block.timestamp > c.drawDeadline) revert DeadlinePassed();
        if (!randomnessSource.isReady(c.randomnessId)) revert RandomnessNotReady();

        bytes32 seed = keccak256(abi.encode(randomnessSource.randomness(c.randomnessId), caseId));
        (address[] memory picked, address[] memory roots) = _select(c, seed);

        if (picked.length < jurySize) {
            _refundParties(caseId, RefundReason.NotEnoughEligibleJurors);
            return;
        }

        address[] storage jurors = _jurors[caseId];
        for (uint256 i; i < picked.length; ++i) {
            jurors.push(picked[i]);
            _jurorVotes[caseId][picked[i]].root = roots[i];
        }
        c.status = Status.Voting;
        // Maximums; both stages end early once every juror has acted.
        c.commitDeadline = uint64(block.timestamp + c.commitWindow);
        c.revealDeadline = uint64(c.commitDeadline + c.revealWindow);
        emit JuryDrawn(caseId, picked, c.commitDeadline, c.revealDeadline);
    }

    /// @dev Deterministic given (seed, snapshot): pool changes after the snapshot cannot alter the result.
    function _select(Case storage c, bytes32 seed)
        private
        view
        returns (address[] memory picked, address[] memory pickedRoots)
    {
        uint256 n = c.snapshotPoolLength;
        uint256 target = jurySize;
        picked = new address[](target);
        pickedRoots = new address[](target);
        uint256 count;
        uint256 snap = c.snapshotBlock;
        for (uint256 attempt; n > 0 && attempt < MAX_DRAW_ATTEMPTS && count < target; ++attempt) {
            PoolEntry storage e = _pool[uint256(keccak256(abi.encode(seed, attempt))) % n];
            if (e.joinedBlock >= snap) continue; // joined at/after snapshot
            if (e.leftBlock != 0 && e.leftBlock < snap) continue; // left before snapshot
            if (e.root == c.rootA || e.root == c.rootB) continue; // parties (any of their wallets)
            bool dup;
            for (uint256 j; j < count; ++j) {
                if (pickedRoots[j] == e.root || picked[j] == e.wallet) {
                    dup = true;
                    break;
                }
            }
            if (dup) continue;
            picked[count] = e.wallet;
            pickedRoots[count] = e.root;
            count++;
        }
        assembly ("memory-safe") {
            mstore(picked, count)
            mstore(pickedRoots, count)
        }
    }

    /// @notice A juror commits `computeCommitment(caseId, juror, vote, salt)` before the commit deadline.
    function commitVote(uint256 caseId, bytes32 commitment) external nonReentrant {
        Case storage c = _cases[caseId];
        if (c.status != Status.Voting) revert WrongStatus();
        if (block.timestamp > c.commitDeadline) revert DeadlinePassed();
        JurorVote storage jv = _jurorVotes[caseId][msg.sender];
        if (jv.root == address(0)) revert NotJuror();
        if (jv.commitment != bytes32(0)) revert AlreadyCommitted();
        if (commitment == bytes32(0)) revert InvalidReveal();
        // Still the same verified human that was drawn.
        if (identity.getWhitelistedRoot(msg.sender) != jv.root) revert IdentityChanged();

        jv.commitment = commitment;
        c.commits++;
        emit VoteCommitted(caseId, msg.sender);

        // Last juror committed: end the commit stage now and start the reveal stage.
        if (c.commits == _jurors[caseId].length) {
            c.commitDeadline = uint64(block.timestamp);
            c.revealDeadline = uint64(block.timestamp + c.revealWindow);
            emit CommitStageEnded(caseId, c.revealDeadline);
        }
    }

    /// @notice Reveal phase opens after the commit deadline, or early once every juror has committed.
    function revealVote(uint256 caseId, uint8 vote, bytes32 salt) external nonReentrant {
        Case storage c = _cases[caseId];
        if (c.status != Status.Voting) revert WrongStatus();
        if (!_revealOpen(caseId, c)) revert RevealNotOpen();
        if (block.timestamp > c.revealDeadline) revert DeadlinePassed();
        JurorVote storage jv = _jurorVotes[caseId][msg.sender];
        if (jv.root == address(0)) revert NotJuror();
        if (jv.commitment == bytes32(0)) revert NotCommitted();
        if (jv.revealed) revert AlreadyRevealed();
        if (vote != VOTE_PARTY_A && vote != VOTE_PARTY_B) revert InvalidVote();
        if (computeCommitment(caseId, msg.sender, vote, salt) != jv.commitment) revert InvalidReveal();

        jv.revealed = true;
        jv.vote = vote;
        c.reveals++;
        if (vote == VOTE_PARTY_A) c.votesA++;
        else c.votesB++;
        emit VoteRevealed(caseId, msg.sender, vote);

        // Every committed juror has revealed (and no one can commit any more): end the reveal stage now.
        if (c.reveals == c.commits) {
            c.revealDeadline = uint64(block.timestamp);
            emit RevealStageEnded(caseId);
        }
    }

    /// @notice Settles a case. Anyone may call after the reveal deadline, or as soon as every committed juror
    ///         has revealed. Majority wins and the pot is split among revealers; no reveals or a tie refunds parties.
    function finalize(uint256 caseId) external nonReentrant {
        Case storage c = _cases[caseId];
        if (c.status != Status.Voting) revert WrongStatus();
        bool allRevealed = _revealOpen(caseId, c) && c.reveals == c.commits;
        if (block.timestamp <= c.revealDeadline && !allRevealed) revert DeadlineNotReached();

        if (c.reveals == 0) {
            _refundParties(caseId, RefundReason.NoReveals);
            return;
        }
        if (c.votesA == c.votesB) {
            _refundParties(caseId, RefundReason.Tie);
            return;
        }

        c.status = Status.Resolved;
        c.verdict = c.votesA > c.votesB ? Verdict.PartyA : Verdict.PartyB;
        uint256 pot = c.depositA + c.depositB;
        totalEscrowed -= pot;

        uint256 share = pot / c.reveals;
        uint256 remainder = pot % c.reveals; // first `remainder` revealers (jury order) get +1 wei
        address[] storage jurors = _jurors[caseId];
        uint256 k;
        for (uint256 i; i < jurors.length; ++i) {
            if (_jurorVotes[caseId][jurors[i]].revealed) {
                _credit(jurors[i], caseId, share + (k < remainder ? 1 : 0));
                k++;
            }
        }
        emit CaseResolved(caseId, c.verdict, c.votesA, c.votesB, c.reveals, pot);
    }

    /// @notice Refunds a stalled case. Anyone may call:
    ///         - Open and past the join deadline: A is refunded.
    ///         - Joined/Drawing and past the draw deadline (no jury in time, e.g. randomness late/failed): both refunded.
    function cancelExpired(uint256 caseId) external nonReentrant {
        Case storage c = _cases[caseId];
        if (c.status == Status.Open) {
            if (block.timestamp <= c.joinDeadline) revert DeadlineNotReached();
            _refundParties(caseId, RefundReason.NotJoined);
        } else if (c.status == Status.Joined || c.status == Status.Drawing) {
            if (block.timestamp <= c.drawDeadline) revert DeadlineNotReached();
            _refundParties(caseId, RefundReason.DrawTimeout);
        } else {
            revert WrongStatus();
        }
    }

    /// @notice Withdraws everything owed to the caller (juror pay and/or refunds). Never paused.
    function withdraw() external nonReentrant {
        uint256 amount = owed[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        owed[msg.sender] = 0;
        totalOwed -= amount;
        token.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    // ---------------------------------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------------------------------

    function getCase(uint256 caseId) external view returns (Case memory) {
        return _cases[caseId];
    }

    function getJurors(uint256 caseId) external view returns (address[] memory) {
        return _jurors[caseId];
    }

    function getJurorVote(uint256 caseId, address juror) external view returns (JurorVote memory) {
        return _jurorVotes[caseId][juror];
    }

    function poolLength() external view returns (uint256) {
        return _pool.length;
    }

    function poolEntry(uint256 index) external view returns (PoolEntry memory) {
        return _pool[index];
    }

    /// @notice CELO needed for `requestJury` / `retryRandomness` at `gasPrice`.
    function randomnessFee(uint256 gasPrice) external view returns (uint256) {
        return randomnessSource.fee(gasPrice);
    }

    function isRandomnessReady(uint256 caseId) external view returns (bool) {
        Case storage c = _cases[caseId];
        return c.status == Status.Drawing && randomnessSource.isReady(c.randomnessId);
    }

    function isRevealOpen(uint256 caseId) external view returns (bool) {
        Case storage c = _cases[caseId];
        return c.status == Status.Voting && _revealOpen(caseId, c) && block.timestamp <= c.revealDeadline
            && c.reveals < c.commits;
    }

    /// @notice Message B's client signs (EIP-191 personal_sign) with the invite key.
    function joinDigest(uint256 caseId, address joiner) public view returns (bytes32) {
        return MessageHashUtils.toEthSignedMessageHash(
            keccak256(abi.encode("WhosRight.join", block.chainid, address(this), caseId, joiner))
        );
    }

    function computeCommitment(uint256 caseId, address juror, uint8 vote, bytes32 salt) public pure returns (bytes32) {
        return keccak256(abi.encode(caseId, juror, vote, salt));
    }

    // ---------------------------------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------------------------------

    function _rootOf(address account) private view returns (address root) {
        root = identity.getWhitelistedRoot(account);
        if (root == address(0)) revert NotVerified();
    }

    function _revealOpen(uint256 caseId, Case storage c) private view returns (bool) {
        return block.timestamp > c.commitDeadline || c.commits == _jurors[caseId].length;
    }

    function _refundParties(uint256 caseId, RefundReason reason) private {
        Case storage c = _cases[caseId];
        c.status = Status.Refunded;
        c.refundReason = reason;
        uint256 a = c.depositA;
        uint256 b = c.depositB;
        totalEscrowed -= a + b;
        if (a > 0) _credit(c.partyA, caseId, a);
        if (b > 0) _credit(c.partyB, caseId, b);
        emit CaseRefunded(caseId, reason);
    }

    function _credit(address account, uint256 caseId, uint256 amount) private {
        owed[account] += amount;
        totalOwed += amount;
        emit Credited(account, caseId, amount);
    }

    /// @dev Records the amount actually received (G$ may charge a transfer fee to the receiver).
    function _pull(address from, uint256 amount) private returns (uint256 received) {
        uint256 before = token.balanceOf(address(this));
        token.safeTransferFrom(from, address(this), amount);
        received = token.balanceOf(address(this)) - before;
        if (received == 0) revert NothingReceived();
    }

    function _returnNative(uint256 amount) private {
        if (amount == 0) return;
        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert NativeRefundFailed();
    }
}
