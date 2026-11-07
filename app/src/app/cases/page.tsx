import type { Metadata } from "next";
import { MyCases } from "./MyCases";

export const metadata: Metadata = { title: "My cases · Who's Right?" };

export default function MyCasesPage() {
  return <MyCases />;
}
