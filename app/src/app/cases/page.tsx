import type { Metadata } from "next";
import { Suspense } from "react";
import { Loading } from "@/components/Loading";
import { Page } from "@/components/ui";
import { CasesHome } from "./CasesHome";

export const metadata: Metadata = { title: "Cases · Rest My Case" };

export default function CasesPage() {
  return (
    <Suspense fallback={<Page><Loading label="Gathering cases…" /></Page>}>
      <CasesHome />
    </Suspense>
  );
}
