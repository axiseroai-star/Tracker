"use client";

import { useEffect } from "react";

/** Registers /sw.js so the browser offers "Add to Home Screen" / "Install" (§16h). */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Installability is a nice-to-have — fail silently if unsupported.
      });
    }
  }, []);

  return null;
}
