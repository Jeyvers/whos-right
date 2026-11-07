import type { Metadata } from "next";
import { StartCase } from "./StartCase";

export const metadata: Metadata = { title: "Start a case · Who's Right?" };

export default function NewCasePage() {
  return <StartCase />;
}
