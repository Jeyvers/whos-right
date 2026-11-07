"use client";

/** A juror silhouette. */
function Person() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <circle cx="12" cy="8" r="4" fill="currentColor" />
      <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" fill="currentColor" />
    </svg>
  );
}

/**
 * The jury draw, as a moment: the real pool shown as tokens with a spotlight chasing across them, and the empty
 * jury seats waiting. Shows how many verified people are actually available.
 */
export function JuryDraw(props: { poolSize: number; minPool: number; jurySize: number; drawing: boolean }) {
  const { poolSize, minPool, jurySize, drawing } = props;
  const shown = Math.min(poolSize, 16);
  const extra = poolSize - shown;
  const short = poolSize < minPool;
  return (
    <div className="flex flex-col gap-3">
      <p className="font-display text-xl font-extrabold">
        {short
          ? `Waiting for jurors: ${poolSize} of ${minPool} ready`
          : `Picking ${jurySize} of ${poolSize} verified jurors at random`}
      </p>
      <div className="flex flex-wrap gap-1.5" aria-label={`${poolSize} jurors in the pool`}>
        {Array.from({ length: shown }, (_, i) => (
          <span
            key={i}
            className={`juror-token flex h-8 w-8 items-center justify-center rounded-full border-2 border-ink bg-white text-ink ${
              drawing && !short ? "drawing" : ""
            }`}
            style={{ animationDelay: `${(i * 2.2) / Math.max(shown, 1)}s` }}
          >
            <Person />
          </span>
        ))}
        {extra > 0 && (
          <span className="flex h-8 items-center rounded-full border-2 border-ink/30 px-2 text-xs font-bold text-ink/60">+{extra}</span>
        )}
        {short &&
          Array.from({ length: minPool - poolSize }, (_, i) => (
            <span key={`m${i}`} className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-dashed border-ink/30 text-ink/30">
              <Person />
            </span>
          ))}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold text-ink/60">Jury seats</span>
        <div className="flex flex-1 gap-1.5">
          {Array.from({ length: jurySize }, (_, i) => (
            <span
              key={i}
              className={`jury-seat flex h-9 flex-1 items-center justify-center rounded-lg border-[3px] border-dashed border-ink/40 font-display font-extrabold text-ink/40 ${
                drawing && !short ? "drawing" : ""
              }`}
              style={{ animationDelay: `${i * 0.15}s` }}
            >
              ?
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
