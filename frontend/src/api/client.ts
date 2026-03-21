const API_BASE = '/api';

export async function fetchTrip(chatId: number) {
  const res = await fetch(`${API_BASE}/trip/${chatId}`);
  return res.json();
}

export async function addExpense(data: {
  chatId: number;
  payerTelegramId: number;
  amount: number;
  description: string;
  beneficiaryTelegramIds: number[];
}) {
  const res = await fetch(`${API_BASE}/expense`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function fetchWallet(): Promise<{ address: string | null }> {
  const res = await fetch(`${API_BASE}/wallet`);
  return res.json();
}

export async function fetchPayments(tripId: number) {
  const res = await fetch(`${API_BASE}/payments/${tripId}`);
  return res.json();
}

export async function verifyPayment(data: {
  tripId: number;
  memberTelegramId: number;
  txHash: string;
}) {
  const res = await fetch(`${API_BASE}/payment/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function fetchQuiz(tripId: number) {
  const res = await fetch(`${API_BASE}/quiz/${tripId}`);
  return res.json();
}

export async function submitQuizAnswer(data: {
  tripId: number;
  memberTelegramId: number;
  questionId: number;
  answerIndex: number;
}) {
  const res = await fetch(`${API_BASE}/quiz/answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function endQuiz(tripId: number) {
  const res = await fetch(`${API_BASE}/quiz/end`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tripId }),
  });
  return res.json();
}

export async function registerWallet(data: {
  tripId: number;
  memberTelegramId: number;
  walletAddress: string;
}) {
  const res = await fetch(`${API_BASE}/wallet/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function fetchWalletStatus(tripId: number): Promise<
  Array<{ member_id: number; username: string; telegram_id: number; has_wallet: boolean }>
> {
  const res = await fetch(`${API_BASE}/trip/${tripId}/wallets`);
  return res.json();
}
