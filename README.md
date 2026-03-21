# TripTon — Gamified Expense Splitter on TON

A **Telegram Mini App** for friend groups to split trip expenses, settle debts via **TON Connect**, and compete in a quiz where the prize pool gets redistributed based on performance.

Instead of awkwardly asking for money at the end of a trip, members click "End Trip" — debtors pay the bot via TON with a margin that forms a **prize pool**. Everyone plays a knowledge quiz. The top half of the leaderboard splits the pool. The bot then pays everyone back, adjusted by quiz results. Generous spenders get a scoring advantage in the quiz.

---

## User Flow

1. Add the bot to a **Telegram group chat** and run `/start`
2. During the trip, members log expenses with `/addexpense <amount> <description>` — each expense specifies a payer and which members benefit (partial splits supported)
3. When the trip ends, any member runs `/endtrip`
4. The bot calculates net balances and adds a configurable **margin** (default 10%) to debts — this margin forms the prize pool
5. Everyone opens the **Mini App** via the inline button and **connects their TON wallet** (both debtors and creditors)
6. Debtors pay their share to the bot. If not everyone pays within **10 minutes**, all payments are refunded and the trip resets
7. Once all payments are collected, a **knowledge quiz** launches for all members
8. After the quiz, the bot calculates payouts:
   - Creditors receive their base balance **minus** their margin share
   - The **top half** of the quiz leaderboard splits the effective prize pool (2x the original margin)
   - The bot sends TON directly to each member's wallet
9. The group is ready for a new trip!

---

## Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Initialize a new trip in the group. Auto-registers members as they chat |
| `/addexpense <amount> <desc>` | Log an expense with interactive beneficiary selection |
| `/balance` | Show current balances and total expenses |
| `/removeexpense` | Delete an expense (inline button picker) |
| `/endtrip` | End the trip and start the settlement flow |
| `/forget` | Reset the database (testing only) |

---

## Settlement & Payout Logic

### How debts are calculated

Each expense is split among selected beneficiaries. The bot computes a **net balance** per member:
- **Positive** = is owed money (creditor)
- **Negative** = owes money (debtor)

### What debtors pay

Each debtor pays the bot: `|debt| × (1 + margin%)`

For example, with 10% margin and a 1 TON debt → debtor pays **1.1 TON**.

### How payouts work after the quiz

The **effective prize pool** = margin collected from debtors + margin deducted from creditors = **2× the original margin**.

| Player type | Quiz result | Payout |
|-------------|-------------|--------|
| Creditor | Top half | `balance × (1 - margin%) + effectivePool / winnerCount` |
| Creditor | Bottom half | `balance × (1 - margin%)` |
| Debtor | Top half | `effectivePool / winnerCount` |
| Debtor | Bottom half | `0` |

**Example** — 2 players, 0.01 TON expense paid by A for both, 10% margin:
- A is owed 0.005 TON. B pays bot 0.0055 TON. Prize pool = 0.0005 TON.
- If B wins the quiz: A receives 0.0045, B receives 0.001. Total = 0.0055 ✓
- If A wins the quiz: A receives 0.0055, B receives 0. Total = 0.0055 ✓

### Spender advantage

Members who paid more than average get a **scoring bonus** in the quiz (up to +50% points per correct answer). This rewards the generous members who covered expenses for the group.

---

## Architecture

```
┌─────────────────┐     ┌──────────────────────┐     ┌────────────┐
│  Telegram Group  │◄───►│  Telegraf Bot         │◄───►│  SQLite DB │
│                  │     │  + Express API        │     │            │
└────────┬────────┘     └──────────┬───────────┘     └────────────┘
         │                         │
         ▼                         ▼
┌─────────────────┐     ┌──────────────────────┐
│  Mini App (TMA)  │────►│  TON Blockchain      │
│  React + Vite    │     │  via TON Connect     │
└─────────────────┘     └──────────────────────┘
```

The backend serves two roles:
- **Telegram bot** (Telegraf) — handles group commands, inline keyboards, notifications
- **REST API** (Express) — serves the Mini App frontend for payments, quiz, and wallet registration

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, TypeScript, Vite, React Router |
| Telegram Integration | @tonconnect/ui-react, @telegram-apps/sdk-react |
| Backend | Node.js, TypeScript, Telegraf 4, Express |
| Database | SQLite via better-sqlite3 (WAL mode) |
| Blockchain | @ton/ton, @ton/core, @ton/crypto (TON SDK) |
| TON API | TonCenter API (testnet/mainnet) |

---

## Project Structure

```
├── backend/
│   ├── src/
│   │   ├── index.ts              # Entry point — bot + Express API
│   │   ├── types.ts              # Shared TypeScript interfaces
│   │   ├── bot/
│   │   │   ├── commands.ts       # /start, /addexpense, /balance, /endtrip, etc.
│   │   │   └── callbacks.ts      # Inline keyboard handlers
│   │   ├── core/
│   │   │   ├── settlement.ts     # Debt simplification, payout calculation
│   │   │   └── timeout.ts        # 10-minute payment timer
│   │   ├── db/
│   │   │   ├── database.ts       # SQLite connection
│   │   │   ├── schema.ts         # Table definitions
│   │   │   └── queries.ts        # All SQL query functions
│   │   ├── game/
│   │   │   ├── engine.ts         # Quiz session state, scoring, endQuiz
│   │   │   └── questions.ts      # 30 general knowledge questions
│   │   └── ton/
│   │       ├── wallet.ts         # TON wallet init, sendTon, getBalance
│   │       ├── payments.ts       # Payment verification
│   │       └── payout.ts         # Execute TON payouts with retry logic
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
│
└── frontend/
    ├── src/
    │   ├── main.tsx              # React entry point
    │   ├── App.tsx               # Router, TON Connect provider
    │   ├── api/
    │   │   └── client.ts         # API client (fetch wrappers)
    │   ├── hooks/
    │   │   └── useTelegram.ts    # Telegram WebApp hook
    │   ├── components/
    │   │   ├── BalanceView.tsx    # Trip balances & expenses display
    │   │   ├── ExpenseForm.tsx    # Add expense form
    │   │   ├── PaymentFlow.tsx   # Wallet collection + payment UI
    │   │   └── QuizGame.tsx      # Quiz gameplay + results
    │   └── styles/
    │       └── index.css         # Telegram theme-aware styles
    ├── public/
    │   └── tonconnect-manifest.json
    ├── vite.config.ts
    └── package.json
```

---

## Database Schema

| Table | Purpose |
|-------|---------|
| `trips` | One per group session. Status: active → settling → playing → completed |
| `members` | Group members with telegram_id, username, wallet_address |
| `expenses` | Amount, payer, description, timestamp |
| `expense_beneficiaries` | Join table — which members each expense is split among |
| `payments` | Debtor payments to the bot (pending / paid / refunded) |
| `game_results` | Quiz scores, bonus %, final payout amount per member |

---

## API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/trip/:chatId` | Trip info, balances, expenses |
| POST | `/api/expense` | Add expense from Mini App |
| GET | `/api/payments/:tripId` | Payment list for a trip |
| POST | `/api/payment/verify` | Verify a TON payment |
| GET | `/api/wallet` | Bot's TON wallet address |
| POST | `/api/wallet/register` | Register member's wallet address |
| GET | `/api/trip/:tripId/wallets` | Wallet connection status for all members |
| GET | `/api/quiz/:tripId` | Quiz questions (without answers) |
| POST | `/api/quiz/answer` | Submit a quiz answer |
| POST | `/api/quiz/end` | End quiz, calculate results, trigger payouts |

---

## Mini App Flow

The Mini App has two phases when opened after `/endtrip`:

### Phase 1 — Wallet Collection
All members must connect their TON wallet via TON Connect. The UI polls every 3 seconds and shows who has connected. Payment buttons only appear once everyone is connected.

### Phase 2 — Payments
Debtors see a "Pay X TON" button. Creditors see "Waiting for others..." status. The UI polls payment statuses every 3 seconds. Once all debtors have paid, everyone is automatically redirected to the quiz.

### Quiz
4 random questions from a pool of 30. 15 seconds per question. Correct answers earn 100 points (+ spender bonus). After the last question, the backend calculates payouts and the bot sends TON to each member's wallet.

---

## Setup

### Prerequisites

- Node.js 18+
- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- A TON wallet mnemonic (24-word seed phrase)
- A Telegram Mini App configured via BotFather (set the Web App URL)
- (Optional) A TonCenter API key for higher rate limits

### Backend

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your credentials
npx ts-node src/index.ts
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend dev server runs on port 5173 and proxies `/api` requests to `localhost:3000`.

### Environment Variables

```env
BOT_TOKEN=           # Telegram bot token
WALLET_MNEMONIC=     # 24-word TON wallet seed phrase
TON_NETWORK=testnet  # testnet or mainnet
PORT=3000            # Backend port
MARGIN_PCT=10        # Prize pool margin percentage
MINI_APP_SHORT_NAME= # BotFather Mini App short name
TONCENTER_API_KEY=   # Optional: TonCenter API key for higher rate limits
```

### Exposing for Telegram

Telegram Mini Apps require HTTPS. For local development, use a tunnel:

```bash
# Using Cloudflare Tunnel (free)
cloudflared tunnel --url http://localhost:5173
```

Then set the tunnel URL as your Mini App URL in BotFather and update `frontend/public/tonconnect-manifest.json` with the same URL.

---

## Key Design Decisions

- **SQLite** — zero-config, single-file database. Perfect for a hackathon bot that runs on one server.
- **In-memory quiz sessions** — quiz state lives in memory for speed. Results are persisted to DB when the quiz ends. If a second player calls `endQuiz` after the session is deleted, saved DB results are returned.
- **Sequential TON transactions** — TON requires incrementing seqno per transaction. The bot waits 20 seconds between sends and retries on 429 rate limits (3 attempts).
- **Payout deduplication** — an in-memory Set prevents duplicate payouts per trip. It resets when `/endtrip` is called again.
- **10-minute timeout** — if not all debtors pay within 10 minutes, all payments (both paid and pending) are refunded and the trip resets to `active`.
- **Two-phase Mini App** — wallet addresses are collected from ALL members (not just debtors) before payments begin, so the bot knows where to send payouts.
