"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T = unknown>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    credentials: "same-origin",
    ...options,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new ApiError(data?.error ?? `Request failed (${res.status})`, res.status);
  }
  return data as T;
}

export interface CollectionState<T> {
  data: T[];
  setData: React.Dispatch<React.SetStateAction<T[]>>;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  create: (body: unknown, tempItem?: T) => Promise<T | null>;
  update: (id: string, body: unknown, optimisticPatch?: Partial<T>) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export function useCollection<T extends { id: string }>(
  url: string,
  initialData: T[] = []
): CollectionState<T> {
  const [data, setData] = useState<T[]>(initialData);
  const [loading, setLoading] = useState(initialData.length === 0);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await apiFetch<T[]>(url);
      if (mounted.current) setData(rows);
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial client-side load
    if (initialData.length === 0) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const create = useCallback(
    async (body: unknown, tempItem?: T) => {
      if (tempItem) setData((d) => [tempItem, ...d]);
      try {
        const created = await apiFetch<T>(url, {
          method: "POST",
          body: JSON.stringify(body),
        });
        if (created) {
          setData((d) => [created, ...d.filter((x) => x.id !== (tempItem?.id ?? created.id))]);
        }
        return created;
      } catch (e) {
        if (tempItem) setData((d) => d.filter((x) => x.id !== tempItem.id));
        throw e;
      }
    },
    [url]
  );

  const update = useCallback(
    async (id: string, body: unknown, optimisticPatch?: Partial<T>) => {
      let snapshot: T[] = [];
      if (optimisticPatch) {
        setData((d) => {
          snapshot = d;
          return d.map((x) => (x.id === id ? { ...x, ...optimisticPatch } : x));
        });
      }
      try {
        const updated = await apiFetch<T>(`${url}/${id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        if (updated) {
          setData((d) => d.map((x) => (x.id === id ? { ...x, ...updated } : x)));
        }
      } catch (e) {
        if (optimisticPatch && snapshot.length) setData(snapshot);
        throw e;
      }
    },
    [url]
  );

  const remove = useCallback(
    async (id: string) => {
      let snapshot: T[] = [];
      setData((d) => {
        snapshot = d;
        return d.filter((x) => x.id !== id);
      });
      try {
        await apiFetch(`${url}/${id}`, { method: "DELETE" });
      } catch (e) {
        setData(snapshot);
        throw e;
      }
    },
    [url]
  );

  return { data, setData, loading, error, reload, create, update, remove };
}

export function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function useFiltered<T>(
  rows: T[],
  query: string,
  keys: Array<keyof T | ((row: T) => string)>
): T[] {
  const q = query.trim().toLowerCase();
  return useMemo(() => {
    if (!q) return rows;
    return rows.filter((row) =>
      keys.some((k) => {
        const val = typeof k === "function" ? k(row) : String(row[k] ?? "");
        return val.toLowerCase().includes(q);
      })
    );
  }, [rows, q, keys]);
}
