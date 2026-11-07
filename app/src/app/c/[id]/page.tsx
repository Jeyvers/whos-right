import { Suspense } from "react";
import { Page } from "@/components/ui";
import { CaseView } from "./CaseView";
import { Loading } from "@/components/Loading";

export default function CasePage() {
  return (
    <Suspense fallback={<Page><Loading label="Opening the case…" /></Page>}>
      <CaseView />
    </Suspense>
  );
}
