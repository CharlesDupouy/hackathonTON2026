import { Telegraf, Context, Markup } from 'telegraf';
import * as queries from '../db/queries';
import db from '../db/database';
import { initSchema } from '../db/schema';
import { calculateDebts, applyMargin } from '../core/settlement';
import { startPaymentTimer } from '../core/timeout';
import { startQuiz } from '../game/engine';
import { resetPayoutStatus } from '../ton/payout';

// In-memory pending expenses: maps a unique key to expense data awaiting beneficiary selection
interface PendingExpense {
  tripId: number;
  payerId: number;
  amount: number;
  description: string | null;
  selectedBeneficiaries: Set<number>; // member IDs
  allSelected: boolean;
  messageId?: number;
}

const pendingExpenses = new Map<string, PendingExpense>();

function pendingKey(chatId: number, userId: number): string {
  return `${chatId}:${userId}`;
}

export function registerCommands(bot: Telegraf<Context>): void {
  // =============================================
  // AUTO-REGISTRATION: catch all group members
  // =============================================

  // When new members join the group, register them
  bot.on('new_chat_members', async (ctx) => {
    const chatId = ctx.chat.id;
    const trip = queries.getActiveTrip(chatId);
    if (!trip) return;

    for (const newUser of ctx.message.new_chat_members) {
      if (!newUser.is_bot) {
        queries.addMember(trip.id, newUser.id, newUser.username || newUser.first_name);
      }
    }
  });

  // When a member leaves, we keep them in DB (they may still owe money)
  // but we could add a flag if needed

  // Auto-register on ANY message in the group
  bot.use(async (ctx, next) => {
    if (ctx.chat && ctx.chat.type !== 'private' && ctx.from && !ctx.from.is_bot) {
      const trip = queries.getActiveTrip(ctx.chat.id);
      if (trip) {
        queries.addMember(trip.id, ctx.from.id, ctx.from.username || ctx.from.first_name);
      }
    }
    return next();
  });

  // /forget — Reset the database (for testing only)
  bot.command('forget', async (ctx) => {
    try {
      db.exec(`
        DROP TABLE IF EXISTS game_results;
        DROP TABLE IF EXISTS payments;
        DROP TABLE IF EXISTS expense_beneficiaries;
        DROP TABLE IF EXISTS expenses;
        DROP TABLE IF EXISTS members;
        DROP TABLE IF EXISTS trips;
      `);
      initSchema();
      pendingExpenses.clear();
      await ctx.reply('🧹 *Database reset!* Everything has been wiped clean.\nUse /start to begin a new trip.', { parse_mode: 'Markdown' });
    } catch (err) {
      console.error('Failed to reset database:', err);
      await ctx.reply('❌ Failed to reset database.');
    }
  });

  // /start — Initialize bot in group, create trip
  bot.command('start', async (ctx) => {
    const chatId = ctx.chat.id;
    const chatType = ctx.chat.type;

    if (chatType === 'private') {
      return ctx.reply(
        '🏝️ *TripTon* — Gamified Expense Splitter on TON\n\n' +
        'Add me to a group chat to get started!\n\n' +
        'I help friend groups split expenses during trips, ' +
        'then settle up with TON and play a quiz for bonus rewards! 🎮',
        { parse_mode: 'Markdown' }
      );
    }

    // Check for existing active trip
    let trip = queries.getActiveTrip(chatId);
    if (trip) {
      return ctx.reply(
        `🏝️ There's already an active trip! (ID: ${trip.id})\n\n` +
        'Use /addexpense to log expenses.\n' +
        'Use /balance to see who owes whom.\n' +
        'Use /endtrip when the trip is over.'
      );
    }

    // Create new trip
    const marginPct = parseFloat(process.env.MARGIN_PCT || '10');
    trip = queries.createTrip(chatId, marginPct);

    // Register the user who started it
    const user = ctx.from;
    if (user) {
      queries.addMember(trip.id, user.id, user.username || user.first_name);
    }

    // Pre-load all group admins as members (best we can do via Telegram API)
    try {
      const admins = await ctx.telegram.getChatAdministrators(chatId);
      for (const admin of admins) {
        if (!admin.user.is_bot) {
          queries.addMember(trip.id, admin.user.id, admin.user.username || admin.user.first_name);
        }
      }
    } catch (err) {
      console.warn('Could not fetch group admins:', err);
    }

    await ctx.reply(
      '🏝️ *A new trip has started!* 🎉\n\n' +
      `Prize pool margin: ${marginPct}%\n\n` +
      '💡 Every group member will be auto-registered as they send messages.\n\n' +
      '*Available commands:*\n' +
      '/addexpense `<amount>` `<description>` — Log an expense\n' +
      '/balance — See who owes whom\n' +
      '/removeexpense — Remove an expense\n' +
      '/endtrip — End the trip and settle up',
      { parse_mode: 'Markdown' }
    );
  });

  // /addexpense <amount> <description> — Step 1: parse, then show beneficiary picker
  bot.command('addexpense', async (ctx) => {
    const chatId = ctx.chat.id;
    const trip = queries.getActiveTrip(chatId);

    if (!trip || trip.status !== 'active') {
      return ctx.reply('❌ No active trip. Use /start to create one.');
    }

    const user = ctx.from;
    if (!user) return;

    const member = queries.addMember(trip.id, user.id, user.username || user.first_name);

    // Parse: /addexpense 25 Lunch at the beach
    const text = ctx.message.text;
    const parts = text.split(' ').slice(1);
    if (parts.length < 1) {
      return ctx.reply(
        '📝 *Usage:* `/addexpense <amount> <description>`\n\n' +
        'Example: `/addexpense 10 Lunch at the beach`',
        { parse_mode: 'Markdown' }
      );
    }

    const amount = parseFloat(parts[0]);
    if (isNaN(amount) || amount <= 0) {
      return ctx.reply('❌ Invalid amount. Please enter a positive number.');
    }

    const description = parts.slice(1).join(' ') || null;
    const allMembers = queries.getTripMembers(trip.id);

    if (allMembers.length < 2) {
      // Only one member, just add for everyone (self)
      queries.addExpense(trip.id, member.id, amount, description, [member.id]);
      return ctx.reply(
        `✅ Expense added: *${amount} TON* — ${description || 'No description'}\n\n` +
        '⚠️ Only you are registered so far. Other members will be auto-registered when they send a message.',
        { parse_mode: 'Markdown' }
      );
    }

    // Store pending expense and show selection keyboard
    const key = pendingKey(chatId, user.id);
    const pending: PendingExpense = {
      tripId: trip.id,
      payerId: member.id,
      amount,
      description,
      selectedBeneficiaries: new Set(allMembers.map((m) => m.id)), // default: everyone
      allSelected: true,
    };
    pendingExpenses.set(key, pending);

    const keyboard = buildBeneficiaryKeyboard(pending, allMembers, chatId, user.id);
    const msg = await ctx.reply(
      `💰 *${amount} TON* — ${description || 'No description'}\n\n` +
      '👥 *Who is this expense for?*\n' +
      'Tap members to toggle, then press ✅ Confirm.',
      { parse_mode: 'Markdown', ...keyboard }
    );

    pending.messageId = msg.message_id;
    pendingExpenses.set(key, pending);
  });

  // /balance — Show current balances
  bot.command('balance', async (ctx) => {
    const chatId = ctx.chat.id;
    const trip = queries.getActiveTrip(chatId);

    if (!trip) {
      return ctx.reply('❌ No active trip. Use /start to create one.');
    }

    const balances = queries.getBalances(trip.id);
    const expenses = queries.getExpenses(trip.id);

    if (balances.length === 0 || expenses.length === 0) {
      return ctx.reply('📊 No expenses recorded yet. Use /addexpense to add one.');
    }

    let msg = '📊 *Current Balances:*\n\n';
    for (const b of balances) {
      const name = b.username || `User_${b.telegram_id}`;
      const emoji = b.net_balance > 0 ? '🟢' : b.net_balance < 0 ? '🔴' : '⚪';
      const sign = b.net_balance >= 0 ? '+' : '';
      msg += `${emoji} ${name}: ${sign}${b.net_balance.toFixed(9)} TON\n`;
    }

    msg += `\n💰 Total expenses: ${expenses.reduce((s, e) => s + e.amount, 0).toFixed(9)} TON`;
    msg += `\n👥 Members: ${balances.length}`;

    await ctx.reply(msg, { parse_mode: 'Markdown' });
  });

  // /removeexpense — Show list of expenses with delete buttons
  bot.command('removeexpense', async (ctx) => {
    const chatId = ctx.chat.id;
    const trip = queries.getActiveTrip(chatId);

    if (!trip || trip.status !== 'active') {
      return ctx.reply('❌ No active trip or trip is already settling.');
    }

    const expenses = queries.getExpenses(trip.id);
    if (expenses.length === 0) {
      return ctx.reply('📝 No expenses to remove.');
    }

    const buttons = expenses.slice(0, 10).map((e) => [
      Markup.button.callback(
        `❌ ${e.amount} TON — ${e.description || 'No desc'} (by ${e.payer_username || '?'})`,
        `del_exp_${e.id}`
      ),
    ]);

    // Add cancel button
    buttons.push([Markup.button.callback('↩️ Cancel', 'del_exp_cancel')]);

    await ctx.reply(
      '🗑️ *Select an expense to remove:*',
      { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }
    );
  });

  // /endtrip — Calculate debts and start settlement
  bot.command('endtrip', async (ctx) => {
    const chatId = ctx.chat.id;
    const trip = queries.getActiveTrip(chatId);

    if (!trip) {
      return ctx.reply('❌ No active trip. Use /start to create one.');
    }

    if (trip.status !== 'active') {
      return ctx.reply(`⚠️ Trip is already in "${trip.status}" state.`);
    }

    const expenses = queries.getExpenses(trip.id);
    if (expenses.length === 0) {
      return ctx.reply('❌ No expenses recorded. Add some before ending the trip.');
    }

    // Calculate net balances
    const balances = queries.getBalances(trip.id);
    const debtors = balances.filter((b) => b.net_balance < -0.0001);
    const creditors = balances.filter((b) => b.net_balance > 0.0001);

    if (debtors.length === 0) {
      queries.updateTripStatus(trip.id, 'completed');
      return ctx.reply('✅ Everyone is already even! No settlements needed. 🎉');
    }

    const members = queries.getTripMembers(trip.id);
    const memberMap = new Map(members.map((m) => [m.id, m]));

    // Clean up any stale payments from previous /endtrip attempts
    queries.deleteStalePayments(trip.id);
    resetPayoutStatus(trip.id);

    // Each debtor pays the BOT: |net_balance| + margin %
    const marginFactor = 1 + trip.margin_pct / 100;
    let totalPrizePool = 0;

    for (const debtor of debtors) {
      const debt = Math.abs(debtor.net_balance);
      const margin = debt * (trip.margin_pct / 100);
      totalPrizePool += margin;
      const amountDue = Math.round(debt * marginFactor * 1e9) / 1e9;
      queries.createPayment(trip.id, debtor.member_id, amountDue);
    }

    totalPrizePool = Math.round(totalPrizePool * 1e9) / 1e9;

    // Update trip status
    queries.updateTripStatus(trip.id, 'settling');

    // Start 10-minute timer
    startPaymentTimer(trip.id, 10 * 60 * 1000, (tripId) => {
      ctx.telegram.sendMessage(
        chatId,
        '⏰ *Settlement timed out!*\n\n' +
        'Not everyone paid within 10 minutes. All payments have been refunded.\n' +
        'Use /endtrip to try again when everyone is ready.',
        { parse_mode: 'Markdown' }
      );
    });

    // Build settlement message
    let msg = '🏁 *Trip Ended! Settlement Time* 💎\n\n';
    msg += `Prize pool margin: ${trip.margin_pct}%\n`;
    msg += `Prize pool: ${totalPrizePool.toFixed(9)} TON\n\n`;
    msg += '*💸 Payments to the bot:*\n';

    for (const debtor of debtors) {
      const debt = Math.abs(debtor.net_balance);
      const amountDue = Math.round(debt * marginFactor * 1e9) / 1e9;
      const name = debtor.username || `User_${debtor.telegram_id}`;
      msg += `  ${name}: *${amountDue.toFixed(9)} TON* (${debt.toFixed(9)} + margin)\n`;
    }

    msg += '\n*💰 Will receive from the bot (after quiz):*\n';
    for (const creditor of creditors) {
      const name = creditor.username || `User_${creditor.telegram_id}`;
      msg += `  ${name}: *${creditor.net_balance.toFixed(9)} TON* ± quiz bonus\n`;
    }

    msg += '\n⏱️ Debtors have *10 minutes* to pay via TON Connect.\n';
    msg += 'Open the Mini App to make your payment! 👇';

    const appShortName = process.env.MINI_APP_SHORT_NAME || 'pay';
    const botUsername = ctx.botInfo.username;
    const miniAppLink = `https://t.me/${botUsername}/${appShortName}?startapp=${trip.id}`;
    await ctx.reply(msg, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.url('💎 Pay Now', miniAppLink)],
      ]),
    });
  });
}

// =============================================
// Helper: build beneficiary selection keyboard
// =============================================

function buildBeneficiaryKeyboard(
  pending: PendingExpense,
  members: ReturnType<typeof queries.getTripMembers>,
  chatId: number,
  userId: number
) {
  const key = pendingKey(chatId, userId);
  const buttons: any[][] = [];

  // "Everyone" toggle button
  const everyoneLabel = pending.allSelected ? '✅ Everyone' : '⬜ Everyone';
  buttons.push([Markup.button.callback(everyoneLabel, `exp_all_${key}`)]);

  // Individual member buttons (2 per row)
  const memberButtons = members.map((m) => {
    const name = m.username || `User_${m.telegram_id}`;
    const selected = pending.selectedBeneficiaries.has(m.id);
    const label = selected ? `✅ ${name}` : `⬜ ${name}`;
    return Markup.button.callback(label, `exp_member_${key}_${m.id}`);
  });

  for (let i = 0; i < memberButtons.length; i += 2) {
    buttons.push(memberButtons.slice(i, i + 2));
  }

  // Confirm and cancel
  buttons.push([
    Markup.button.callback('✅ Confirm', `exp_confirm_${key}`),
    Markup.button.callback('❌ Cancel', `exp_cancel_${key}`),
  ]);

  return Markup.inlineKeyboard(buttons);
}

// Export for use in callbacks
export { pendingExpenses, pendingKey, buildBeneficiaryKeyboard };
export type { PendingExpense };
