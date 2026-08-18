import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type postgres from "postgres";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "../migrations");

export async function migrate(sql: postgres.Sql): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  const files = (await readdir(migrationsDir))
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();

  for (const file of files) {
    const id = file.replace(/\.sql$/, "");
    const already = await sql`SELECT 1 FROM schema_migrations WHERE id = ${id}`;
    if (already.count > 0) {
      continue;
    }

    await sql.begin(async (tx) => {
      await tx.file(join(migrationsDir, file));
      await tx`INSERT INTO schema_migrations (id) VALUES (${id})`;
    });
  }
}
