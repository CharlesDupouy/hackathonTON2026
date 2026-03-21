import dotenv from 'dotenv';
dotenv.config();

import { Telegraf } from 'telegraf';
import express from 'express';
import cors from 'cors';
import { initSchema } from './db/schema';
import { registerCommands } from './bot/commands';
import { registerCallbacks } from './bot/callbacks';
import { initWallet, getWalletAddress } from './ton/wallet';
import * as queries from './db/queries';
import { verifyPayment } from './ton/payments';
import { executePayouts } from './ton/payout';
import { startQuiz, submitAnswer, endQuiz, getQuizSession } from './game/engine';
import { cancelPaymentTimer } from './core/timeout';

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN is required. Set it in .env');
  process.exit(1);
}

const PORT = parseInt(process.env.PORT || '3000');

async function main() {
  // Initialize database
  console.log('📦 Initializing database...');
  initSchema();

  // Initialize TON wallet
  console.log('💎 Initializing TON wallet...');
  await initWallet();

  // Initialize bot
  console.log('🤖 Starting Telegram bot...');
  const bot = new Telegraf(BOT_TOKEN!);
  registerCommands(bot);
  registerCallbacks(bot);

  // Global error handler — prevents crashes from stale callback queries after restarts
  bot.catch((err: any, ctx) => {
    console.error(`⚠️ Bot error for ${ctx.updateType}:`, err.message || err);
  });

  // Start bot polling
  bot.launch();
  console.log('✅ Bot is running!');

  // Initialize Express API for the Mini App
  const app = express();
  app.use(cors());
  app.use(express.json());

  // ==========================================
  // API ROUTES
  // ==========================================

  // GET /api/trip/:chatId — Get trip info, balances, expenses
  app.get('/api/trip/:chatId', (req, res) => {
    const chatId = parseInt(req.params.chatId);
    const trip = queries.getActiveTrip(chatId);

    if (!trip) {
      return res.json({ error: 'No active trip', trip: null, balances: [], expenses: [] });
    }

    const balances = queries.getBalances(trip.id);
    const expenses = queries.getExpenses(trip.id);

    res.json({ trip, balances, expenses });
  });

  // POST /api/expense — Add expense from Mini App
  app.post('/api/expense', (req, res) => {
    const { chatId, payerTelegramId, amount, description, beneficiaryTelegramIds } = req.body;

    const trip = queries.getActiveTrip(chatId);
    if (!trip || trip.status !== 'active') {
      return res.status(400).json({ error: 'No active trip' });
    }

    const member = queries.getMember(trip.id, payerTelegramId);
    if (!member) {
      return res.status(400).json({ error: 'Payer not registered in this trip' });
    }

    // Resolve beneficiaries
    let beneficiaryIds: number[];
    if (beneficiaryTelegramIds && beneficiaryTelegramIds.length > 0) {
      beneficiaryIds = beneficiaryTelegramIds
        .map((tid: number) => queries.getMember(trip.id, tid))
        .filter(Boolean)
        .map((m: any) => m.id);
    } else {
      // Default: all members
      beneficiaryIds = queries.getTripMembers(trip.id).map((m) => m.id);
    }

    const expense = queries.addExpense(trip.id, member.id, amount, description, beneficiaryIds);
    res.json({ success: true, expense });
  });

  // GET /api/payments/:tripId — Get payments for a trip
  app.get('/api/payments/:tripId', (req, res) => {
    const tripId = parseInt(req.params.tripId);
    const payments = queries.getPayments(tripId);
    res.json(payments);
  });

  // POST /api/payment/verify — Verify a TON payment
  app.post('/api/payment/verify', (req, res) => {
    const { tripId, memberTelegramId, txHash } = req.body;

    const member = queries.getMember(tripId, memberTelegramId);
    if (!member) {
      return res.status(400).json({ error: 'Member not found' });
    }

    const result = verifyPayment(tripId, member.id, txHash);

    if (result.allPaid) {
      // All payments received — cancel timeout and start quiz
      cancelPaymentTimer(tripId);

      // Get the trip to calculate prize pool
      const trip = queries.getTripById(tripId);
      if (trip) {
        const payments = queries.getPayments(tripId);
        const totalPaid = payments
          .filter((p) => p.status === 'paid')
          .reduce((sum, p) => sum + p.amount_due, 0);
        const balances = queries.getBalances(tripId);
        const totalOriginalDebt = balances
          .filter((b) => b.net_balance < 0)
          .reduce((sum, b) => sum + Math.abs(b.net_balance), 0);
        const prizePool = totalPaid - totalOriginalDebt;

        startQuiz(tripId, prizePool > 0 ? prizePool : 0);
      }
    }

    res.json(result);
  });

  // GET /api/quiz/:tripId — Get quiz state
  app.get('/api/quiz/:tripId', (req, res) => {
    const tripId = parseInt(req.params.tripId);
    const session = getQuizSession(tripId);

    if (!session) {
      return res.json({ error: 'No active quiz', questions: [], finished: false });
    }

    // Return questions without correct answers
    const questions = session.questions.map(({ correctIndex, ...q }) => q);
    res.json({
      questions,
      currentIndex: 0,
      timePerQuestion: 15,
      scores: [],
      finished: false,
    });
  });

  // POST /api/quiz/answer — Submit a quiz answer
  app.post('/api/quiz/answer', (req, res) => {
    const { tripId, memberTelegramId, questionId, answerIndex } = req.body;

    const member = queries.getMember(tripId, memberTelegramId);
    if (!member) {
      return res.status(400).json({ error: 'Member not found' });
    }

    try {
      const result = submitAnswer(tripId, member.id, questionId, answerIndex);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // POST /api/quiz/end — End the quiz and get results, then trigger payouts
  app.post('/api/quiz/end', (req, res) => {
    const { tripId } = req.body;

    try {
      const results = endQuiz(tripId);
      res.json({ success: true, results });

      // Fire-and-forget: execute TON payouts in background
      const trip = queries.getTripById(tripId);
      if (trip) {
        console.log(`🚀 Starting payouts for trip ${tripId}, chat_id=${trip.chat_id}`);
        executePayouts(tripId)
          .then((payoutResults) => {
            console.log(`📊 Payout results for trip ${tripId}:`, JSON.stringify(payoutResults));
            const successful = payoutResults.filter((p) => p.success);
            const failed = payoutResults.filter((p) => !p.success);

            if (successful.length === 0 && failed.length === 0) {
              console.log(`ℹ️ No payout results for trip ${tripId} (already completed or empty)`);
              return;
            }

            let msg = '💸 Payouts Complete!\n\n';
            for (const p of successful) {
              msg += `✅ ${p.username}: ${p.amount.toFixed(9)} TON sent\n`;
            }
            for (const p of failed) {
              msg += `❌ ${p.username}: ${p.amount.toFixed(9)} TON failed\n`;
            }

            console.log(`📤 Sending payout notification to chat ${trip.chat_id}`);
            bot.telegram.sendMessage(trip.chat_id, msg)
              .then(() => console.log(`✅ Payout notification sent to chat ${trip.chat_id}`))
              .catch((sendErr) => console.error(`❌ Failed to send payout notification:`, sendErr));
          })
          .catch((err) => {
            console.error('❌ Payout execution failed:', err);
            bot.telegram.sendMessage(
              trip.chat_id,
              '❌ Payout Error\nAutomatic payouts failed. Please contact the admin.'
            ).catch((sendErr) => console.error('❌ Failed to send error notification:', sendErr));
          });
      }
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // GET /api/wallet — Get bot wallet address
  app.get('/api/wallet', (_req, res) => {
    const address = getWalletAddress();
    res.json({ address });
  });

  // POST /api/wallet/register — Register a member's wallet address
  app.post('/api/wallet/register', (req, res) => {
    const { tripId, memberTelegramId, walletAddress } = req.body;

    const member = queries.getMember(tripId, memberTelegramId);
    if (!member) {
      return res.status(400).json({ error: 'Member not found' });
    }

    queries.updateMemberWallet(member.id, walletAddress);
    res.json({ success: true });
  });

  // GET /api/trip/:tripId/wallets — Get wallet connection status for all members
  app.get('/api/trip/:tripId/wallets', (req, res) => {
    const tripId = parseInt(req.params.tripId);
    const members = queries.getTripMembers(tripId);
    res.json(
      members.map((m) => ({
        member_id: m.id,
        username: m.username,
        telegram_id: m.telegram_id,
        has_wallet: !!m.wallet_address,
      }))
    );
  });

  // Start Express server
  app.listen(PORT, () => {
    console.log(`🌐 API server running on http://localhost:${PORT}`);
  });

  // Graceful shutdown
  process.once('SIGINT', () => {
    bot.stop('SIGINT');
    process.exit(0);
  });
  process.once('SIGTERM', () => {
    bot.stop('SIGTERM');
    process.exit(0);
  });
}

main().catch(console.error);
