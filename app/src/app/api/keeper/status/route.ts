import { keeperStatus } from "@/lib/server/keeper";

export async function GET() {
  return Response.json(await keeperStatus(), { headers: { "cache-control": "no-store" } });
}
