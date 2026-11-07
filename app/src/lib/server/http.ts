import "server-only";

export function bad(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export function parseCaseId(raw: string): bigint | null {
  return /^[1-9]\d{0,18}$/.test(raw) ? BigInt(raw) : null;
}
