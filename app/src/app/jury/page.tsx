import type { Metadata } from "next";
import { JuryHome } from "./JuryHome";

export const metadata: Metadata = { title: "Jury · Who's Right?" };

export default function JuryPage() {
  return <JuryHome />;
}
