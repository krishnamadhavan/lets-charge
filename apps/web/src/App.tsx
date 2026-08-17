import { useEffect, useState } from "react";

type Health = { status: string; service: string };

export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/v1/health")
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return (await res.json()) as Health;
      })
      .then(setHealth)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "request failed");
      });
  }, []);

  return (
    <main>
      <h1>lets-charge</h1>
      <p>Resident and operator screens are not in this scaffold.</p>
      <p>
        API:{" "}
        {health
          ? `${health.service} ${health.status}`
          : error
            ? `unreachable (${error})`
            : "checking…"}
      </p>
    </main>
  );
}
