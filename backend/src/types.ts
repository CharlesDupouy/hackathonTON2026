// ============================================================
// TripTon — Shared TypeScript Interfaces
// ============================================================

export interface Trip {
  id: number;
  chat_id: number;
  status: 'active' | 'settling' | 'playing' | 'completed';
  margin_pct: number;
  created_at: string;
  ended_at: string | null;
}

export interface Member {
  id: number;
  trip_id: number;
  telegram_id: number;
  username: string | null;
  wallet_address: string | null;
}

export interface Expense {
  id: number;
  trip_id: number;
  payer_id: number;
  amount: number;
  description: string | null;
  created_at: string;
}

export interface ExpenseBeneficiary {
  expense_id: number;
  member_id: number;
}

export interface Payment {
  id: number;
  trip_id: number;
  member_id: number;
  amount_due: number;
  amount_paid: number;
  tx_hash: string | null;
  status: 'pending' | 'paid' | 'refunded';
  created_at: string;
}

export interface GameResult {
  id: number;
  trip_id: number;
  member_id: number;
  score: number;
  bonus_pct: number;
  payout_delta: number;
}

export interface QuizQuestion {
  id: number;
  question: string;
  options: string[];
  correctIndex: number;
}

// Debt calculation helpers
export interface Debt {
  from_member_id: number;
  to_member_id: number;
  amount: number;
}

export interface MemberBalance {
  member_id: number;
  telegram_id: number;
  username: string | null;
  net_balance: number; // positive = is owed money, negative = owes money
}
