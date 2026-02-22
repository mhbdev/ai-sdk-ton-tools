import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, sql } from "@/db/client";

const splitMigrationStatements = (source: string) =>
  source
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

const runCompatibilityRepair = async () => {
  const migrationPath = resolve(
    process.cwd(),
    "src",
    "db",
    "migrations",
    "0002_huge_dracula.sql",
  );
  const source = await readFile(migrationPath, "utf8");
  const statements = splitMigrationStatements(source);

  for (const statement of statements) {
    await sql.unsafe(statement);
  }
};

const run = async () => {
  await runCompatibilityRepair();
  await migrate(db, {
    migrationsFolder: "src/db/migrations",
  });
};

try {
  await run();
} finally {
  await sql.end({ timeout: 10 });
}
