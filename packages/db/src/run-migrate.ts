import postgres from "postgres";
import { migrate } from "./migrate.js";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("missing DATABASE_URL");
}

const sql = postgres(url, { onnotice() {} });
await migrate(sql);
await sql.end({ timeout: 5 });
