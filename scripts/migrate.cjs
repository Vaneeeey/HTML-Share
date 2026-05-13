const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^"|"$/g, "");
  }
}

function databasePath() {
  loadEnv();
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith("file:")) {
    throw new Error("DATABASE_URL must be a SQLite file: URL.");
  }

  const filePath = url.slice("file:".length);
  if (path.isAbsolute(filePath)) return filePath;
  return path.resolve(process.cwd(), "prisma", filePath);
}

function checksum(sql) {
  return crypto.createHash("sha256").update(sql).digest("hex");
}

const dbPath = databasePath();
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec(`
CREATE TABLE IF NOT EXISTS "_html_share_migrations" (
  "name" TEXT NOT NULL PRIMARY KEY,
  "checksum" TEXT NOT NULL,
  "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

const migrationsRoot = path.join(process.cwd(), "prisma", "migrations");
const applied = new Set(
  db.prepare('SELECT "name" FROM "_html_share_migrations"').all().map((row) => row.name),
);

const migrationDirs = fs
  .readdirSync(migrationsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

for (const name of migrationDirs) {
  if (applied.has(name)) continue;

  const sqlPath = path.join(migrationsRoot, name, "migration.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");

  db.exec("BEGIN");
  try {
    db.exec(sql);
    db.prepare(
      'INSERT INTO "_html_share_migrations" ("name", "checksum") VALUES (?, ?)',
    ).run(name, checksum(sql));
    db.exec("COMMIT");
    console.log(`Applied migration ${name}`);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

db.close();
console.log(`Database ready at ${dbPath}`);
