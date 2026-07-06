"use client";

import { useEffect } from "react";

// Minimal PWA install support -- no offline caching strategy needed for a
// hobby POC, just enough of a service worker for browsers to consider the
// app installable on iOS/Android home screens.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
