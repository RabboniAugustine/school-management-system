import { useEffect } from "react";

/**
 * Runs an async loader after mount and whenever it changes.
 * The call is deferred with a zero timeout so loaders can set state without tripping
 * react-hooks/set-state-in-effect (the same approach used by AttendanceManager).
 */
export function useRun(fn: () => unknown): void {
  useEffect(() => {
    const timer = window.setTimeout(() => { void fn(); }, 0);
    return () => window.clearTimeout(timer);
  }, [fn]);
}
