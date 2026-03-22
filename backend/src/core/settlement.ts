import { Debt, MemberBalance } from '../types';
import * as queries from '../db/queries';

/**
 * Calculate simplified debts from net balances.
 * Uses a greedy algorithm: match biggest creditor with biggest debtor.
 */
export function calculateDebts(tripId: number): Debt[] {
  const balances = queries.getBalances(tripId);
  return simplifyDebts(balances);
}

export function simplifyDebts(balances: MemberBalance[]): Debt[] {
  const debts: Debt[] = [];

  // Separate into creditors (+) and debtors (-)
  const creditors = balances
    .filter((b) => b.net_balance > 0.0001)
    .map((b) => ({ member_id: b.member_id, amount: b.net_balance }));
  const debtors = balances
    .filter((b) => b.net_balance < -0.0001)
    .map((b) => ({ member_id: b.member_id, amount: -b.net_balance }));

  // Sort descending by amount
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  let i = 0;
  let j = 0;
  while (i < creditors.length && j < debtors.length) {
    const transfer = Math.min(creditors[i].amount, debtors[j].amount);
    if (transfer > 0.0001) {
      debts.push({
        from_member_id: debtors[j].member_id,
        to_member_id: creditors[i].member_id,
        amount: Math.round(transfer * 1e9) / 1e9, // round to 4 decimals
      });
    }
    creditors[i].amount -= transfer;
    debtors[j].amount -= transfer;

    if (creditors[i].amount < 0.0001) i++;
    if (debtors[j].amount < 0.0001) j++;
  }

  return debts;
}

/**
 * Apply margin to debts. Returns the new debt amounts (with margin)
 * and the total prize pool.
 */
export function applyMargin(debts: Debt[], marginPct: number): { debtsWithMargin: Debt[]; prizePool: number } {
  const factor = 1 + marginPct / 100;
  let prizePool = 0;

  const debtsWithMargin = debts.map((d) => {
    const margin = d.amount * (marginPct / 100);
    prizePool += margin;
    return {
      ...d,
      amount: Math.round(d.amount * factor * 1e9) / 1e9,
    };
  });

  return { debtsWithMargin, prizePool: Math.round(prizePool * 1e9) / 1e9 };
}

/**
 * Calculate spender advantage: how much more each member paid relative to the average.
 * Returns a percentage bonus (0-100%) per member.
 */
export function calculateSpenderAdvantage(tripId: number): Map<number, number> {
  const members = queries.getTripMembers(tripId);
  const expenses = queries.getExpenses(tripId);
  const advantages = new Map<number, number>();

  if (members.length === 0 || expenses.length === 0) {
    return advantages;
  }

  // Total paid per member
  const paidMap = new Map<number, number>();
  for (const exp of expenses) {
    paidMap.set(exp.payer_id, (paidMap.get(exp.payer_id) || 0) + exp.amount);
  }

  const totalPaid = Array.from(paidMap.values()).reduce((a, b) => a + b, 0);
  const avgPaid = totalPaid / members.length;

  for (const member of members) {
    const paid = paidMap.get(member.id) || 0;
    // Bonus: 0% at average, up to 15% max for the biggest spender
    const ratio = avgPaid > 0 ? (paid / avgPaid) : 1;
    const bonus = Math.min(Math.max((ratio - 1) * 15, 0), 15);
    advantages.set(member.id, Math.round(bonus * 100) / 100);
  }

  return advantages;
}

/**
 * Calculate final TON payouts for each member after the quiz.
 * - Creditors receive their base net_balance MINUS their margin share
 * - The effective prize pool = original margin (from debtors) + margin deducted from creditors = 2x original margin
 * - Top half of the quiz leaderboard splits the effective prize pool equally
 * Returns: Map<member_id, total TON to receive from the bot>
 */
export function calculatePayouts(
  prizePool: number,
  marginPct: number,
  balances: MemberBalance[],
  results: Array<{ member_id: number; score: number }>
): Map<number, number> {
  const payouts = new Map<number, number>();
  const balanceMap = new Map(balances.map((b) => [b.member_id, b.net_balance]));
  const marginFraction = marginPct / 100;

  // Each creditor's base is reduced by the margin percentage
  // The deducted amount adds to the prize pool, effectively doubling it
  let effectivePrizePool = prizePool;
  for (const b of balances) {
    if (b.net_balance > 0) {
      effectivePrizePool += b.net_balance * marginFraction;
    }
  }
  effectivePrizePool = Math.round(effectivePrizePool * 1e9) / 1e9;

  // Sort by score descending to determine leaderboard
  const sorted = [...results].sort((a, b) => b.score - a.score);
  const topHalfCount = Math.max(1, Math.ceil(sorted.length / 2));
  const topHalfIds = new Set(sorted.slice(0, topHalfCount).map((r) => r.member_id));

  const bonusPerWinner = sorted.length > 0 ? effectivePrizePool / topHalfCount : 0;

  for (const r of results) {
    // Creditors get their positive balance minus the margin share; debtors start at 0
    const rawBase = Math.max(0, balanceMap.get(r.member_id) || 0);
    const base = rawBase * (1 - marginFraction);
    // Top half of leaderboard splits the effective prize pool
    const bonus = topHalfIds.has(r.member_id) ? bonusPerWinner : 0;
    const total = Math.round((base + bonus) * 1e9) / 1e9;
    payouts.set(r.member_id, total);
  }

  return payouts;
}
