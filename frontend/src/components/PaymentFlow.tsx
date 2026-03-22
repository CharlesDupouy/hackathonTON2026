import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TonConnectButton, useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';
import { fetchPayments, fetchWallet, verifyPayment, registerWallet, fetchWalletStatus } from '../api/client';
import { useTelegram } from '../hooks/useTelegram';

interface PaymentInfo {
  id: number;
  amount_due: number;
  status: 'pending' | 'paid' | 'refunded';
  member_username: string;
  member_telegram_id: number;
}

interface WalletStatus {
  member_id: number;
  username: string;
  telegram_id: number;
  has_wallet: boolean;
}

function PaymentFlow() {
  const { user } = useTelegram();
  const [tonConnectUI] = useTonConnectUI();
  const wallet = useTonWallet();
  const [searchParams] = useSearchParams();
  const startParam = window.Telegram?.WebApp?.initDataUnsafe?.start_param;
  const tripId = parseInt(startParam || searchParams.get('tripId') || '0', 10);

  const [payments, setPayments] = useState<PaymentInfo[]>([]);
  const [botWallet, setBotWallet] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState(600);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  // Wallet collection phase
  const [walletStatuses, setWalletStatuses] = useState<WalletStatus[]>([]);
  const [walletRegistered, setWalletRegistered] = useState(false);

  const allWalletsCollected = walletStatuses.length > 0 && walletStatuses.every((w) => w.has_wallet);

  // Initial data fetch
  useEffect(() => {
    Promise.all([
      fetchPayments(tripId),
      fetchWallet(),
      fetchWalletStatus(tripId),
    ]).then(([p, w, ws]) => {
      setPayments(p);
      setBotWallet(w.address);
      setWalletStatuses(ws);
    }).catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Register wallet address when user connects TonConnect
  useEffect(() => {
    if (!wallet || !user || walletRegistered) return;
    const address = wallet.account.address;
    registerWallet({ tripId, memberTelegramId: user.id, walletAddress: address })
      .then(() => setWalletRegistered(true))
      .catch(console.error);
  }, [wallet, user, walletRegistered]);

  // Poll wallet statuses until all collected
  useEffect(() => {
    if (allWalletsCollected) return;
    const interval = setInterval(() => {
      fetchWalletStatus(tripId)
        .then((ws) => setWalletStatuses(ws))
        .catch(console.error);
    }, 3000);
    return () => clearInterval(interval);
  }, [tripId, allWalletsCollected]);

  // Countdown timer
  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft((t) => t - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handlePay = async (payment: PaymentInfo) => {
    if (!botWallet) return;
    setPaying(true);
    try {
      const amountNano = BigInt(Math.round(payment.amount_due * 1e9)).toString();

      const tx = await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 600,
        messages: [
          {
            address: botWallet,
            amount: amountNano,
          },
        ],
      });

      await verifyPayment({
        tripId,
        memberTelegramId: payment.member_telegram_id,
        txHash: tx.boc,
      });

      setPayments((prev) =>
        prev.map((p) =>
          p.id === payment.id ? { ...p, status: 'paid' as const } : p
        )
      );
    } catch (err: any) {
      console.error('Payment failed:', err);
      const msg = err?.message || '';
      if (msg.includes('no request') || msg.includes('reconnect') || msg.includes('bridge')) {
        setPayError('Wallet connection lost. Please disconnect and reconnect your wallet.');
      } else if (msg !== 'Reject request') {
        setPayError('Payment failed. Please try again.');
      }
    } finally {
      setPaying(false);
    }
  };

  const allPaid = payments.length > 0 && payments.every((p) => p.status === 'paid');

  // Poll payment statuses (once wallets are collected)
  useEffect(() => {
    if (!allWalletsCollected || allPaid) return;
    const interval = setInterval(() => {
      fetchPayments(tripId)
        .then((p) => setPayments(p))
        .catch(console.error);
    }, 3000);
    return () => clearInterval(interval);
  }, [tripId, allWalletsCollected, allPaid]);

  // Close Mini App when all paid — game is played via bot DM
  useEffect(() => {
    if (allPaid) {
      const timer = setTimeout(() => {
        window.Telegram?.WebApp?.close();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [allPaid]);

  if (loading) {
    return <div className="loading">Loading payment info...</div>;
  }

  const myPayments = user
    ? payments.filter((p) => String(p.member_telegram_id) === String(user.id))
    : payments;
  const pendingPayments = myPayments.filter((p) => p.status === 'pending');
  const isDebtor = myPayments.length > 0;
  const myAllPaid = isDebtor && myPayments.every((p) => p.status === 'paid');

  // ========== PHASE 1: Wallet Collection ==========
  if (!allWalletsCollected) {
    return (
      <div>
        <div className="page-header">
          <h1>💎 Settlement</h1>
          <p>Everyone must connect their wallet to proceed</p>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
          <TonConnectButton />
        </div>

        <div className={`timer ${timeLeft < 60 ? 'urgent' : ''}`}>
          ⏱️ {formatTime(timeLeft)}
        </div>

        <div className="card">
          <div className="card-title">Wallet Status</div>
          {walletStatuses.map((w) => (
            <div key={w.member_id} className="balance-item">
              <span>{w.username || `User_${w.telegram_id}`}</span>
              <span className={`badge badge-${w.has_wallet ? 'paid' : 'pending'}`}>
                {w.has_wallet ? 'connected' : 'waiting...'}
              </span>
            </div>
          ))}
        </div>

        {!wallet && (
          <div className="card" style={{ textAlign: 'center' }}>
            <p>
              {isDebtor
                ? '👆 Connect your wallet to pay'
                : '👆 Connect your wallet to receive your payout after the quiz'}
            </p>
          </div>
        )}

        {wallet && !allWalletsCollected && (
          <div className="card" style={{ textAlign: 'center' }}>
            <p>✅ Your wallet is connected. Waiting for others...</p>
          </div>
        )}
      </div>
    );
  }

  // ========== PHASE 2: Payments ==========
  return (
    <div>
      <div className="page-header">
        <h1>💎 Settlement</h1>
        <p>Pay your share to continue to the game</p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
        <TonConnectButton />
      </div>

      {payError && (
        <div className="card" style={{ textAlign: 'center', color: 'red', marginBottom: '8px' }}>
          <p>{payError}</p>
          <button className="btn" onClick={() => { tonConnectUI.disconnect(); setPayError(null); }}>
            Disconnect & Reconnect
          </button>
        </div>
      )}

      <div className={`timer ${timeLeft < 60 ? 'urgent' : ''}`}>
        ⏱️ {formatTime(timeLeft)}
      </div>

      <div className="card">
        <div className="card-title">Payment Status</div>
        {payments.map((p) => (
          <div key={p.id} className="balance-item">
            <span>{p.member_username}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 600 }}>{p.amount_due.toFixed(9)} TON</span>
              <span className={`badge badge-${p.status}`}>{p.status}</span>
            </div>
          </div>
        ))}
      </div>

      {pendingPayments.map((p) => (
        <button
          key={p.id}
          className="btn btn-success"
          onClick={() => handlePay(p)}
          disabled={paying || !wallet || !botWallet}
          style={{ marginBottom: '8px' }}
        >
          {!wallet
            ? 'Connect wallet to pay'
            : paying
            ? 'Processing...'
            : `Pay ${p.amount_due.toFixed(9)} TON${!user ? ` (${p.member_username})` : ''}`}
        </button>
      ))}

      {myAllPaid && !allPaid && (
        <div className="card" style={{ textAlign: 'center' }}>
          <p>✅ You've paid! Waiting for others...</p>
        </div>
      )}

      {!isDebtor && !allPaid && (
        <div className="card" style={{ textAlign: 'center' }}>
          <p>💰 You don't owe anything. Waiting for others to pay...</p>
        </div>
      )}

      {allPaid && (
        <div className="card" style={{ textAlign: 'center' }}>
          <p>🎮 All paid! Check your private chat with the bot to play the game!</p>
          <p style={{ fontSize: '0.85rem', opacity: 0.7 }}>This window will close automatically...</p>
        </div>
      )}
    </div>
  );
}

export default PaymentFlow;
