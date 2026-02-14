# Metallm - Multi-AI Aggregator Platform

## Overview

Metallm is a multi-AI aggregator platform that sends user queries to multiple AI models (GPT, Claude, Gemini) simultaneously, then synthesizes their responses into a unified summary. Users submit a prompt with an optional role context (trader, developer, creative, general), and the system orchestrates responses from specialized AI models — GPT acts as the main orchestrator/summarizer, Claude handles technical reasoning, Gemini handles creative/image tasks, and others handle social/casual analysis. Results are displayed in a "command center" style dark-themed dashboard.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend (React + Vite)
- **Framework**: React with TypeScript, bundled by Vite
- **Routing**: `wouter` for lightweight client-side routing
- **State Management**: TanStack React Query for server state (caching, fetching, mutations)
- **UI Components**: shadcn/ui (new-york style) built on Radix UI primitives with Tailwind CSS
- **Animations**: Framer Motion for page transitions and micro-interactions
- **Styling**: Tailwind CSS with CSS variables for theming; dark mode by default with a deep purple/cyan/magenta "command center" palette
- **Fonts**: Inter (body), Space Grotesk (headings), Fira Code/Geist Mono (code)
- **Path aliases**: `@/` maps to `client/src/`, `@shared/` maps to `shared/`

### Pages
- **Landing** (`/`): Public marketing page, redirects authenticated users to dashboard
- **Dashboard** (`/dashboard`): Protected. Query input + results display. Main interaction point
- **History** (`/history`): Protected. Lists all past queries
- **QueryDetail** (`/query/:id`): Protected. Shows full multi-model analysis results

### Backend (Express + Node.js)
- **Framework**: Express.js with TypeScript, run via `tsx` in dev
- **Build**: Custom build script using esbuild (server) + Vite (client). Production output goes to `dist/`
- **Dev server**: Vite dev server is mounted as middleware on the Express app for HMR
- **API prefix**: All API routes under `/api/`
- **Entry point**: `server/index.ts` creates HTTP server, registers routes, sets up logging

### API Structure
- `POST /api/metallm/process` — Submit a query for multi-model processing (authenticated)
- `GET /api/metallm/queries` — List user's query history (authenticated)
- `GET /api/metallm/queries/:id` — Get specific query with all model responses (authenticated)
- `GET /api/auth/user` — Get current authenticated user
- `GET /api/login` / `GET /api/logout` — Auth flow endpoints

### Shared API Contract
- Defined in `shared/routes.ts` using Zod schemas for input validation and response typing
- Both client and server import from `shared/` to ensure type safety across the stack

### Database (PostgreSQL + Drizzle ORM)
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema location**: `shared/schema.ts` (main), `shared/models/auth.ts`, `shared/models/chat.ts`
- **Migration strategy**: `drizzle-kit push` (schema push, not migration files)
- **Connection**: `pg.Pool` via `DATABASE_URL` environment variable

#### Key Tables:
- **`users`** — User profiles (id, email, name, profile image). Required for Replit Auth
- **`sessions`** — Session storage for express-session with connect-pg-simple. Required for Replit Auth
- **`queries`** — User submitted prompts with role, allModelsMode flag, and orchestrator summary
- **`model_responses`** — Individual AI model responses linked to queries (modelName, content, responseType, metadata)
- **`conversations`** / **`messages`** — Legacy/utility chat tables from Replit integrations scaffold

### Authentication
- **Replit Auth** via OpenID Connect (OIDC) with Passport.js
- Session-based auth stored in PostgreSQL via `connect-pg-simple`
- `isAuthenticated` middleware protects API routes
- Auth setup in `server/replit_integrations/auth/`
- Client checks auth state via `GET /api/auth/user` with React Query

### AI Model Integration
- **OpenAI/GPT**: Via `openai` npm package, configured with Replit AI Integrations env vars (`AI_INTEGRATIONS_OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL`). Acts as main orchestrator
- **Anthropic/Claude**: Via `@anthropic-ai/sdk`, configured with Replit AI Integrations env vars. Handles technical/code reasoning
- **Google Gemini**: Via `@google/genai`, configured with Replit AI Integrations env vars. Handles creative/image generation
- All AI clients initialized in `server/routes.ts`

### Replit Integrations Scaffold
Located in `server/replit_integrations/` and `client/replit_integrations/`:
- **auth/** — Replit OIDC auth setup, session management, user storage
- **chat/** — Generic conversation CRUD and chat routes
- **audio/** — Voice recording, playback, speech-to-text utilities
- **image/** — Image generation routes using GPT Image model
- **batch/** — Batch processing utilities with rate limiting and retries

### Build & Scripts
- `npm run dev` — Development server with HMR (tsx + Vite middleware)
- `npm run build` — Production build (Vite for client → `dist/public`, esbuild for server → `dist/index.cjs`)
- `npm start` — Run production build
- `npm run check` — TypeScript type checking
- `npm run db:push` — Push Drizzle schema to database

## External Dependencies

### Required Environment Variables
- `DATABASE_URL` — PostgreSQL connection string
- `SESSION_SECRET` — Secret for express-session
- `REPL_ID` — Replit environment identifier (set automatically on Replit)
- `ISSUER_URL` — OIDC issuer URL (defaults to `https://replit.com/oidc`)
- `AI_INTEGRATIONS_OPENAI_API_KEY` — OpenAI API key (via Replit AI Integrations)
- `AI_INTEGRATIONS_OPENAI_BASE_URL` — OpenAI base URL (via Replit AI Integrations)
- `AI_INTEGRATIONS_ANTHROPIC_API_KEY` — Anthropic API key (via Replit AI Integrations)
- `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` — Anthropic base URL (via Replit AI Integrations)
- `AI_INTEGRATIONS_GEMINI_API_KEY` — Gemini API key (via Replit AI Integrations)
- `AI_INTEGRATIONS_GEMINI_BASE_URL` — Gemini base URL (via Replit AI Integrations)

### Services
- **PostgreSQL** — Primary data store for users, sessions, queries, and model responses
- **Replit Auth (OIDC)** — Authentication provider
- **OpenAI API** — GPT orchestration and image generation
- **Anthropic API** — Claude for technical analysis
- **Google Gemini API** — Creative and multimodal responses

### Key npm Packages
- `drizzle-orm` + `drizzle-kit` — Database ORM and schema management
- `express` + `express-session` — HTTP server and session handling
- `passport` + `openid-client` — OIDC authentication
- `connect-pg-simple` — PostgreSQL session store
- `@tanstack/react-query` — Client-side data fetching
- `wouter` — Client-side routing
- `framer-motion` — Animations
- `zod` — Schema validation (shared between client and server)
- `shadcn/ui` components — Pre-built UI component library