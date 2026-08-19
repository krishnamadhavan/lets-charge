import { useEffect, useState } from "react";
import { api } from "./api";

type Lookup = {
  charger_id: string;
  short_code: string;
  slot_label: string | null;
  vendor: string;
  model: string;
  online: boolean;
  status: string | null;
  occupied_by_me: boolean;
};

type LiveSession = {
  id: string;
  status: string;
  charger_short_code: string;
  energy_kwh: number | null;
  live: boolean;
  billable: boolean;
  receipt_preview: { energy_kwh: number | null; amount_paise: number | null; valid: boolean };
};

type Receipt = {
  valid: boolean;
  receipt_id?: string;
  energy_kwh?: number | null;
  amount_paise?: number;
  notice?: string;
  reason?: string;
};

export function ResidentApp({ path }: { path: string }) {
  const codeMatch = path.match(/^\/c\/([^/]+)$/);
  if (path === "/login") {
    return <ResidentLogin />;
  }
  if (codeMatch) {
    return <ChargeScreen code={decodeURIComponent(codeMatch[1] ?? "")} />;
  }
  if (path.startsWith("/sessions/") && path.endsWith("/receipt")) {
    const id = path.split("/")[2] ?? "";
    return <ReceiptScreen sessionId={id} />;
  }
  return (
    <main className="resident">
      <h1>Charge</h1>
      <p>Scan the QR on the charger, or open a short code.</p>
      <CodeForm />
      <p>
        <a href="/login">Sign in</a> · <a href="/admin">Operator</a>
      </p>
    </main>
  );
}

function CodeForm() {
  const [code, setCode] = useState("LC-B12");
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        window.location.href = `/c/${encodeURIComponent(code.trim())}`;
      }}
    >
      <label>
        Short code or slot
        <input value={code} onChange={(e) => setCode(e.target.value)} />
      </label>
      <button type="submit">Open charger</button>
    </form>
  );
}

function ResidentLogin() {
  const [phone, setPhone] = useState("+919800000001");
  const [code, setCode] = useState("000000");
  const [error, setError] = useState<string | null>(null);
  const next = new URLSearchParams(window.location.search).get("next") ?? "/";

  return (
    <main className="resident">
      <h1>Sign in</h1>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          void api("/v1/auth/otp/request", {
            method: "POST",
            body: JSON.stringify({ phone }),
          })
            .then(() =>
              api("/v1/auth/otp/verify", {
                method: "POST",
                body: JSON.stringify({ phone, code }),
              }),
            )
            .then(() => {
              window.location.href = next;
            })
            .catch((err: unknown) => {
              setError(err instanceof Error ? err.message : "failed");
            });
        }}
      >
        <label>
          Phone
          <input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label>
          OTP
          <input value={code} onChange={(e) => setCode(e.target.value)} />
        </label>
        {error ? <p className="error">{error}</p> : null}
        <button type="submit">Continue</button>
      </form>
    </main>
  );
}

function ChargeScreen({ code }: { code: string }) {
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [session, setSession] = useState<LiveSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function loadCharger() {
    void api<Lookup>(`/v1/chargers/lookup?code=${encodeURIComponent(code)}`)
      .then(setLookup)
      .catch((err: unknown) => {
        if (err instanceof Error && err.message === "unauthenticated") {
          window.location.href = `/login?next=${encodeURIComponent(`/c/${code}`)}`;
          return;
        }
        setError(err instanceof Error ? err.message : "failed");
      });
  }

  useEffect(loadCharger, [code]);

  useEffect(() => {
    if (!session?.live) {
      return;
    }
    const timer = setInterval(() => {
      void api<LiveSession>(`/v1/sessions/${session.id}`).then(setSession);
    }, 3000);
    return () => clearInterval(timer);
  }, [session?.id, session?.live]);

  function start() {
    if (!lookup) {
      return;
    }
    setBusy(true);
    setError(null);
    void api<{ id: string }>("/v1/sessions", {
      method: "POST",
      body: JSON.stringify({ charger_id: lookup.charger_id }),
    })
      .then((created) => api<LiveSession>(`/v1/sessions/${created.id}`))
      .then(setSession)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "failed"))
      .finally(() => setBusy(false));
  }

  function stop() {
    if (!session) {
      return;
    }
    setBusy(true);
    setError(null);
    void api(`/v1/sessions/${session.id}/stop`, { method: "POST", body: "{}" })
      .then(() => api<LiveSession>(`/v1/sessions/${session.id}`))
      .then(setSession)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "failed"))
      .finally(() => setBusy(false));
  }

  return (
    <main className="resident">
      <h1>{lookup?.short_code ?? code}</h1>
      {lookup ? (
        <p>
          {lookup.vendor} {lookup.model} · {lookup.online ? "online" : "offline"} ·{" "}
          {lookup.status ?? "—"}
        </p>
      ) : (
        <p>Looking up charger…</p>
      )}
      {session ? (
        <p>
          {session.status} · {session.energy_kwh === null ? "— kWh" : `${session.energy_kwh.toFixed(3)} kWh`}
          {session.receipt_preview.amount_paise !== null
            ? ` · ₹${(session.receipt_preview.amount_paise / 100).toFixed(2)} preview`
            : ""}
        </p>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
      <p>
        <button type="button" disabled={busy || !lookup?.online} onClick={start}>
          Start
        </button>{" "}
        <button type="button" disabled={busy || !session} onClick={stop}>
          Stop
        </button>
      </p>
      {session && !session.live ? (
        <p>
          <a href={`/sessions/${session.id}/receipt`}>Receipt</a>
        </p>
      ) : null}
      <p>
        <a href="/">Home</a>
      </p>
    </main>
  );
}

function ReceiptScreen({ sessionId }: { sessionId: string }) {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch(`/v1/sessions/${sessionId}/receipt`, { credentials: "include" })
      .then(async (res) => {
        const body = (await res.json()) as Receipt;
        if (res.status === 401) {
          window.location.href = `/login?next=${encodeURIComponent(`/sessions/${sessionId}/receipt`)}`;
          return;
        }
        if (!res.ok && res.status !== 409) {
          throw new Error(body.reason ?? `HTTP ${res.status}`);
        }
        setReceipt(body);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "failed");
      });
  }, [sessionId]);

  return (
    <main className="resident">
      <h1>Receipt</h1>
      {error ? <p className="error">{error}</p> : null}
      {receipt?.valid ? (
        <p>
          {receipt.energy_kwh?.toFixed(3)} kWh · ₹
          {((receipt.amount_paise ?? 0) / 100).toFixed(2)}
          <br />
          <small>{receipt.notice}</small>
        </p>
      ) : receipt ? (
        <p>Not a valid receipt ({receipt.reason}).</p>
      ) : (
        <p>Loading…</p>
      )}
      <p>
        <a href="/">Home</a>
      </p>
    </main>
  );
}
