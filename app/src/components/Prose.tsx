import type { ReactNode } from "react";

export function Prose({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <article className="tile flex flex-col gap-3 p-6 leading-relaxed [&_h1]:font-display [&_h1]:text-3xl [&_h1]:font-extrabold [&_h2]:mt-4 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </article>
    </div>
  );
}
