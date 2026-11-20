"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Default: same origin. next.config.ts proxies /api/* to the backend, so browser shields and ad blockers that block
// cross-port localhost requests cannot cut the console off. Set NEXT_PUBLIC_LEASH_API_URL to call an API directly.
export const API_BASE = (process.env.NEXT_PUBLIC_LEASH_API_URL || "").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    cache: "no-store",
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail ?? body);
    } catch {
      /* keep statusText */
    }
    throw new ApiError(res.status, detail);
  }
  return (await res.json()) as T;
}

/** Fetch `path` on mount (and every `pollMs` if given). `reload()` re-fetches on demand. */
export function useApi<T>(path: string | null, pollMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(path !== null);
  const seq = useRef(0);

  const reload = useCallback(async () => {
    if (path === null) return;
    const mine = ++seq.current;
    try {
      const result = await api<T>(path);
      if (mine === seq.current) {
        setData(result);
        setError(null);
      }
    } catch (e) {
      if (mine === seq.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    const first = setTimeout(reload, 0);
    const id = pollMs ? setInterval(reload, pollMs) : undefined;
    return () => {
      clearTimeout(first);
      if (id) clearInterval(id);
    };
  }, [reload, pollMs]);

  return { data, error, loading, reload };
}

/** Wrap a mutation with busy/error state. */
export function useAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async <T,>(label: string, fn: () => Promise<T>): Promise<T | null> => {
    setBusy(label);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setBusy(null);
    }
  }, []);
  return { busy, error, run, setError };
}

export function short(hash: string | null | undefined, n = 8): string {
  if (!hash) return "—";
  const h = hash.startsWith("0x") ? hash : hash;
  return h.length <= n * 2 + 1 ? h : `${h.slice(0, n + (h.startsWith("0x") ? 2 : 0))}…${h.slice(-n)}`;
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString();
}
