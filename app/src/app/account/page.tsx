import type { Metadata } from "next";
import { AccountHome } from "./AccountHome";

export const metadata: Metadata = { title: "Account · Rest My Case" };

export default function AccountPage() {
  return <AccountHome />;
}
