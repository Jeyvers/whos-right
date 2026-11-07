import type { Metadata } from "next";
import { AccountHome } from "./AccountHome";

export const metadata: Metadata = { title: "Account · Who's Right?" };

export default function AccountPage() {
  return <AccountHome />;
}
