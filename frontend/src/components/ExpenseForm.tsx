import { useState } from 'react';
import { useTelegram } from '../hooks/useTelegram';
import { addExpense } from '../api/client';

function ExpenseForm() {
  const { user } = useTelegram();
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !amount) return;

    setLoading(true);
    try {
      await addExpense({
        chatId: 0, // Will be resolved from start_param or context
        payerTelegramId: user.id,
        amount: parseFloat(amount),
        description,
        beneficiaryTelegramIds: [], // TODO: populate from member selection
      });
      setSuccess(true);
      setAmount('');
      setDescription('');
      setTimeout(() => setSuccess(false), 2000);
    } catch (err) {
      console.error('Failed to add expense:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>➕ Add Expense</h1>
        <p>Record a payment you made for the group</p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="card">
          <div className="form-group">
            <label htmlFor="amount">Amount (TON)</label>
            <input
              id="amount"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="description">Description</label>
            <input
              id="description"
              type="text"
              placeholder="e.g. Lunch at the beach"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* TODO: Member selection checkboxes */}
          <div className="card-title">Split with</div>
          <p style={{ color: 'var(--tg-theme-hint-color)', fontSize: '0.875rem' }}>
            All group members (customizable coming soon)
          </p>
        </div>

        <button
          type="submit"
          className="btn btn-primary"
          disabled={loading || !amount}
        >
          {loading ? 'Adding...' : success ? '✓ Added!' : 'Add Expense'}
        </button>
      </form>
    </div>
  );
}

export default ExpenseForm;
