"use client";

import { useEffect, useState } from "react";

export function useIsMobile(breakpoint = 1024) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);

    const updateState = () => {
      setIsMobile(mediaQuery.matches);
    };

    updateState();
    mediaQuery.addEventListener("change", updateState);

    return () => mediaQuery.removeEventListener("change", updateState);
  }, [breakpoint]);

  return isMobile;
}
