# Environment Variables

## Vercel (Frontend - apps/web)

| Variable | Required | Description |
|----------|----------|-------------|
| `BACKEND_URL` | Yes | URL of the FastAPI backend (e.g., `https://api.bonimbait.com`) |
| `NEXT_PUBLIC_SITE_URL` | Yes | Public URL of the site (e.g., `https://bonimbait.com`) |
| `NEXT_PUBLIC_CALENDLY_URL` | No | Calendly scheduling link for consultation booking |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | No | WhatsApp number for contact widget |
| `GOOGLE_CLIENT_ID` | No | Google OAuth client ID (for admin auth) |
| `GOOGLE_CLIENT_SECRET` | No | Google OAuth client secret |
| `NEXTAUTH_SECRET` | No | NextAuth.js secret for session encryption |
| `ADMIN_EMAILS` | No | Comma-separated list of admin email addresses |

### Content Autopilot (apps/web, see docs/platform/AUTOPILOT.md)

| Variable | Required | Description |
|----------|----------|-------------|
| `CRON_SECRET` | Yes (for the cron) | Bearer secret for `/api/cron/youtube-watch`; Vercel Cron sends it automatically |
| `YOUTUBE_CHANNEL_ID` | No | Channel to watch (default: the בונים בית channel) |
| `PODCAST_RSS_URL` | No | Podcast RSS feed to watch too |
| `AUTOPILOT_AUTO_PROCESS` | No | `true`: the cron also processes new videos (never publishes). Default `false` |
| `AUTOPILOT_AUTO_PROCESS_LIMIT` | No | Videos per cron run, 1-5 (default 1) |
| `AUTOPILOT_MAX_USD_PER_VIDEO` | No | Budget gate per processing run, USD (default 0.10) |
| `AUTOPILOT_MONTHLY_BUDGET_USD` | No | Budget gate per rolling 30 days, USD (default 2) |
| `AUTOPILOT_AUDIO_TRANSCRIPTION` | No | `true` enables OpenAI transcription of uploaded audio |
| `AUTOPILOT_SEARCH` | No | `off` disables runtime search fusion (kill switch) |
| `AUTOPILOT_SEARCH_TIMEOUT_MS` | No | Hard cap for the knowledge-store query in search (default 800) |

Also uses `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY` and `ANTHROPIC_API_KEY`.

## Render (Backend - apps/api)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string (Supabase) |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for Claude-based AI answers |
| `OPENAI_API_KEY` | Yes | OpenAI API key for embeddings (text-embedding-3-small) |
| `CORS_ORIGINS` | Yes | Allowed CORS origins, comma-separated (e.g., `https://bonimbait.com,http://localhost:3000`) |

## Local Development (.env.local)

Create `apps/web/.env.local`:

```env
BACKEND_URL=http://localhost:8000
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Create `apps/api/.env`:

```env
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/bonimbait
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
CORS_ORIGINS=http://localhost:3000
APP_VERSION=dev
```

## Notes

- Never commit `.env` files to version control.
- On Vercel, set environment variables in **Settings > Environment Variables**.
- On Render, set environment variables in the service's **Environment** tab.
- `NEXT_PUBLIC_` prefixed variables are exposed to the browser; do not use this prefix for secrets.
