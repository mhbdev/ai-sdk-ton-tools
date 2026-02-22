import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, sql } from "@/db/client";

await migrate(db, {
  migrationsFolder: "src/db/migrations",
});

await sql.end({ timeout: 10 });
