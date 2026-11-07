/**
 * Scales of justice. Side A's pan is coral, side B's is teal.
 * `animated` swings the beam once on load (disabled under prefers-reduced-motion).
 */
export function Scales({ className, animated = false }: { className?: string; animated?: boolean }) {
  return (
    <svg viewBox="0 0 120 120" className={className} role="img" aria-label="Scales of justice">
      {/* post + base */}
      <rect x="56" y="30" width="8" height="70" rx="3" fill="#1B1035" />
      <path d="M34 108 Q60 92 86 108 Z" fill="#1B1035" />
      <rect x="30" y="104" width="60" height="9" rx="4.5" fill="#FFC93C" stroke="#1B1035" strokeWidth="3" />
      {/* beam with hanging pans; the pans counter-rotate so they stay upright */}
      <g className={animated ? "scales-beam" : undefined}>
        <rect x="14" y="30" width="92" height="8" rx="4" fill="#FFC93C" stroke="#1B1035" strokeWidth="3" />
        <g className={animated ? "scales-pan-a" : undefined}>
          <path d="M22 36 L8 70 M22 36 L36 70" stroke="#1B1035" strokeWidth="2.5" fill="none" />
          <path d="M2 70 H42 Q38 86 22 86 Q6 86 2 70 Z" fill="#FF5A6E" stroke="#1B1035" strokeWidth="3" />
        </g>
        <g className={animated ? "scales-pan-b" : undefined}>
          <path d="M98 36 L84 70 M98 36 L112 70" stroke="#1B1035" strokeWidth="2.5" fill="none" />
          <path d="M78 70 H118 Q114 86 98 86 Q82 86 78 70 Z" fill="#14B8A6" stroke="#1B1035" strokeWidth="3" />
        </g>
      </g>
      <circle cx="60" cy="24" r="9" fill="#FFC93C" stroke="#1B1035" strokeWidth="3" />
    </svg>
  );
}
