import { Telegraf, Context } from 'telegraf';
import * as queries from '../db/queries';
import { pendingExpenses, pendingKey, buildBeneficiaryKeyboard } from './commands';
import type { PendingExpense } from './commands';

export function registerCallbacks(bot: Telegraf<Context>): void {
  // =============================================
  // Expense deletion
  // =============================================
  bot.action(/del_exp_(\d+)/, async (ctx) => {
    const expenseId = parseInt(ctx.match[1]);
    try {
      queries.removeExpense(expenseId);
      await ctx.answerCbQuery('✅ Expense removed!');
      await ctx.editMessageText('✅ Expense has been removed.');
    } catch (err) {
      console.error('Failed to remove expense:', err);
      await ctx.answerCbQuery('❌ Failed to remove expense.');
    }
  });

  // Cancel remove expense
  bot.action('del_exp_cancel', async (ctx) => {
    await ctx.editMessageText('↩️ Cancelled.');
    await ctx.answerCbQuery();
  });

  // =============================================
  // Beneficiary selection: toggle "Everyone"
  // =============================================
  bot.action(/exp_all_(.+)/, async (ctx) => {
    const key = ctx.match[1];
    const pending = pendingExpenses.get(key);
    if (!pending) {
      return ctx.answerCbQuery('❌ Expense expired. Try /addexpense again.');
    }

    const members = queries.getTripMembers(pending.tripId);

    if (pending.allSelected) {
      // Deselect all
      pending.allSelected = false;
      pending.selectedBeneficiaries.clear();
    } else {
      // Select all
      pending.allSelected = true;
      pending.selectedBeneficiaries = new Set(members.map((m) => m.id));
    }

    pendingExpenses.set(key, pending);
    const [chatIdStr, userIdStr] = key.split(':');
    const keyboard = buildBeneficiaryKeyboard(pending, members, parseInt(chatIdStr), parseInt(userIdStr));

    try {
      await ctx.editMessageReplyMarkup(keyboard.reply_markup);
      await ctx.answerCbQuery();
    } catch {
      await ctx.answerCbQuery();
    }
  });

  // =============================================
  // Beneficiary selection: toggle individual member
  // =============================================
  bot.action(/exp_member_(.+)_(\d+)$/, async (ctx) => {
    const key = ctx.match[1];
    const memberId = parseInt(ctx.match[2]);
    const pending = pendingExpenses.get(key);
    if (!pending) {
      return ctx.answerCbQuery('❌ Expense expired. Try /addexpense again.');
    }

    const members = queries.getTripMembers(pending.tripId);

    if (pending.selectedBeneficiaries.has(memberId)) {
      pending.selectedBeneficiaries.delete(memberId);
      pending.allSelected = false;
    } else {
      pending.selectedBeneficiaries.add(memberId);
      // Check if all are now selected
      pending.allSelected = pending.selectedBeneficiaries.size === members.length;
    }

    pendingExpenses.set(key, pending);
    const [chatIdStr, userIdStr] = key.split(':');
    const keyboard = buildBeneficiaryKeyboard(pending, members, parseInt(chatIdStr), parseInt(userIdStr));

    try {
      await ctx.editMessageReplyMarkup(keyboard.reply_markup);
      await ctx.answerCbQuery();
    } catch {
      await ctx.answerCbQuery();
    }
  });

  // =============================================
  // Confirm expense
  // =============================================
  bot.action(/exp_confirm_(.+)/, async (ctx) => {
    const key = ctx.match[1];
    const pending = pendingExpenses.get(key);
    if (!pending) {
      return ctx.answerCbQuery('❌ Expense expired. Try /addexpense again.');
    }

    if (pending.selectedBeneficiaries.size === 0) {
      return ctx.answerCbQuery('⚠️ Select at least one member!');
    }

    // Save the expense
    const beneficiaryIds = Array.from(pending.selectedBeneficiaries);
    queries.addExpense(
      pending.tripId,
      pending.payerId,
      pending.amount,
      pending.description,
      beneficiaryIds
    );

    // Get member names for confirmation
    const members = queries.getTripMembers(pending.tripId);
    const selectedMembers = members.filter((m) => pending.selectedBeneficiaries.has(m.id));
    const memberNames = selectedMembers.map((m) => m.username || `User_${m.telegram_id}`).join(', ');
    const perPerson = (pending.amount / selectedMembers.length).toFixed(9);

    pendingExpenses.delete(key);

    await ctx.editMessageText(
      `✅ *Expense added!*\n\n` +
      `💰 Amount: *${pending.amount} TON*\n` +
      `📝 Description: ${pending.description || 'N/A'}\n` +
      `👥 Split among: ${memberNames}\n` +
      `💵 Per person: ${perPerson} TON`,
      { parse_mode: 'Markdown' }
    );
    await ctx.answerCbQuery('✅ Expense saved!');
  });

  // =============================================
  // Cancel expense
  // =============================================
  bot.action(/exp_cancel_(.+)/, async (ctx) => {
    const key = ctx.match[1];
    pendingExpenses.delete(key);
    await ctx.editMessageText('❌ Expense cancelled.');
    await ctx.answerCbQuery();
  });
}
