import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { SaasStats } from "./api";

/* ── التنقل بالرابط (#/...) حتى يعمل زر الرجوع وإعادة التحميل ── */
export function useRoute(): [string[], (path: string) => void] {
  const read = () => window.location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const [parts, setParts] = useState<string[]>(read);
  useEffect(() => {
    const onHash = () => setParts(read());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const go = useCallback((path: string) => {
    window.location.hash = `#/${path.replace(/^\/+/, "")}`;
  }, []);
  return [parts, go];
}

export type Shell = {
  stats: SaasStats | null;
  statsError: string;
  reloadStats: () => Promise<void>;
  go: (path: string) => void;
  /** يزيد عند كل «تحديث» من الشريط العلوي لتعيد الصفحة التحميل */
  tick: number;
};

export const ShellContext = createContext<Shell | null>(null);

export const useShell = () => {
  const value = useContext(ShellContext);
  if (!value) throw new Error("useShell outside App");
  return value;
};
