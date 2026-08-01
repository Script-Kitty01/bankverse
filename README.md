# BankVerse — Modern Banking Platform

A full-stack banking application built with Next.js 15, TypeScript, Appwrite, Plaid, and Dwolla.

## Features

- **Authentication** — Secure sign-up/sign-in with Appwrite, session management, and middleware route protection
- **Bank Account Linking** — Connect real bank accounts via Plaid Link
- **Dashboard** — Financial overview with total balance, recent transactions, and spending analytics
- **My Banks** — View and manage all connected bank accounts
- **Transaction History** — Paginated, searchable transaction log with category badges
- **Payment Transfer** — Multi-step ACH transfer form with Dwolla integration
- **Profile & Settings** — Edit personal info, change password, danger zone
- **Security** — Rate limiting, CSRF protection, input sanitization, audit logging
- **CI/CD** — GitHub Actions pipeline (lint → type-check → test → build → docker)
- **Production Ready** — Docker multi-stage builds, Vercel deployment, Sentry monitoring, SEO metadata

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router, Turbopack) |
| Language | TypeScript 5 (strict mode) |
| Styling | Tailwind CSS 3.4 + shadcn/ui (Radix UI) |
| Forms | react-hook-form + zod |
| Charts | Chart.js + react-chartjs-2 |
| Backend/Auth | Appwrite (node-appwrite SDK) |
| Banking | Plaid API + Dwolla API |
| Monitoring | Sentry |
| CI/CD | GitHub Actions |
| Container | Docker (multi-stage) |
| Hosting | Vercel |

## Getting Started

### Prerequisites

- Node.js 20+
- npm 10+
- Appwrite instance (cloud or self-hosted)
- Plaid developer account
- Dwolla sandbox account

### Environment Variables

Copy `.env.local` and fill in your credentials:

```bash
# Appwrite
NEXT_PUBLIC_APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
NEXT_PUBLIC_APPWRITE_PROJECT_ID=your-project-id
NEXT_PUBLIC_APPWRITE_DATABASE_ID=your-database-id
APPWRITE_API_KEY=your-api-key

# Plaid
PLAID_CLIENT_ID=your-client-id
PLAID_SECRET=your-secret
PLAID_ENV=sandbox

# Dwolla
DWOLLA_KEY=your-key
DWOLLA_SECRET=your-secret
DWOLLA_ENV=sandbox

# Sentry
NEXT_PUBLIC_SENTRY_DSN=your-sentry-dsn

# Site
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### Install & Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Docker

```bash
docker compose up --build
```

## Project Structure

```
├── app/
│   ├── (auth)/           # Sign-in / Sign-up pages
│   ├── (root)/           # Protected pages (dashboard, my-banks, etc.)
│   ├── api/health/       # Health check endpoint
│   ├── sitemap.ts        # Dynamic sitemap
│   └── robots.ts         # Robots.txt config
├── components/
│   ├── ui/               # shadcn/ui primitives
│   └── *.tsx             # Feature components
├── lib/
│   ├── actions/          # Server actions (user, plaid, dwolla)
│   ├── appwrite/         # Appwrite config, auth, db
│   ├── plaid/            # Plaid client config
│   ├── dwolla/           # Dwolla client config
│   ├── security/         # Rate limiting, CSRF, sanitization, audit
│   └── utils.ts          # Utility functions
├── constants/            # Sidebar links, categories, etc.
├── types/                # TypeScript type definitions
├── public/icons/         # SVG icons
├── Dockerfile            # Multi-stage production build
├── docker-compose.yml    # Docker Compose config
└── .github/workflows/    # CI/CD pipelines
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with Turbopack |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |

## License

MIT
