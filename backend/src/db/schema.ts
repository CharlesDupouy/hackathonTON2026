import db from './database';

export function initSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS trips (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id       INTEGER NOT NULL,
      status        TEXT NOT NULL DEFAULT 'active',
      margin_pct    REAL NOT NULL DEFAULT 10.0,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at      TEXT
    );

    CREATE TABLE IF NOT EXISTS members (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id       INTEGER NOT NULL REFERENCES trips(id),
      telegram_id   INTEGER NOT NULL,
      username      TEXT,
      wallet_address TEXT,
      UNIQUE(trip_id, telegram_id)
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id       INTEGER NOT NULL REFERENCES trips(id),
      payer_id      INTEGER NOT NULL REFERENCES members(id),
      amount        REAL NOT NULL,
      description   TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS expense_beneficiaries (
      expense_id    INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
      member_id     INTEGER NOT NULL REFERENCES members(id),
      PRIMARY KEY (expense_id, member_id)
    );

    CREATE TABLE IF NOT EXISTS payments (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id       INTEGER NOT NULL REFERENCES trips(id),
      member_id     INTEGER NOT NULL REFERENCES members(id),
      amount_due    REAL NOT NULL,
      amount_paid   REAL DEFAULT 0,
      tx_hash       TEXT,
      status        TEXT NOT NULL DEFAULT 'pending',
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS game_results (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id       INTEGER NOT NULL REFERENCES trips(id),
      member_id     INTEGER NOT NULL REFERENCES members(id),
      score         INTEGER NOT NULL DEFAULT 0,
      bonus_pct     REAL NOT NULL DEFAULT 0,
      payout_delta  REAL DEFAULT 0
    );
  `);
}
