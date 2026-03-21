import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { TonConnectUIProvider } from '@tonconnect/ui-react';
import ExpenseForm from './components/ExpenseForm';
import BalanceView from './components/BalanceView';
import PaymentFlow from './components/PaymentFlow';
import QuizGame from './components/QuizGame';

// TON Connect manifest (must be publicly accessible)
const MANIFEST_URL = `${window.location.origin}/tonconnect-manifest.json`;

// When opened as a Telegram Mini App via t.me/bot/app?startapp=tripId,
// Telegram loads the root URL. Detect start_param and redirect to /pay.
function RootRedirect() {
  const startParam = window.Telegram?.WebApp?.initDataUnsafe?.start_param;
  if (startParam) {
    return <Navigate to="/pay" replace />;
  }
  return <BalanceView />;
}

function App() {
  return (
    <TonConnectUIProvider manifestUrl={MANIFEST_URL}>
      <BrowserRouter>
        <div className="app">
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/add" element={<ExpenseForm />} />
            <Route path="/pay" element={<PaymentFlow />} />
            <Route path="/quiz" element={<QuizGame />} />
          </Routes>
        </div>
      </BrowserRouter>
    </TonConnectUIProvider>
  );
}

export default App;
