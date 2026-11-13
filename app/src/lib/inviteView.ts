/** Message the invite key signs to prove the holder may preview a case before joining. */
export function inviteViewMessage(network: string, caseId: bigint | string): string {
  return `Rest My Case preview case ${caseId} on ${network}`;
}
