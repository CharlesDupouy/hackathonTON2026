import db from './database';
import { Trip, Member, Expense, Payment, GameResult, MemberBalance } from '../types';

// ============================================================
// TRIPS
// ============================================================

export function createTrip(chatId: number, marginPct: number = 10): Trip {
  const stmt = db.prepare(
    `INSERT INTO trips (chat_id, margin_pct) VALUES (?, ?) RETURNING *`
  );
  return stmt.get(chatId, marginPct) as Trip;
}

export function getActiveTrip(chatId: number): Trip | undefined {
  const stmt = db.prepare(
    `SELECT * FROM trips WHERE chat_id = ? AND status != 'completed' ORDER BY id DESC LIMIT 1`
  );
  return stmt.get(chatId) as Trip | undefined;
}

export function getTripById(tripId: number): Trip | undefined {
  return db.prepare(`SELECT * FROM trips WHERE id = ?`).get(tripId) as Trip | undefined;
}

export function updateTripStatus(tripId: number, status: Trip['status']): void {
  db.prepare(`UPDATE trips SET status = ?, ended_at = CASE WHEN ? = 'completed' THEN datetime('now') ELSE ended_at END WHERE id = ?`)
    .run(status, status, tripId);
}

// ============================================================
// MEMBERS
// ============================================================

export function addMember(tripId: number, telegramId: number, username: string | null): Member {
  const stmt = db.prepare(
    `INSERT INTO members (trip_id, telegram_id, username) VALUES (?, ?, ?)
     ON CONFLICT(trip_id, telegram_id) DO UPDATE SET username = excluded.username
     RETURNING *`
  );
  return stmt.get(tripId, telegramId, username) as Member;
}

export function getMember(tripId: number, telegramId: number): Member | undefined {
  return db.prepare(
    `SELECT * FROM members WHERE trip_id = ? AND telegram_id = ?`
  ).get(tripId, telegramId) as Member | undefined;
}

export function getTripMembers(tripId: number): Member[] {
  return db.prepare(`SELECT * FROM members WHERE trip_id = ?`).all(tripId) as Member[];
}

export function updateMemberWallet(memberId: number, walletAddress: string): void {
  db.prepare(`UPDATE members SET wallet_address = ? WHERE id = ?`).run(walletAddress, memberId);
}

// ============================================================
// EXPENSES
// ============================================================

export function addExpense(
  tripId: number,
  payerId: number,
  amount: number,
  description: string | null,
  beneficiaryIds: number[]
): Expense {
  const expense = db.prepare(
    `INSERT INTO expenses (trip_id, payer_id, amount, description) VALUES (?, ?, ?, ?) RETURNING *`
  ).get(tripId, payerId, amount, description) as Expense;

  const insertBeneficiary = db.prepare(
    `INSERT INTO expense_beneficiaries (expense_id, member_id) VALUES (?, ?)`
  );

  const insertMany = db.transaction((ids: number[]) => {
    for (const id of ids) {
      insertBeneficiary.run(expense.id, id);
    }
  });

  insertMany(beneficiaryIds);
  return expense;
}

export function getExpenses(tripId: number): (Expense & { payer_username: string | null; beneficiary_count: number })[] {
  return db.prepare(`
    SELECT e.*, m.username as payer_username,
           (SELECT COUNT(*) FROM expense_beneficiaries eb WHERE eb.expense_id = e.id) as beneficiary_count
    FROM expenses e
    JOIN members m ON e.payer_id = m.id
    WHERE e.trip_id = ?
    ORDER BY e.created_at DESC
  `).all(tripId) as any[];
}

export function removeExpense(expenseId: number): void {
  db.prepare(`DELETE FROM expense_beneficiaries WHERE expense_id = ?`).run(expenseId);
  db.prepare(`DELETE FROM expenses WHERE id = ?`).run(expenseId);
}

// ============================================================
// BALANCES
// ============================================================

export function getBalances(tripId: number): MemberBalance[] {
  // For each member, calculate:
  // net_balance = total_paid - total_owed
  // positive = is owed money, negative = owes money
  return db.prepare(`
    WITH paid AS (
      SELECT e.payer_id AS member_id, SUM(e.amount) AS total_paid
      FROM expenses e
      WHERE e.trip_id = ?
      GROUP BY e.payer_id
    ),
    owed AS (
      SELECT eb.member_id, SUM(e.amount / beneficiary_counts.cnt) AS total_owed
      FROM expense_beneficiaries eb
      JOIN expenses e ON eb.expense_id = e.id
      JOIN (
        SELECT expense_id, COUNT(*) AS cnt
        FROM expense_beneficiaries
        GROUP BY expense_id
      ) beneficiary_counts ON beneficiary_counts.expense_id = e.id
      WHERE e.trip_id = ?
      GROUP BY eb.member_id
    )
    SELECT
      m.id AS member_id,
      m.telegram_id,
      m.username,
      COALESCE(p.total_paid, 0) - COALESCE(o.total_owed, 0) AS net_balance
    FROM members m
    LEFT JOIN paid p ON p.member_id = m.id
    LEFT JOIN owed o ON o.member_id = m.id
    WHERE m.trip_id = ?
    ORDER BY net_balance DESC
  `).all(tripId, tripId, tripId) as MemberBalance[];
}

// ============================================================
// PAYMENTS
// ============================================================

export function createPayment(tripId: number, memberId: number, amountDue: number): Payment {
  return db.prepare(
    `INSERT INTO payments (trip_id, member_id, amount_due) VALUES (?, ?, ?) RETURNING *`
  ).get(tripId, memberId, amountDue) as Payment;
}

export function getPayments(tripId: number): (Payment & { member_username: string | null; member_telegram_id: number })[] {
  return db.prepare(`
    SELECT p.*, m.username AS member_username, m.telegram_id AS member_telegram_id
    FROM payments p
    JOIN members m ON p.member_id = m.id
    WHERE p.trip_id = ?
  `).all(tripId) as any[];
}

export function updatePaymentStatus(
  paymentId: number,
  status: Payment['status'],
  amountPaid?: number,
  txHash?: string
): void {
  db.prepare(`
    UPDATE payments
    SET status = ?, amount_paid = COALESCE(?, amount_paid), tx_hash = COALESCE(?, tx_hash)
    WHERE id = ?
  `).run(status, amountPaid ?? null, txHash ?? null, paymentId);
}

export function getPaymentByMember(tripId: number, memberId: number): Payment | undefined {
  return db.prepare(
    `SELECT * FROM payments WHERE trip_id = ? AND member_id = ?`
  ).get(tripId, memberId) as Payment | undefined;
}

export function refundAllPayments(tripId: number): void {
  db.prepare(`UPDATE payments SET status = 'refunded' WHERE trip_id = ? AND status IN ('paid', 'pending')`).run(tripId);
}

export function deleteStalePayments(tripId: number): void {
  db.prepare(`DELETE FROM payments WHERE trip_id = ? AND status = 'refunded'`).run(tripId);
}

// ============================================================
// GAME RESULTS
// ============================================================

export function saveGameResult(
  tripId: number,
  memberId: number,
  score: number,
  bonusPct: number,
  payoutDelta: number
): GameResult {
  return db.prepare(
    `INSERT INTO game_results (trip_id, member_id, score, bonus_pct, payout_delta)
     VALUES (?, ?, ?, ?, ?) RETURNING *`
  ).get(tripId, memberId, score, bonusPct, payoutDelta) as GameResult;
}

export function getGameResults(tripId: number): (GameResult & { username: string | null })[] {
  return db.prepare(`
    SELECT gr.*, m.username
    FROM game_results gr
    JOIN members m ON gr.member_id = m.id
    WHERE gr.trip_id = ?
    ORDER BY gr.score DESC
  `).all(tripId) as any[];
}
