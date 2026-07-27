"use client";

import { useEffect, useState } from "react";
import { DataSourceKind } from "../datasource";

interface ApiState<T> {
  data: T | null;
  source: DataSourceKind | null;
  loading: boolean;
  error: string | null;
}

/** Minimal client fetch hook for /api/* envelope responses. */
export function useApi<T>(url: string | null): ApiState<T> {
  const [state, setState] = useState<ApiState<T>>({
    data: null,
    source: null,
    loading: url !== null,
    error: null,
  });

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const body = await res.json();
        if (!cancelled) {
          setState({
            data: body.data as T,
            source: (body.meta?.source ?? null) as DataSourceKind | null,
            loading: false,
            error: null,
          });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setState({ data: null, source: null, loading: false, error: String(err.message ?? err) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return state;
}
