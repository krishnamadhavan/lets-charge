import { useEffect, useState, type ReactNode } from "react";
import { api, type AdminCharger, type AdminSession } from "./api";

export function AdminApp({ path }: { path: string }) {
  if (path === "/admin/login") {
    return <LoginPage />;
  }
  if (path === "/admin/sessions") {
    return <SessionsPage />;
  }
  return <ChargersPage />;
}

function shell(title: string, children: ReactNode) {
  return (
    <div className="admin">
      <header>
        <strong>lets-charge operator</strong>
        <nav>
          <a href="/admin">Chargers</a>
          <a href="/admin/sessions">Sessions</a>
          <button
            type="button"
            onClick={() => {
              void api("/v1/admin/logout", { method: "POST", body: "{}" }).finally(() => {
                window.location.href = "/admin/login";
              });
            }}
          >
            Logout
          </button>
        </nav>
      </header>
      <h1>{title}</h1>
      {children}
    </div>
  );
}

function LoginPage() {
  const [login, setLogin] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="admin login">
      <h1>Operator login</h1>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          void api("/v1/admin/login", {
            method: "POST",
            body: JSON.stringify({ login, password }),
          })
            .then(() => {
              window.location.href = "/admin";
            })
            .catch((err: unknown) => {
              setError(err instanceof Error ? err.message : "login failed");
            });
        }}
      >
        <label>
          Login
          <input value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        {error ? <p className="error">{error}</p> : null}
        <button type="submit">Sign in</button>
      </form>
    </div>
  );
}

function ChargersPage() {
  const [rows, setRows] = useState<AdminCharger[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  function load() {
    void api<AdminCharger[]>("/v1/admin/chargers")
      .then(setRows)
      .catch((err: unknown) => {
        if (err instanceof Error && err.message === "unauthorized") {
          window.location.href = "/admin/login";
          return;
        }
        setError(err instanceof Error ? err.message : "failed");
      });
  }

  useEffect(load, []);

  function act(id: string, action: "start" | "stop") {
    setBusy(`${action}:${id}`);
    setError(null);
    void api(`/v1/admin/chargers/${id}/${action}`, { method: "POST", body: "{}" })
      .then(load)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "failed"))
      .finally(() => setBusy(null));
  }

  return shell(
    "Chargers",
    <>
      {error ? <p className="error">{error}</p> : null}
      {!rows ? (
        <p>Loading…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Slot</th>
              <th>Box</th>
              <th>Online</th>
              <th>Status</th>
              <th>Last seen</th>
              <th>Error</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.short_code}</td>
                <td>{row.slot_label ?? "—"}</td>
                <td>
                  {row.vendor} {row.model}
                  <br />
                  <small>
                    {row.serial} / {row.firmware ?? "no fw"}
                  </small>
                </td>
                <td>{row.online ? "online" : "offline"}</td>
                <td>{row.status ?? "—"}</td>
                <td>{row.last_seen_at ? new Date(row.last_seen_at).toLocaleString() : "—"}</td>
                <td>{row.last_error ?? "—"}</td>
                <td>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => act(row.id, "start")}
                  >
                    Start
                  </button>{" "}
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => act(row.id, "stop")}
                  >
                    Stop
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>,
  );
}

function SessionsPage() {
  const [rows, setRows] = useState<AdminSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  function load() {
    void api<AdminSession[]>("/v1/admin/sessions")
      .then(setRows)
      .catch((err: unknown) => {
        if (err instanceof Error && err.message === "unauthorized") {
          window.location.href = "/admin/login";
          return;
        }
        setError(err instanceof Error ? err.message : "failed");
      });
  }

  useEffect(load, []);

  function recover(id: string) {
    setBusy(id);
    setError(null);
    void api(`/v1/admin/sessions/${id}/recover-stop`, { method: "POST", body: "{}" })
      .then(load)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "failed"))
      .finally(() => setBusy(null));
  }

  return shell(
    "Sessions",
    <>
      {error ? <p className="error">{error}</p> : null}
      {!rows ? (
        <p>Loading…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Charger</th>
              <th>Who</th>
              <th>Status</th>
              <th>kWh</th>
              <th>Billable</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.started_at ? new Date(row.started_at).toLocaleString() : "—"}</td>
                <td>{row.charger_short_code}</td>
                <td>
                  {row.resident_name
                    ? `${row.resident_name} (${row.resident_flat})`
                    : row.id_tag}
                </td>
                <td>{row.status}</td>
                <td>{row.energy_kwh === null ? "—" : row.energy_kwh.toFixed(3)}</td>
                <td>{row.billable ? "yes" : "no"}</td>
                <td>
                  {row.status === "orphan" ? (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => recover(row.id)}
                    >
                      Recover stop
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>,
  );
}
