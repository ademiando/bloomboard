# Bloomboard — Final (Production-ready starter)

This repository is a **production-ready** starter for *Bloomboard* — a premium portfolio tracker and trading lab.
It includes:
- Landing page (marketing) and Dashboard (app) routes
- TradingView Advanced Chart embed (official widget)
- Supabase integration for per-device portfolios (no-login flow)
- News API proxy route and OpenAI proxy for AI chat/code generation
- Finnhub WebSocket guidance for realtime quotes
- Full README, LICENSE, and SQL for Supabase schema

> You must provide your own API keys (OpenAI, Supabase, Finnhub/News) in Vercel envs before deploying.

## Quick deploy (Vercel)
1. Upload this repo to GitHub.
2. In Vercel, import project.
3. Add Environment Variables (for both Production & Preview):
   - NEXT_PUBLIC_SUPABASE_URL
   - NEXT_PUBLIC_SUPABASE_ANON_KEY
   - FINNHUB_API_KEY
   - NEWS_API_KEY
   - OPENAI_API_KEY
   - NEXT_PUBLIC_SITE_URL (e.g., https://yourdomain.com)
4. Deploy.

## Supabase setup
Run this SQL in the Supabase SQL editor to create the `portfolios` table:

```sql
create extension if not exists "pgcrypto";

create table if not exists public.portfolios (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  data jsonb not null,
  updated_at timestamp with time zone default now()
);
create index if not exists on public.portfolios (device_id);
```

Add simple RLS policies for no-login device-based access (adjust for production security). See README in `/supabase/` for policies.

## Notes
- TradingView widget provides the interactive chart UI; price math uses Finnhub (or other provider).
- This repo is modular: edit components in `/components`, API routes in `/app/api`.
- Replace `public/logo.svg` with your brand logo for final branding.


eNoPALmg0pmRNZJm
