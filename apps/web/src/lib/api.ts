import type { HistorySnapshot, RecentSnapshot, StatusSnapshot } from "@aviles/core";
import { API_URL } from "../config.ts";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) throw new Error(`${res.status}`);
  return (await res.json()) as T;
}

export const fetchStatus = () => get<StatusSnapshot>("/api/status");
export const fetchRecent = (id: string) => get<RecentSnapshot>(`/api/stations/${encodeURIComponent(id)}/recent`);
export const fetchHistory = (id: string) => get<HistorySnapshot>(`/api/stations/${encodeURIComponent(id)}/history`);
