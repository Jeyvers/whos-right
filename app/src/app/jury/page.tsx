import type { Metadata } from "next";
import { Suspense } from "react";
import { Loading } from "@/components/Loading";
import { Page } from "@/components/ui";
import { JuryHome } from "./JuryHome";

export const metadata: Metadata = { title: "Jury · Who's Right?" };

export default function JuryPage() {
  return (
    <Suspense fallback={<Page><Loading /></Page>}>
      <JuryHome />
    </Suspense>
  );
}
