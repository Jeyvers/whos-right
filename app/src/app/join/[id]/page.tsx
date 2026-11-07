import { Suspense } from "react";
import { Page } from "@/components/ui";
import { JoinCase } from "./JoinCase";

export default function JoinPage() {
  return (
    <Suspense fallback={<Page><p>Loading invite…</p></Page>}>
      <JoinCase />
    </Suspense>
  );
}
