import { Scales } from "./Scales";

/** The app's loading state: the scales of justice weighing back and forth, with a short line of what's happening. */
export function Loading({ label = "Loading…", size = "md" }: { label?: string; size?: "sm" | "md" | "lg" }) {
  const box = size === "sm" ? "h-6 w-6" : size === "lg" ? "h-28 w-28" : "h-14 w-14";
  return (
    <div role="status" aria-live="polite" className={`flex items-center gap-3 ${size === "lg" ? "flex-col text-center" : ""}`}>
      <Scales animated className={`${box} scales-loading shrink-0`} />
      {label && <span className={size === "lg" ? "font-display text-xl font-extrabold" : "text-sm font-semibold text-ink/70"}>{label}</span>}
    </div>
  );
}

/** Inline version for inside buttons. */
export function Spinner() {
  return <Scales animated className="scales-loading -my-1 h-6 w-6 shrink-0" />;
}
