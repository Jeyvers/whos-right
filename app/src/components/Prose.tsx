import type { ReactNode } from "react";

export function Prose({ children }: { children: ReactNode }) {
  return (
    <article className="flex flex-col gap-3 text-zinc-800 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mt-3 [&_h2]:font-semibold [&_ul]:list-disc [&_ul]:pl-5">
      {children}
    </article>
  );
}
