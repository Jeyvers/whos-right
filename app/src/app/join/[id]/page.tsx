import { Suspense } from "react";
import { Page } from "@/components/ui";
import { JoinCase } from "./JoinCase";
import { Loading } from "@/components/Loading";

export default function JoinPage() {
  return (
    <Suspense fallback={<Page><Loading label="Opening your invite…" /></Page>}>
      <JoinCase />
    </Suspense>
  );
}
