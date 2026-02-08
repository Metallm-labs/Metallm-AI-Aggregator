# Metallm - Environment Setup

Simple guide to run this project locally.

## Prerequisites
- Node.js 18+ and npm
- PostgreSQL database

## 1) Install dependencies
```bash
npm install
```

## 2) Configure environment variables
1. Copy the example file:
   ```bash
   cp .env.example .env
   ```
2. Update values in `.env` for your setup.

## 3) Push the database schema
```bash
npm run db:push
```

## 4) Start the dev server
```bash
npm run dev
```

App runs on the port shown in the terminal (Vite + Express).

## Useful scripts
- `npm run check` — TypeScript type check
- `npm run build` — Production build
- `npm start` — Run production build
