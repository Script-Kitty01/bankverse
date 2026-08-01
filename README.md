# 🏦 BankVerse — Modern Banking Platform

<div align="center">

![Next.js](https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![React 19](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![Appwrite](https://img.shields.io/badge/Appwrite-Backend-FD366E?style=for-the-badge&logo=appwrite&logoColor=white)
![Plaid](https://img.shields.io/badge/Plaid-Banking-000000?style=for-the-badge&logo=plaid&logoColor=white)
![Dwolla](https://img.shields.io/badge/Dwolla-ACH-FF6B00?style=for-the-badge&logo=dwolla&logoColor=white)
![Razorpay](https://img.shields.io/badge/Razorpay-UPI-02042B?style=for-the-badge&logo=razorpay&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![Sentry](https://img.shields.io/badge/Sentry-Monitoring-362D59?style=for-the-badge&logo=sentry&logoColor=white)

<br/>

<img src="public/icons/logo.svg" alt="BankVerse Logo" width="120" />

# 🏦 BankVerse

### *The Open-Source Banking Experience*

**Connect real bank accounts • Send ACH & UPI payments • Track spending with beautiful charts**

[![GitHub stars](https://img.shields.io/github/stars/Script-Kitty01/bankverse?style=social)](https://github.com/Script-Kitty01/bankverse)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://makeapullrequest.com)

[Features](#-features) • [Demo](#-live-demo) • [Architecture](#-architecture) • [Quick Start](#-quick-start) • [Payment Flows](#-payment-flows) • [Tech Stack](#-tech-stack)

</div>

---

## 📖 Overview

BankVerse is a **production-ready, full-stack banking application** that brings the modern fintech experience to the open-source world. Connect real bank accounts via **Plaid**, view your financial dashboard with interactive charts, browse transaction history, and send money through **Dwolla ACH** or **Razorpay UPI** — all from a beautiful, responsive interface.

> 💡 **Demo Mode**: Set `NEXT_PUBLIC_DEMO_MODE=true` and explore the full app with mock data — no API keys needed!

```mermaid
graph TB
    subgraph Client["🖥️ Client Browser"]
        UI["Next.js 15<br/>React 19 + Tailwind CSS"]
    end

    subgraph Auth["🔐 Authentication"]
        MW["Middleware<br/>Route Protection"]
        AW["Appwrite Auth<br/>Sessions + OAuth"]
    end

    subgraph Banking["🏦 Banking APIs"]
        PL["Plaid Link<br/>Account Linking"]
        DW["Dwolla<br/>ACH Transfers"]
        RZ["Razorpay<br/>UPI · Card · Netbanking"]
    end

    subgraph Backend["⚙️ Backend Services"]
        SA["Server Actions<br/>user · plaid · dwolla · razorpay"]
        DB["Appwrite DB<br/>users · banks · transactions · payments"]
        SEC["Security Layer<br/>Rate Limit · CSRF · Sanitize · Audit"]
    end

    subgraph Ops["🚀 DevOps"]
        CI["GitHub Actions<br/>Lint → Build → Docker"]
        DO["Docker<br/>Multi-stage Build"]
        SN["Sentry<br/>Error Monitoring"]
    end

    UI --> MW --> AW
    UI --> SA
    SA --> PL & DW & RZ
    SA --> DB
    SA --> SEC
    CI --> DO
    UI --> SN
```

---

## ✨ Features

### 🔐 Authentication & Security
| Feature | Description |
|---------|-------------|
| Email/Password Auth | Secure sign-up & sign-in via Appwrite with session management |
| Route Protection | Middleware-based redirects — unauthenticated users can't access dashboard |
| Demo Mode | `NEXT_PUBLIC_DEMO_MODE=true` skips auth, uses mock data for development |
| Rate Limiting | In-memory rate limiter on server actions (Redis-ready for production) |
| CSRF Protection | Token-based CSRF prevention on all forms |
| Input Sanitization | XSS prevention via HTML escaping |
| Audit Logging | Track sign-ins, transfers, and profile changes |

### 🏦 Banking & Payments
| Feature | Description |
|---------|-------------|
| **Plaid Link** | Connect real bank accounts (Chase, BofA, Wells Fargo, etc.) via Plaid sandbox |
| **Account Balances** | Real-time balance fetching with animated counters |
| **ACH Transfers** | Send money between accounts via Dwolla ACH with multi-step confirmation |
| **Razorpay UPI** | Pay via UPI apps (Google Pay, PhonePe, Paytm) with QR code or UPI ID |
| **Razorpay Card** | Credit/debit card payments through Razorpay checkout |
| **Razorpay Netbanking** | Direct bank transfers via Indian netbanking |
| **Razorpay Wallet** | Wallet payments (Paytm, Mobikwik, etc.) |

### 📊 Dashboard & Analytics
| Feature | Description |
|---------|-------------|
| Total Balance | Sum across all linked accounts with count-up animation |
| Spending by Category | Interactive doughnut chart with color-coded categories |
| Net Worth Trend | Line chart showing balance changes over time |
| Recent Transactions | Latest 10 transactions with channel badges and category tags |

### 💳 Account Management
| Feature | Description |
|---------|-------------|
| Bank Cards | Visual card display with masked account numbers and bank logos |
| Connect / Disconnect | Add new banks or remove existing connections |
| Multiple Accounts | Support for checking, savings, credit, and investment accounts |

### 📋 Transaction History
| Feature | Description |
|---------|-------------|
| Full History | Paginated, searchable transaction log across all accounts |
| Channel Badges | Color-coded badges: 🟣 UPI, 🟠 Card, 🔵 Netbanking, ⚪ Online, 🟡 In Store |
| Category Tags | Visual category chips (Food, Travel, Shopping, Transfer, etc.) |
| Status Indicators | Pending / Completed status with animated badges |

### 📱 User Experience
| Feature | Description |
|---------|-------------|
| Responsive Design | Mobile sidebar + adaptive layouts for all screen sizes |
| Loading States | Skeleton loaders on every page for smooth UX |
| SEO Optimized | Dynamic sitemap, robots.txt, per-page metadata |
| Dark Mode Ready | Tailwind-based theming infrastructure |

---

## � Live Demo

### 🏠 Dashboard
```
┌──────────────────────────────────────────────────────────┐
│  🏦 BankVerse    🔍 Search...         👤 John Doe       │
│──────────────────────────────────────────────────────────│
│                                                          │
│  Welcome, John                    ┌──────────────────┐  │
│  Access & manage your accounts    │  Chase Bank      │  │
│                                   │  ****4821        │  │
│  ┌─────────────────────────┐      │  $4,820.50       │  │
│  │ Total Balance           │      └──────────────────┘  │
│  │ $17,621.25              │      ┌──────────────────┐  │
│  │ 2 Bank Accounts         │      │  Wells Fargo     │  │
│  └─────────────────────────┘      │  ****9075        │  │
│                                   │  $12,800.75      │  │
│  📊 Spending by Category          └──────────────────┘  │
│  ┌─────────────────────┐                                 │
│  │   🍕 Food   35%     │                                 │
│  │   🛒 Shop   25%     │                                 │
│  │   💸 Trans  20%     │                                 │
│  │   ✈️ Travel 20%     │                                 │
│  └─────────────────────┘                                 │
│                                                          │
│  📋 Recent Transactions                                  │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Starbucks  🟡in store  -$12.50  ✓  Jul 31  🍕   │   │
│  │ Amazon     ⚪online    -$89.99  ✓  Jul 30  🛒   │   │
│  │ UPI Trans  🟣UPI       -$2,500  ✓  Jul 18  💸   │   │
│  └──────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

### 💸 Payment Transfer — Dual Payment Methods

```
┌──────────────────────────────────────────────────────────┐
│  💸 Payment Transfer                                     │
│  ┌─────────────────────┬─────────────────────────────┐   │
│  │ 🏦 Bank Transfer    │ 📱 Razorpay / UPI  ◀ active │   │
│  └─────────────────────┴─────────────────────────────┘   │
│                                                          │
│  Amount (INR)                                            │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 2,500                                            │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  Payment Method                                          │
│  ┌──────────────┐ ┌──────────────┐                      │
│  │ 📱 UPI  ✓   │ │ 💳 Card     │                      │
│  └──────────────┘ └──────────────┘                      │
│  ┌──────────────┐ ┌──────────────┐                      │
│  │ 🏦 Netbank  │ │ 👛 Wallet   │                      │
│  └──────────────┘ └──────────────┘                      │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │         Pay ₹2,500 via UPI                       │   │
│  └──────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

### 📱 UPI QR Code Payment

```
┌──────────────────────────────────────────────────────────┐
│  💸 Payment Transfer                                     │
│                                                          │
│  Amount (INR): 2,500                                     │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │                                                  │   │
│  │              ████████████████████                │   │
│  │              ██ ▄▄▄▄▄ ██▀▀█ ██                │   │
│  │              ██ █   █ ██▀▀█ ██                │   │
│  │              ██ ▀▀▀▀▀ ██  █ ██                │   │
│  │              ██▀▀▀▀▀▀▀▀█ ▀▀██                │   │
│  │              ████████████████████                │   │
│  │                                                  │   │
│  │     Scan with any UPI app to pay                 │   │
│  │                                                  │   │
│  │     ┌──────────────────────────┐                 │   │
│  │     │ 📱 bankverse@upi    📋   │                 │   │
│  │     └──────────────────────────┘                 │   │
│  │                                                  │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │         Simulate UPI Payment ₹2,500              │   │
│  └──────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

---

## �🏗️ Architecture

```mermaid
flowchart LR
    subgraph Routes["📄 App Router"]
        direction TB
        Auth["(auth)/<br/>sign-in · sign-up"]
        Root["(root)/<br/>dashboard · my-banks<br/>transaction-history<br/>payment-transfer · profile"]
        API["api/health"]
    end

    subgraph Components["🧩 Components"]
        direction TB
        Layout["Sidebar · MobileNav · HeaderBox"]
        Cards["BankCard · TotalBalanceBox"]
        Charts["DoughnutChart · AnimatedCounter"]
        Forms["AuthForm · TransferForm<br/>RazorpayCheckout · UpiQrCode"]
        Data["TransactionsTable · Pagination · RightSidebar"]
    end

    subgraph DataLayer["📦 Data Layer"]
        direction TB
        Actions["Server Actions<br/>user · plaid · dwolla · razorpay"]
        SDK["Appwrite SDK<br/>auth · config · db"]
        External["Plaid API · Dwolla API · Razorpay API"]
    end

    subgraph Security["🛡️ Security"]
        direction TB
        Rate["Rate Limiter"]
        CSRF["CSRF Tokens"]
        Sanitize["Input Sanitization"]
        Audit["Audit Logger"]
    end

    Routes --> Components
    Components --> DataLayer
    DataLayer --> Security
```

### Data Flow: Connecting a Bank Account

```mermaid
sequenceDiagram
    actor User
    participant UI as BankVerse UI
    participant SA as Server Actions
    participant Plaid as Plaid API
    participant Dwolla as Dwolla API
    participant DB as Appwrite DB

    User->>UI: Click "Connect Bank"
    UI->>SA: createLinkToken(userId)
    SA->>Plaid: POST /link/token/create
    Plaid-->>SA: link_token
    SA-->>UI: Link token
    UI->>User: Open Plaid Link modal
    User->>Plaid: Select bank & authenticate
    Plaid-->>UI: public_token + metadata
    UI->>SA: exchangePublicToken(public_token)
    SA->>Plaid: POST /item/public_token/exchange
    Plaid-->>SA: access_token + item_id
    SA->>Plaid: POST /processor/token/create
    Plaid-->>SA: processor_token
    SA->>Dwolla: Create funding source
    Dwolla-->>SA: funding_source_url
    SA->>DB: Store bank record
    DB-->>SA: Success
    SA-->>UI: Bank connected ✅
    UI-->>User: Show new bank card
```

### Data Flow: ACH Transfer

```mermaid
sequenceDiagram
    actor User
    participant UI as Transfer Form
    participant SA as dwolla.actions
    participant Dwolla as Dwolla API
    participant DB as Appwrite DB

    User->>UI: Select source bank
    User->>UI: Enter amount & recipient
    User->>UI: Confirm transfer
    UI->>SA: createTransfer({source, destination, amount})
    SA->>Dwolla: POST /transfers
    Dwolla-->>SA: transfer_url + status
    SA->>DB: Log transaction
    SA-->>UI: Transfer initiated ✅
    UI-->>User: Show confirmation
```

### Razorpay UPI Payment Flow

```mermaid
sequenceDiagram
    actor User
    participant UI as RazorpayCheckout
    participant SA as razorpay.actions
    participant RZ as Razorpay API
    participant DB as Appwrite DB

    User->>UI: Enter amount & select UPI
    UI->>SA: createRazorpayOrder(amount, "INR")
    SA->>RZ: POST /orders
    RZ-->>SA: order_id + amount
    SA-->>UI: Order created
    UI->>User: Open Razorpay modal
    User->>RZ: Authenticate UPI payment
    RZ-->>UI: payment_id + signature
    UI->>SA: verifyRazorpayPayment(orderId, paymentId, signature)
    SA->>SA: HMAC SHA256 verification
    SA-->>UI: Verified ✅
    UI->>SA: recordRazorpayPayment(...)
    SA->>DB: Store payment record
    DB-->>SA: Success
    SA-->>UI: Payment recorded ✅
    UI-->>User: 🎉 Payment Successful!
```

---

## 💸 Payment Flows

BankVerse supports **two payment rails** — choose based on your region and needs:

| | 🏦 Dwolla ACH | 📱 Razorpay / UPI |
|---|---|---|
| **Region** | United States | India |
| **Speed** | 1-3 business days | Instant |
| **Methods** | Bank-to-bank ACH | UPI, Card, Netbanking, Wallet |
| **Currency** | USD | INR |
| **Best for** | Large transfers, payroll | Everyday payments, e-commerce |
| **Fees** | Low / Free | Competitive per-transaction |

### Switching Payment Methods

The `TransferForm` component renders a tabbed interface:

```tsx
// Payment method tabs in TransferForm.tsx
<button onClick={() => setPaymentMethod("ach")}>
  🏦 Bank Transfer (ACH)
</button>
<button onClick={() => setPaymentMethod("razorpay")}>
  📱 Razorpay / UPI
</button>

// Conditional rendering
{paymentMethod === "ach" && <ACHTransferForm />}
{paymentMethod === "razorpay" && <RazorpayCheckout />}
```

---

## 🚀 Quick Start

### Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 20+ | Runtime |
| npm | 10+ | Package manager |

> 💡 **No API keys needed for demo mode!** Just clone, install, and run.

### 1. Clone & Install

```bash
git clone https://github.com/Script-Kitty01/bankverse.git
cd bankverse
npm install
```

### 2. Environment Variables

Create `.env.local` (or use the existing one with demo mode):

```bash
# ========== Demo Mode ==========
# Set to "true" to skip auth & use mock data
NEXT_PUBLIC_DEMO_MODE=true

# ========== Appwrite ==========
NEXT_PUBLIC_APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
NEXT_PUBLIC_APPWRITE_PROJECT_ID=your-project-id
NEXT_PUBLIC_APPWRITE_DATABASE_ID=your-database-id
APPWRITE_API_KEY=your-api-key

# ========== Plaid (optional) ==========
PLAID_CLIENT_ID=your-client-id
PLAID_SECRET=your-sandbox-secret
PLAID_ENV=sandbox

# ========== Dwolla (optional) ==========
DWOLLA_KEY=your-dwolla-key
DWOLLA_SECRET=your-dwolla-secret
DWOLLA_ENV=sandbox

# ========== Razorpay (optional) ==========
RAZORPAY_KEY_ID=rzp_test_xxx
RAZORPAY_KEY_SECRET=xxx
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_xxx

# ========== Sentry (optional) ==========
NEXT_PUBLIC_SENTRY_DSN=your-sentry-dsn
```

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) 🎉

### 4. Docker (Production)

```bash
docker compose up --build
```

The app will be available at `http://localhost:3000` with:
- ✅ Non-root user (`nextjs:nodejs`)
- ✅ Health check endpoint at `/api/health`
- ✅ Multi-stage optimized image

---

## �️ Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Framework** | Next.js 15 (App Router) | Server components, streaming, Turbopack |
| **Language** | TypeScript 5 (strict) | Type safety, better DX |
| **UI** | React 19 | Latest React with server components |
| **Styling** | Tailwind CSS 3.4 + shadcn/ui | Utility-first, accessible components |
| **Forms** | react-hook-form + zod | Performant forms with schema validation |
| **Charts** | Chart.js + react-chartjs-2 | Doughnut, line, and bar charts |
| **Animations** | react-countup | Animated number counters |
| **Auth** | Appwrite | Managed auth with sessions |
| **Database** | Appwrite DB | Document database with real-time |
| **Bank Linking** | Plaid API | Bank account linking + transactions |
| **ACH Payments** | Dwolla API | US bank-to-bank transfers |
| **UPI Payments** | Razorpay | Indian UPI, Card, Netbanking, Wallet |
| **Monitoring** | Sentry | Error tracking (client + server + edge) |
| **CI/CD** | GitHub Actions | Automated lint, build, docker |
| **Container** | Docker (multi-stage) | Production-ready Alpine image |
| **Icons** | Lucide React | Consistent, tree-shakeable icon set |

---

## 📁 Project Structure

```
bankverse/
├── app/
│   ├── (auth)/                        # 🔓 Public routes
│   │   ├── layout.tsx                 # Auth layout wrapper
│   │   ├── sign-in/page.tsx           # Sign-in form
│   │   └── sign-up/page.tsx           # Sign-up form
│   ├── (root)/                        # 🔒 Protected routes
│   │   ├── layout.tsx                 # Sidebar + mobile nav
│   │   ├── page.tsx                   # Dashboard home
│   │   ├── my-banks/                  # Connected accounts
│   │   ├── payment-transfer/          # ACH + Razorpay/UPI
│   │   ├── profile/                   # User settings
│   │   └── transaction-history/       # Full transaction log
│   ├── api/health/route.ts            # Health check endpoint
│   ├── globals.css                    # Global styles + Tailwind
│   └── layout.tsx                     # Root layout
├── components/
│   ├── ui/                            # shadcn/ui primitives
│   │   ├── button.tsx
│   │   ├── form.tsx
│   │   ├── input.tsx
│   │   ├── label.tsx
│   │   └── sheet.tsx
│   ├── AnimatedCounter.tsx            # Count-up animation
│   ├── AuthForm.tsx                   # Sign-in/up form
│   ├── BankCard.tsx                   # Visual bank card
│   ├── CustomInput.tsx                # Form input wrapper
│   ├── DoughnutChart.tsx              # Spending by category
│   ├── HeaderBox.tsx                  # Page header
│   ├── MobileNav.tsx                  # Mobile navigation
│   ├── RazorpayCheckout.tsx           # Razorpay payment UI
│   ├── RightSidebar.tsx               # Dashboard sidebar
│   ├── Sidebar.tsx                    # Main navigation
│   ├── TotalBalanceBox.tsx            # Balance summary
│   ├── TransactionsTable.tsx          # Transaction list with badges
│   ├── TransferForm.tsx               # ACH + Razorpay tabs
│   └── UpiQrCode.tsx                  # UPI QR code payment
├── lib/
│   ├── actions/                       # Server actions
│   │   ├── dwolla.actions.ts          # Dwolla ACH operations
│   │   ├── plaid.actions.ts           # Plaid account operations
│   │   ├── razorpay.actions.ts        # Razorpay payment operations
│   │   └── user.actions.ts            # Auth + user operations
│   ├── appwrite/                      # Appwrite SDK
│   │   ├── auth.ts                    # Session management
│   │   ├── config.ts                  # Client initialization
│   │   └── db.ts                      # Database CRUD + mock data
│   └── utils.ts                       # Shared utilities
├── constants/index.ts                 # App constants + nav links
├── middleware.ts                       # Auth route protection
├── types/index.d.ts                   # TypeScript declarations
├── docker-compose.yml                 # Docker Compose config
├── Dockerfile                         # Multi-stage Docker build
├── .github/workflows/                 # CI/CD pipelines
├── next.config.ts                     # Next.js configuration
├── tailwind.config.ts                 # Tailwind configuration
├── tsconfig.json                      # TypeScript configuration
└── package.json                       # Dependencies + scripts
```

---

## 🔒 Security

BankVerse implements multiple layers of security:

| Mechanism | File | Description |
|-----------|------|-------------|
| **Rate Limiting** | `lib/security/rate-limit.ts` | In-memory rate limiter (Redis-ready for production) |
| **CSRF Protection** | `lib/security/csrf.ts` | Token-based CSRF prevention for forms |
| **Input Sanitization** | `lib/security/sanitize.ts` | XSS prevention via HTML escaping |
| **Audit Logging** | `lib/security/audit.ts` | Track sign-ins, transfers, profile changes |
| **Middleware** | `middleware.ts` | Route protection + auth redirects |
| **Non-root User** | `Dockerfile` | Container runs as `nextjs:nodejs` |
| **Health Check** | `app/api/health/` | Monitoring endpoint for orchestration |
| **Demo Mode Guard** | All server actions | `NEXT_PUBLIC_DEMO_MODE` check before calling external APIs |

---

## 🚢 CI/CD Pipeline

```mermaid
graph LR
    A["Push to main"] --> B["Lint<br/>next lint"]
    B --> C["Type Check<br/>tsc --noEmit"]
    C --> D["Build<br/>next build"]
    D --> E["Docker Build<br/>Multi-stage"]
    E --> F["Push to Registry"]
    F --> G["Deploy<br/>Vercel"]
```

### GitHub Actions Workflows

- **`ci.yml`** — Runs on every push: lint → type-check → build → docker build
- **`deploy.yml`** — Deploys to Vercel on main branch pushes

---

## 🧪 API Reference

### Health Check

```http
GET /api/health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-08-01T12:00:00.000Z",
  "uptime": 3600.123,
  "environment": "production"
}
```

### Server Actions

| Action | File | Description |
|--------|------|-------------|
| `signUp()` | `user.actions.ts` | Create account + Appwrite session |
| `signIn()` | `user.actions.ts` | Email/password sign-in |
| `signOut()` | `user.actions.ts` | Delete current session |
| `getCurrentUser()` | `user.actions.ts` | Get logged-in user from session |
| `createLinkToken()` | `plaid.actions.ts` | Generate Plaid Link token |
| `exchangePublicToken()` | `plaid.actions.ts` | Exchange for access token |
| `getAccounts()` | `plaid.actions.ts` | Fetch linked bank accounts |
| `getTransactions()` | `plaid.actions.ts` | Fetch transaction history |
| `createTransfer()` | `dwolla.actions.ts` | Initiate ACH transfer |
| `createDwollaCustomer()` | `dwolla.actions.ts` | Create Dwolla customer |
| `createRazorpayOrder()` | `razorpay.actions.ts` | Create Razorpay payment order |
| `verifyRazorpayPayment()` | `razorpay.actions.ts` | Verify HMAC payment signature |
| `recordRazorpayPayment()` | `razorpay.actions.ts` | Record payment in database |

---

## 🎯 Roadmap

- [x] Plaid bank account linking
- [x] Dwolla ACH transfers
- [x] Razorpay UPI / Card / Netbanking / Wallet
- [x] Interactive dashboard with charts
- [x] Demo mode for development
- [x] Docker + CI/CD
- [ ] Real-time transaction notifications (WebSocket)
- [ ] Bill pay & recurring payments
- [ ] Budget tracking & goals
- [ ] Multi-currency support
- [ ] Mobile app (React Native)
- [ ] AI-powered spending insights

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

<div align="center">

**Built with ❤️ using Next.js, Appwrite, Plaid, Dwolla & Razorpay**

⭐ **Star this repo** if you find it useful!

[⬆ Back to Top](#-bankverse--modern-banking-platform)

</div>
