import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchTrip } from '../api/client';

interface MemberBalance {
  username: string | null;
  telegram_id: number;
  net_balance: number;
}

interface TripData {
  trip: { id: number; status: string };
  balances: MemberBalance[];
  expenses: Array<{
    id: number;
    amount: number;
    description: string;
    payer_username: string;
    created_at: string;
  }>;
}

function BalanceView() {
  const navigate = useNavigate();
  const [data, setData] = useState<TripData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: get chatId from Telegram context or URL param
    const chatId = 0;
    fetchTrip(chatId)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="loading">Loading trip data...</div>;
  }

  if (!data) {
    return (
      <div className="page-header">
        <h1>🏝️ TripTon</h1>
        <p>No active trip found. Use /start in a group chat!</p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>🏝️ TripTon</h1>
        <p>Trip is {data.trip.status}</p>
      </div>

      {/* Balances */}
      <div className="card">
        <div className="card-title">Balances</div>
        {data.balances.length === 0 ? (
          <p style={{ color: 'var(--tg-theme-hint-color)' }}>No expenses yet</p>
        ) : (
          data.balances.map((b) => (
            <div key={b.telegram_id} className="balance-item">
              <span>{b.username ?? `User ${b.telegram_id}`}</span>
              <span className={b.net_balance >= 0 ? 'balance-positive' : 'balance-negative'}>
                {b.net_balance >= 0 ? '+' : ''}{b.net_balance.toFixed(2)} TON
              </span>
            </div>
          ))
        )}
      </div>

      {/* Recent expenses */}
      <div className="card">
        <div className="card-title">Recent Expenses</div>
        {data.expenses.length === 0 ? (
          <p style={{ color: 'var(--tg-theme-hint-color)' }}>No expenses recorded</p>
        ) : (
          data.expenses.slice(0, 10).map((exp) => (
            <div key={exp.id} className="balance-item">
              <div>
                <div>{exp.description || 'Untitled'}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--tg-theme-hint-color)' }}>
                  by {exp.payer_username}
                </div>
              </div>
              <span style={{ fontWeight: 600 }}>{exp.amount.toFixed(2)} TON</span>
            </div>
          ))
        )}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
        <button className="btn btn-primary" onClick={() => navigate('/add')}>
          ➕ Add Expense
        </button>
        {data.trip.status === 'settling' && (
          <button className="btn btn-success" onClick={() => navigate('/pay')}>
            💎 Pay Now
          </button>
        )}
        {data.trip.status === 'playing' && (
          <button className="btn btn-primary" onClick={() => navigate('/quiz')}>
            🎮 Play Quiz
          </button>
        )}
      </div>
    </div>
  );
}

export default BalanceView;
