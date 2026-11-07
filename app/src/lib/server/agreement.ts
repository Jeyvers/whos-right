import "server-only";
import { AGREEMENT_VERSION } from "@/lib/agreement";
import { db } from "./supabase";

/** True once this person has agreed to the current version of how cases work. */
export async function hasAgreed(privyUserId: string): Promise<boolean> {
  const { data } = await db().from("agreements").select("version").eq("privy_user_id", privyUserId).maybeSingle();
  return Boolean(data && data.version >= AGREEMENT_VERSION);
}
