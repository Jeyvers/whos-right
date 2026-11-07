"use client";

import { useEffect, useState } from "react";

/** Current unix time in seconds, ticking every `everyMs`. */
export function useNow(everyMs = 1000): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}
