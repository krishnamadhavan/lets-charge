export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const body: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error =
      typeof body === "object" && body !== null && "error" in body
        ? String((body as { error: unknown }).error)
        : `HTTP ${res.status}`;
    throw new Error(error);
  }
  return body as T;
}

export type AdminCharger = {
  id: string;
  short_code: string;
  slot_label: string | null;
  vendor: string;
  model: string;
  serial: string;
  firmware: string | null;
  online: boolean;
  last_seen_at: string | null;
  status: string | null;
  last_error: string | null;
};

export type AdminSession = {
  id: string;
  status: string;
  id_tag: string;
  billable: boolean;
  started_at: string | null;
  stopped_at: string | null;
  energy_kwh: number | null;
  charger_short_code: string;
  resident_flat: string | null;
  resident_name: string | null;
  stop_reason?: string | null;
};
