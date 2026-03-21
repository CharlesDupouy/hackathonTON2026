import { sendTon, getBalance } from './wallet';
import * as queries from '../db/queries';

// Track trips that have completed payouts to prevent duplicates
const payoutsCompleted = new Set<number>();

/** Allow payouts for a trip again (called when a new settlement starts) */
export function resetPayoutStatus(tripId: number): void {
  payoutsCompleted.delete(tripId);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MAX_RETRIES = 3;
const RETRY_DELAY = 20000; // 20s between retries (rate limit cooldown)
const TX_DELAY = 20000;    // 20s between transactions

export interface PayoutResult {
  member_id: number;
  username: string | null;
  amount: number;
  txHash: string | null;
  success: boolean;
}

async function sendWithRetry(toAddress: string, amount: number, username: string | null): Promise<string> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await sendTon(toAddress, amount);
    } catch (err: any) {
      const is429 = err.message?.includes('429') || err.response?.status === 429;
      if (is429 && attempt < MAX_RETRIES) {
        console.log(`⏳ Rate limited sending to ${username}, retrying in ${RETRY_DELAY / 1000}s (attempt ${attempt}/${MAX_RETRIES})`);
        await sleep(RETRY_DELAY);
      } else {
        throw err;
      }
    }
  }
  throw new Error('Max retries exceeded');
}

/**
 * Execute TON payouts to all members who are owed money after the quiz.
 * payout_delta in game_results stores the total TON each member should receive.
 */
export async function executePayouts(tripId: number): Promise<PayoutResult[]> {
  // Prevent duplicate payouts for the same trip
  if (payoutsCompleted.has(tripId)) {
    console.log(`⏭️ Payouts already completed for trip ${tripId}, skipping`);
    return [];
  }
  payoutsCompleted.add(tripId);

  const gameResults = queries.getGameResults(tripId);
  const members = queries.getTripMembers(tripId);
  const memberMap = new Map(members.map((m) => [m.id, m]));

  // Check bot balance before starting
  try {
    const balance = parseFloat(await getBalance());
    const totalNeeded = gameResults
      .filter((r) => r.payout_delta > 0)
      .reduce((sum, r) => sum + r.payout_delta, 0);

    if (balance < totalNeeded) {
      console.error(
        `❌ Insufficient bot balance for payouts: have ${balance} TON, need ${totalNeeded} TON`
      );
    }
  } catch (err: any) {
    console.warn('⚠️ Could not check balance before payouts:', err.message);
  }

  const payoutResults: PayoutResult[] = [];
  let isFirst = true;

  for (const result of gameResults) {
    if (result.payout_delta <= 0) continue;

    const member = memberMap.get(result.member_id);
    if (!member?.wallet_address) {
      console.error(`❌ No wallet address for member ${result.member_id} (${result.username})`);
      payoutResults.push({
        member_id: result.member_id,
        username: result.username,
        amount: result.payout_delta,
        txHash: null,
        success: false,
      });
      continue;
    }

    // Wait between transactions for seqno to increment + avoid rate limits
    if (!isFirst) {
      await sleep(TX_DELAY);
    }
    isFirst = false;

    try {
      const txHash = await sendWithRetry(member.wallet_address, result.payout_delta, result.username);
      console.log(
        `✅ Sent ${result.payout_delta.toFixed(9)} TON to ${result.username} (${member.wallet_address}) — ${txHash}`
      );
      payoutResults.push({
        member_id: result.member_id,
        username: result.username,
        amount: result.payout_delta,
        txHash,
        success: true,
      });
    } catch (err: any) {
      console.error(`❌ Failed to send to ${result.username}:`, err.message);
      payoutResults.push({
        member_id: result.member_id,
        username: result.username,
        amount: result.payout_delta,
        txHash: null,
        success: false,
      });
    }
  }

  return payoutResults;
}
