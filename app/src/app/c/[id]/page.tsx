import { Suspense } from "react";
import { Page } from "@/components/ui";
import { CaseView } from "./CaseView";

export default function CasePage() {
  return (
    <Suspense fallback={<Page><p>Loading case…</p></Page>}>
      <CaseView />
    </Suspense>
  );
}
