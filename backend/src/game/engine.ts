import { QuizQuestion } from '../types';
import { getRandomQuestions, getQuestionById } from './questions';
import { calculateSpenderAdvantage, calculatePayouts } from '../core/settlement';
import * as queries from '../db/queries';

// In-memory quiz sessions (tripId -> quiz state)
interface QuizSession {
  tripId: number;
  questions: QuizQuestion[];
  memberScores: Map<number, number>;       // memberId -> total score
  memberAnswered: Map<number, Set<number>>; // memberId -> set of answered questionIds
  bonuses: Map<number, number>;             // memberId -> bonus % from spender advantage
  prizePool: number;
  startedAt: number;
}

const activeSessions = new Map<number, QuizSession>();

const BASE_TIME_PER_QUESTION = 15; // seconds
const POINTS_PER_CORRECT = 100;

/**
 * Start a quiz for a trip. Returns the questions (without correct answers).
 */
export function startQuiz(tripId: number, prizePool: number): {
  questions: Array<Omit<QuizQuestion, 'correctIndex'>>;
  timePerQuestion: number;
} {
  const questions = getRandomQuestions(4);
  const bonuses = calculateSpenderAdvantage(tripId);

  const session: QuizSession = {
    tripId,
    questions,
    memberScores: new Map(),
    memberAnswered: new Map(),
    bonuses,
    prizePool,
    startedAt: Date.now(),
  };

  activeSessions.set(tripId, session);

  // Update trip status
  queries.updateTripStatus(tripId, 'playing');

  return {
    questions: questions.map(({ correctIndex, ...q }) => q),
    timePerQuestion: BASE_TIME_PER_QUESTION,
  };
}

/**
 * Submit an answer for a member. Returns whether it was correct and the correct answer.
 */
export function submitAnswer(
  tripId: number,
  memberId: number,
  questionId: number,
  answerIndex: number
): { correct: boolean; correctIndex: number; pointsEarned: number } {
  const session = activeSessions.get(tripId);
  if (!session) throw new Error('No active quiz for this trip');

  const question = getQuestionById(questionId);
  if (!question) throw new Error('Question not found');

  // Check if already answered
  if (!session.memberAnswered.has(memberId)) {
    session.memberAnswered.set(memberId, new Set());
  }
  const answered = session.memberAnswered.get(memberId)!;
  if (answered.has(questionId)) {
    return { correct: false, correctIndex: question.correctIndex, pointsEarned: 0 };
  }
  answered.add(questionId);

  const correct = answerIndex === question.correctIndex;
  let pointsEarned = 0;

  if (correct) {
    const bonus = session.bonuses.get(memberId) || 0;
    pointsEarned = Math.round(POINTS_PER_CORRECT * (1 + bonus / 100));
    session.memberScores.set(
      memberId,
      (session.memberScores.get(memberId) || 0) + pointsEarned
    );
  }

  return { correct, correctIndex: question.correctIndex, pointsEarned };
}

/**
 * End the quiz and calculate final results.
 */
export function endQuiz(tripId: number): Array<{
  member_id: number;
  username: string | null;
  score: number;
  bonus_pct: number;
  payout_delta: number;
}> {
  const session = activeSessions.get(tripId);
  if (!session) {
    // Session already ended by another player — return saved results from DB
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
    throw new Error('No active quiz for this trip');
  }

  const members = queries.getTripMembers(tripId);
  const results: Array<{ member_id: number; score: number }> = [];

  for (const member of members) {
    results.push({
      member_id: member.id,
      score: session.memberScores.get(member.id) || 0,
    });
  }

  // Calculate payouts: creditors get base minus margin, top half splits effective pool
  const balances = queries.getBalances(tripId);
  const trip = queries.getTripById(tripId);
  const marginPct = trip?.margin_pct || 10;
  const payouts = calculatePayouts(session.prizePool, marginPct, balances, results);

  // Save results to DB (payout_delta = total TON to receive from the bot)
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

export function getQuizSession(tripId: number): QuizSession | undefined {
  return activeSessions.get(tripId);
}

export function isQuizActive(tripId: number): boolean {
  return activeSessions.has(tripId);
}
