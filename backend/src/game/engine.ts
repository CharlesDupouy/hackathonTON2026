import { calculateSpenderAdvantage, calculatePayouts } from '../core/settlement';
import * as queries from '../db/queries';

// In-memory game sessions (tripId -> game state)
interface GameSession {
  tripId: number;
  chatId: number;
  prizePool: number;
  expectedMembers: Map<number, number>; // telegramId -> memberId
  playedMembers: Set<number>;           // memberIds who submitted scores
  memberScores: Map<number, number>;    // memberId -> final score (with bonus applied)
  bonuses: Map<number, number>;         // memberId -> spender advantage %
  startedAt: number;
}

const activeSessions = new Map<number, GameSession>();

/**
 * Start a game session for a trip. Called when all payments are collected.
 */
export function startGame(tripId: number, prizePool: number, chatId: number): GameSession {
  const members = queries.getTripMembers(tripId);
  const bonuses = calculateSpenderAdvantage(tripId);

  const expectedMembers = new Map<number, number>();
  for (const m of members) {
    expectedMembers.set(m.telegram_id, m.id);
  }

  const session: GameSession = {
    tripId,
    chatId,
    prizePool,
    expectedMembers,
    playedMembers: new Set(),
    memberScores: new Map(),
    bonuses,
    startedAt: Date.now(),
  };

  activeSessions.set(tripId, session);

  // Update trip status
  queries.updateTripStatus(tripId, 'playing');

  return session;
}

/**
 * Record a member's game score. Applies spender advantage bonus.
 * Returns whether the score was recorded and if all members have played.
 */
export function recordScore(
  tripId: number,
  memberId: number,
  rawScore: number
): { recorded: boolean; rawScore: number; finalScore: number; bonusPct: number; allPlayed: boolean; duplicate?: boolean } {
  const session = activeSessions.get(tripId);
  if (!session) {
    return { recorded: false, rawScore, finalScore: 0, bonusPct: 0, allPlayed: false };
  }

  // Dedup: already played
  if (session.playedMembers.has(memberId)) {
    return { recorded: false, rawScore, finalScore: 0, bonusPct: 0, allPlayed: false, duplicate: true };
  }

  // Apply spender advantage bonus
  const bonusPct = session.bonuses.get(memberId) || 0;
  const finalScore = Math.round(rawScore * (1 + bonusPct / 100));

  session.playedMembers.add(memberId);
  session.memberScores.set(memberId, finalScore);

  const allPlayed = session.playedMembers.size >= session.expectedMembers.size;

  return { recorded: true, rawScore, finalScore, bonusPct, allPlayed };
}

/**
 * Find which active game a Telegram user belongs to.
 * Needed because web_app_data arrives in private chat (no group context).
 */
export function findTripByMember(telegramId: number): { tripId: number; memberId: number } | undefined {
  for (const [tripId, session] of activeSessions) {
    const memberId = session.expectedMembers.get(telegramId);
    if (memberId !== undefined) {
      return { tripId, memberId };
    }
  }
  return undefined;
}

/**
 * Finalize the game: calculate payouts, save results, clean up.
 */
export function finalizeGame(tripId: number): Array<{
  member_id: number;
  username: string | null;
  score: number;
  bonus_pct: number;
  payout_delta: number;
}> {
  const session = activeSessions.get(tripId);
  if (!session) {
    // Session already finalized — return saved results from DB
    const saved = queries.getGameResults(tripId);
    if (saved.length > 0) {
      return saved.map((r) => ({
        member_id: r.member_id,
        username: r.username,
        score: r.score,
        bonus_pct: r.bonus_pct,
        payout_delta: r.payout_delta,
      }));
    }
    throw new Error('No active game for this trip');
  }

  const members = queries.getTripMembers(tripId);
  const results: Array<{ member_id: number; score: number }> = [];

  for (const member of members) {
    results.push({
      member_id: member.id,
      score: session.memberScores.get(member.id) || 0,
    });
  }

  // Calculate payouts
  const balances = queries.getBalances(tripId);
  const trip = queries.getTripById(tripId);
  const marginPct = trip?.margin_pct || 10;
  const payouts = calculatePayouts(session.prizePool, marginPct, balances, results);

  // Save results to DB
  const finalResults = members.map((member) => {
    const score = session.memberScores.get(member.id) || 0;
    const bonusPct = session.bonuses.get(member.id) || 0;
    const payout = payouts.get(member.id) || 0;

    queries.saveGameResult(tripId, member.id, score, bonusPct, payout);

    return {
      member_id: member.id,
      username: member.username,
      score,
      bonus_pct: bonusPct,
      payout_delta: payout,
    };
  });

  // Sort by score descending
  finalResults.sort((a, b) => b.score - a.score);

  // Update trip status
  queries.updateTripStatus(tripId, 'completed');

  // Clean up session
  activeSessions.delete(tripId);

  return finalResults;
}

/**
 * Get the game session for a trip (if active).
 */
export function getGameSession(tripId: number): GameSession | undefined {
  return activeSessions.get(tripId);
}
