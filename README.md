# Mashang International Operations Platform

Mashang International Operations Platform is an open-source logistics operations system for short-haul freight teams. It combines a driver-facing WeChat mini program, an admin web console, Supabase-backed operational data, and agent/OCR support for document and legal workflows.

The project is actively maintained and used as an internal operations workflow. The long-term direction is to turn repeatable logistics service work into SaaS-ready, agent-assisted workflows, including computer-use operations, document review, and legal support modules.

## What It Includes

- Driver expense reporting and voucher upload through a Taro + React mini program
- Admin review, confirmation, and management workflows through a React + Vite web console
- Vehicle, driver, advance-fund, fee-type, and operation-log management
- Supabase migrations and shared data model for the mini program and admin console
- OCR and legal/document workflow support through proxy services
- Agent-oriented service layer for future operational automation

## Repository Layout

```text
.
├── webpage/     # React + Vite admin console and proxy services
├── miniapp/     # Taro + React WeChat mini program
├── supabase/    # Database migrations, seed data, and edge functions
├── docs/        # Release, migration, staging, and workflow documentation
└── AGENTS.md    # Maintainer rules for AI coding agents
```

## Tech Stack

- TypeScript
- React
- Vite
- Taro
- Supabase
- Tailwind CSS
- Biome / tsgo / Vitest

## Local Development

### Admin Web Console

```bash
cd webpage
npm install
npm run dev
```

The web console uses proxy services for privileged database access. Copy the relevant `.env.example` file before running a proxy service, and never commit real service keys.

### WeChat Mini Program

```bash
cd miniapp
pnpm install
pnpm run dev:staging
```

The mini program uses build-time environment files. For public forks, replace project-specific values with your own Supabase URL, anon key, and app id.

## Security

- Do not commit `.env` files containing service-role keys, session secrets, API keys, OCR credentials, or LLM credentials.
- Use `.env.example` files as templates only.
- Review repository history and deployment documentation before using this project with production data.
- Production and staging environments should use separate Supabase projects and separate proxy configurations.

## License

MIT License. See [LICENSE](./LICENSE).
