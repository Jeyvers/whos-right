#!/usr/bin/env bash
# End-to-end smoke test of WhosRight on Celo Sepolia using throwaway wallets (testnet only).
set -euo pipefail
# Throwaway wallet keys live in .smoke/wallets.json (git-ignored). Create with:
#   mkdir -p .smoke && cast wallet new --number 10 --json > .smoke/wallets.json
# Wallet 0 is the funder: send it ~0.6 Celo Sepolia CELO, then run: bash script/smoke-testnet.sh
# Resumable: steps already done (funding, faucet, verify, pool) are skipped. Leftover CELO is swept to RETURN_TO.
D="$(cd "$(dirname "$0")/.." && pwd)/.smoke"
R=https://forno.celo-sepolia.celo-testnet.org
WR=0xCbF0AD90F0F48BBf5367Be07FED166d07bCE3f6b
TG=0xB4e8a6c837744A21b6d94C08FDeB3cf4E0696a36
ID=0x71386420228BF609FA916EE1B676f3A81c803B2F
RETURN_TO=0x72ded37D6090671231b41ceEAb34f60A0FEA320c
[ "$(cast chain-id -r $R)" = "11142220" ] || { echo "not Celo Sepolia"; exit 1; }

PK=(); AD=()
while IFS=' ' read -r a k; do AD+=("$a"); PK+=("$k"); done < <(python3 -I -c "
import json,sys; w=json.load(open(sys.argv[1]))['data']
for x in w: print(x['address'], x['private_key'])" "$D/wallets.json")
F=0; A=1; B=2; JUR=(3 4 5 6 7 8 9)

tx() { # tx <walletIndex> <to> <sig> [args...] ; optional env VALUE ; retries transient RPC errors
  local i=$1; shift
  local out st attempt
  for attempt in 1 2 3 4; do
    if out=$(cast send "$@" --private-key "${PK[$i]}" -r $R ${VALUE:+--value $VALUE} --json 2>&1); then
      st=$(echo "$out" | python3 -I -c "import json,sys; print(json.load(sys.stdin).get('status'))" 2>/dev/null || echo "?")
      [ "$st" = "0x1" ] && return 0
      echo "TX REVERTED: $*"; echo "$out" | head -5; exit 1
    fi
    echo "  (attempt $attempt failed: $(echo "$out" | tail -1 | cut -c1-160)); retrying"; sleep 3
  done
  echo "TX FAILED after retries: $*"; exit 1
}
call() { cast call "$@" -r $R; }
step() { echo; echo "== $*"; }

step "Funding 9 wallets from ${AD[$F]} ($(cast balance ${AD[$F]} -r $R --ether) CELO)"
for i in $A $B "${JUR[@]}"; do
  if [ "$(cast balance "${AD[$i]}" -r $R)" -lt 50000000000000000 ]; then VALUE=0.06ether tx $F "${AD[$i]}"; fi
done

step "Faucet tG\$ + self-verify (testnet identity)"
for i in $A $B "${JUR[@]}"; do
  [ "$(call $TG 'balanceOf(address)(uint256)' "${AD[$i]}" | awk '{print $1}')" = "0" ] && tx $i $TG "faucet()"
  [ "$(call $ID 'isWhitelisted(address)(bool)' "${AD[$i]}")" = "false" ] && tx $i $ID "verifyMe()"
done
for i in $A $B; do tx $i $TG "approve(address,uint256)" $WR 115792089237316195423570835461322940862528830584101210497665565612711183900000; done

step "7 jurors join the pool"
for i in "${JUR[@]}"; do
  [ "$(call $WR 'activeEntryOfWallet(address)(uint256)' "${AD[$i]}" | awk '{print $1}')" = "0" ] && tx $i $WR "joinPool()"
done
echo "activePoolSize: $(call $WR 'activePoolSize()(uint256)')"

step "A opens a FAST case with a one-time invite key"
INV_PK=$(cast wallet new --json | python3 -I -c "import json,sys; print(json.load(sys.stdin)['data'][0]['private_key'])")
INV=$(cast wallet address --private-key "$INV_PK")
tx $A $WR "openCase(uint8,bytes32,address)" 1 "$(cast keccak 'smoke: argument A')" "$INV"
CASE=$(call $WR 'caseCount()(uint256)' | awk '{print $1}')
echo "caseId $CASE"

step "B reads the terms, signs the invite with the link key, joins"
FEE=$(call $WR 'speedFee(uint8)(uint256)' 1 | awk '{print $1}')
DIGEST=$(call $WR 'joinDigest(uint256,address)(bytes32)' "$CASE" "${AD[$B]}")
SIG=$(cast wallet sign --no-hash "$DIGEST" --private-key "$INV_PK")
tx $B $WR "joinCase(uint256,bytes32,uint8,uint256,bytes)" "$CASE" "$(cast keccak 'smoke: argument B')" 1 "$FEE" "$SIG"
echo "contract tG\$ balance: $(call $TG 'balanceOf(address)(uint256)' $WR)"

step "Request jury, wait for randomness, draw"
tx $F $WR "requestJury(uint256)" "$CASE"
for _ in $(seq 1 30); do
  [ "$(call $WR 'isRandomnessReady(uint256)(bool)' "$CASE")" = "true" ] && break; sleep 2
done
tx $F $WR "drawJury(uint256)" "$CASE"
JLIST=$(call $WR 'getJurors(uint256)(address[])' "$CASE" | tr -d '[] ' | tr ',' ' ')
echo "jurors: $JLIST"

idx_of() { local t; t=$(echo "$1" | tr 'A-F' 'a-f'); for i in "${JUR[@]}"; do [ "$(echo "${AD[$i]}" | tr 'A-F' 'a-f')" = "$t" ] && echo "$i" && return; done; echo "?"; }
VOTES=(2 2 2 1 1)   # expect verdict PartyB (3-2)
step "Commit (5 jurors)"
n=0; for j in $JLIST; do
  i=$(idx_of "$j"); SALT=$(cast keccak "salt-$CASE-$j")
  C=$(call $WR 'computeCommitment(uint256,address,uint8,bytes32)(bytes32)' "$CASE" "$j" "${VOTES[$n]}" "$SALT")
  tx "$i" $WR "commitVote(uint256,bytes32)" "$CASE" "$C"; n=$((n+1))
done
echo "isRevealOpen after last commit: $(call $WR 'isRevealOpen(uint256)(bool)' "$CASE")  (commit stage ended early)"

step "Reveal (5 jurors)"
n=0; for j in $JLIST; do
  i=$(idx_of "$j"); SALT=$(cast keccak "salt-$CASE-$j")
  tx "$i" $WR "revealVote(uint256,uint8,bytes32)" "$CASE" "${VOTES[$n]}" "$SALT"; n=$((n+1))
done

step "Finalize immediately (reveal stage ended early)"
tx $F $WR "finalize(uint256)" "$CASE"
call $WR 'getCase(uint256)((address,address,address,address,address,uint8,uint8,uint8,uint8,bytes32,bytes32,uint256,uint64,uint64,uint256,uint256,uint64,uint64,uint64,uint64,uint64,uint64,uint256,uint8,uint8,uint8,uint8))' "$CASE" > "$D/case.txt"
python3 -I -c "import sys; t=open(sys.argv[1]).read().strip()[1:-1].split(', '); print('  status',t[6],'verdict',t[7],'(1=A,2=B) refundReason',t[8],'commits',t[23],'reveals',t[24],'votesA',t[25],'votesB',t[26])" "$D/case.txt"
echo "owed per juror:"
for j in $JLIST; do echo "  $j $(call $WR 'owed(address)(uint256)' "$j")"; done

step "Jurors withdraw"
for j in $JLIST; do i=$(idx_of "$j"); tx "$i" $WR "withdraw()"; echo "  $j tG\$ $(call $TG 'balanceOf(address)(uint256)' "$j")"; done
echo "contract tG\$ balance after withdrawals: $(call $WR 'totalOwed()(uint256)') owed, $(call $TG 'balanceOf(address)(uint256)' $WR) held"

step "Sweep leftover CELO back to $RETURN_TO"
GP=$(cast gas-price -r $R)
for i in $A $B "${JUR[@]}" $F; do
  BAL=$(cast balance "${AD[$i]}" -r $R)
  KEEP=$(python3 -I -c "print(21000*$GP*3)")
  AMT=$(python3 -I -c "print(max(0, $BAL - $KEEP))")
  if [ "$AMT" != "0" ]; then VALUE=$AMT tx $i $RETURN_TO; fi
done
echo "returned. deployer balance: $(cast balance $RETURN_TO -r $R --ether) CELO"
echo; echo "SMOKE TEST PASSED"
