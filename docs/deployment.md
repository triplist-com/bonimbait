# Bonimbait Deployment Guide

## Overview

The Bonimbait stack consists of three main components:

| Component | Technology | Hosting | Before |
|-----------|-----------|---------|--------|
| Web app (pages, search, AI answers, admin) | Next.js 14 | Render: web service `bonimbait-web` + cron `bonimbait-youtube-watch` | Vercel, until 2026-11-08 |
| Database and media | PostgreSQL + pgvector, Storage | Supabase (Frankfurt) | |
| API (legacy, suspended) | Python FastAPI | Render (Docker), `bonimbait-api` | Fly.io / Railway |

Search and AI answers run inside the Next.js app; the FastAPI service is not used.

---

## 1. Supabase Setup

### Create Project

1. Go to [Supabase Dashboard](https://supabase.com/dashboard).
2. Create a new project in the **Frankfurt (eu-central-1)** region.
3. Note the project password and connection string.

### Enable pgvector

In the SQL Editor, run:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### Get Connection String

Go to **Settings > Database > Connection string > URI** and copy the connection string. Replace `[YOUR-PASSWORD]` with the project password.

For the async Python driver, use:

```
postgresql+asyncpg://postgres.[ref]:[password]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres
```

### Run Migrations

```bash
export DATABASE_URL="postgresql+asyncpg://..."
cd apps/api
alembic upgrade head
```

Or use the migration script:

```bash
python scripts/deploy/migrate_production.py
```

---

## 2. API Deployment (Fly.io)

### Install flyctl

```bash
curl -L https://fly.io/install.sh | sh
flyctl auth login
```

### First-time Setup

```bash
cd apps/api
flyctl launch --no-deploy --name bonimbait-api --region fra
```

### Set Secrets

```bash
flyctl secrets set \
  DATABASE_URL="postgresql+asyncpg://..." \
  ANTHROPIC_API_KEY="sk-ant-..." \
  OPENAI_API_KEY="sk-..." \
  CORS_ORIGINS="https://bonimbait.com,https://www.bonimbait.com" \
  ENV=production
```

### Deploy

```bash
flyctl deploy
```

### Verify

```bash
flyctl status
curl https://bonimbait-api.fly.dev/health
```

### Scaling

```bash
# Scale memory (default 256MB, increase if needed)
flyctl scale memory 512

# Scale VM count
flyctl scale count 2
```

---

## 2b. API Deployment (Railway) - Alternative

### Install CLI

```bash
npm install -g @railway/cli
railway login
```

### Deploy

```bash
cd apps/api
railway init
railway up
```

### Set Environment Variables

Use the Railway dashboard or CLI:

```bash
railway variables set DATABASE_URL="postgresql+asyncpg://..."
railway variables set ANTHROPIC_API_KEY="sk-ant-..."
railway variables set OPENAI_API_KEY="sk-..."
railway variables set CORS_ORIGINS="https://bonimbait.com,https://www.bonimbait.com"
railway variables set ENV=production
```

---

## 3. Web App Deployment (Render)

The app runs in the Render project **Bonimbait** (environment *Production*), in the workspace that also
runs triplist.pro. Both services were created through the Render API, not the `render.yaml` Blueprint
(see the note at the top of `render.yaml`).

### Web service `bonimbait-web`

| Setting | Value |
|---|---|
| Repo / branch | `triplist-com/bonimbait`, `main`, auto-deploy on every push |
| Root directory | `apps/web` |
| Runtime / plan / region | Node (`NODE_VERSION=22`), Starter (512 MB), Frankfurt |
| Build command | `npm ci --include=dev && npm run build` |
| Start command | `npm run start -- -p $PORT` |
| Health check | `/api/health` |
| URL | https://bonimbait-web.onrender.com, and the custom domains in section 4 |

Production follows `main`: merge a PR and Render builds and deploys it (about 4–5 minutes). To roll
back, redeploy an earlier deploy from the service's **Events** page.

Memory: the server holds the search indexes (`apps/web/data/*-index.*`) in memory, about 230–370 MB in
use. If it nears the 512 MB limit, move the service to Standard.

### Environment

The service's **Environment** tab holds the production variables (`docs/ENV_VARS.md` lists them). When
the site moved from Vercel, five signing secrets were regenerated and now exist only on Render:
`ADVISOR_SHARE_SECRET`, `CRON_SECRET`, `LEAD_IP_SALT`, `REDIRECT_REFRESH_SECRET` and
`REVENUE_TOKEN_SECRET`. (Vercel never returns values marked "sensitive".)

Render sets `RENDER=true` itself. `lib/deploy.ts` reads it, so mock payments are refused on Render, as
they were on Vercel, unless `PAYMENT_ALLOW_MOCK_IN_PRODUCTION=true`. On Render the client IP is
taken from `True-Client-IP` / `CF-Connecting-IP`.

### Cron job `bonimbait-youtube-watch`

Daily at 06:00 UTC (09:00 Israel). It has no build; it calls the web service with the shared secret:

```bash
curl -fsS --max-time 120 -H "Authorization: Bearer $CRON_SECRET" https://bonimbait-web.onrender.com/api/cron/youtube-watch
```

`CRON_SECRET` must match on both services. If you change it on one, change it on the other.

---

## 4. DNS Configuration (GoDaddy)

| Type  | Name | Value                        | TTL  |
|-------|------|------------------------------|------|
| A     | @    | 216.24.57.1                  | 600  |
| CNAME | www  | bonimbait-web.onrender.com   | 3600 |

`www.bonimbait.com` redirects (301) to `bonimbait.com`. Details and checks: `docs/DNS_SETUP.md`.

---

## 5. SSL Certificates

SSL is **automatic**:

- **Render**: Issues and renews certificates for `bonimbait.com` and `www` automatically (Google Trust Services).
- **Fly.io**: Provisions certificates automatically when a custom domain is added.
- **Supabase**: Connections are encrypted by default.

No manual SSL configuration is needed.

---

## 6. Data Pipeline on Production

After deploying the API and database, populate the production data:

### Full Pipeline

```bash
export DATABASE_URL="postgresql+asyncpg://..."
python scripts/run_pipeline.py
```

### Individual Steps

```bash
# 1. Extract video metadata from YouTube
python scripts/extract/fetch_channel.py

# 2. Transcribe videos (requires OPENAI_API_KEY)
python scripts/transcribe/run.py

# 3. Summarize with Claude (requires ANTHROPIC_API_KEY)
python scripts/summarize/run.py

# 4. Generate embeddings (requires OPENAI_API_KEY)
python scripts/embed/run.py

# 5. Load into database
python scripts/load/run.py
```

### Build Indexes

After loading data, ensure vector indexes exist:

```sql
CREATE INDEX IF NOT EXISTS idx_video_segments_embedding
ON video_segments USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

---

## 7. Monitoring

### Web app (Render)

- **Logs, events and deploys**: the `bonimbait-web` service in the Render dashboard.
- **Metrics**: CPU and memory on the service's **Metrics** page; watch memory against the 512 MB limit.
- **Cron**: each run's log is on the `bonimbait-youtube-watch` job.
- **Health**: `curl https://bonimbait.com/api/health`.

### API (Fly.io)

```bash
# View logs
flyctl logs

# Check status
flyctl status

# Monitor metrics
flyctl dashboard
```

### Database (Supabase)

- **Supabase Dashboard**: Query performance, connection pool usage, storage.
- **pg_stat_statements**: Monitor slow queries.
- Enable **Database Webhooks** for alerting if needed.

---

## 8. Backup Strategy

### Supabase Automatic Backups

Supabase provides automatic daily backups:

- **Free tier**: 7-day retention.
- **Pro tier**: 30-day retention with point-in-time recovery.

### Manual Backup

```bash
# Using pg_dump (replace connection details)
pg_dump "postgresql://postgres.[ref]:[password]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres" \
  --format=custom \
  --file=backup_$(date +%Y%m%d).dump

# Restore
pg_restore --dbname="postgresql://..." backup_20260315.dump
```

### Scheduled Backup Script

Add to crontab for regular backups:

```bash
# Weekly backup every Sunday at 3 AM
0 3 * * 0 /path/to/scripts/deploy/backup.sh >> /var/log/bonimbait-backup.log 2>&1
```

---

## 9. Troubleshooting

### API Not Responding

```bash
flyctl status
flyctl logs --app bonimbait-api
```

### Database Connection Issues

- Check Supabase dashboard for connection pool limits.
- Verify `DATABASE_URL` format includes `+asyncpg` for the Python API.
- Ensure IP allowlist includes Fly.io egress IPs (or is set to allow all).

### Frontend Build Failures

- Check the deploy logs of `bonimbait-web` in Render.
- Verify `NEXT_PUBLIC_API_URL` is set correctly.
- Run `npm run build` locally to reproduce errors.

### Smoke Test Failures

```bash
python scripts/deploy/smoke_test.py --api-url https://bonimbait-api.onrender.com --web-url https://bonimbait.com
```

---

## 10. Deploying on Render (Primary)

Render is the primary deployment target. All services are defined in `render.yaml` (Render Blueprint) at the project root.

### Quick Deploy with Blueprint

1. Push the repository to GitHub.
2. Go to **Render Dashboard** → **New** → **Blueprint**.
3. Connect your GitHub repo — Render auto-detects `render.yaml`.
4. Set secret environment variables in the dashboard:
   - `ANTHROPIC_API_KEY`
   - `OPENAI_API_KEY`
5. Click **Apply** to provision all services.

Render will create:
- **bonimbait-web** — Next.js frontend (Node web service)
- **bonimbait-api** — FastAPI backend (Docker web service)
- **bonimbait-db** — PostgreSQL 16 database (Starter plan)

### Manual Deploy (Step by Step)

If you prefer to set up services individually:

#### 1. Create PostgreSQL Database

- Go to **Render Dashboard** → **New** → **PostgreSQL**.
- Name: `bonimbait-db`
- Region: Frankfurt
- Plan: Starter (required for pgvector support)
- PostgreSQL version: 16
- Copy the **Internal Connection String** and **External Connection String**.

#### 2. Enable pgvector

Connect to the database and run:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

You can connect via:
- Render Shell (from the database dashboard)
- `psql` with the external connection string
- Any PostgreSQL client (e.g. pgAdmin, DBeaver)

#### 3. Create Web Service for API

- **New** → **Web Service**
- Connect GitHub repo
- Name: `bonimbait-api`
- Region: Frankfurt
- Runtime: Docker
- Root directory: `apps/api`
- Set environment variables:
  - `DATABASE_URL` → paste the Internal Connection String from the database
  - `ANTHROPIC_API_KEY` → your key
  - `OPENAI_API_KEY` → your key
  - `CORS_ORIGINS` → `https://bonimbait.com,https://www.bonimbait.com`
  - `ENV` → `production`
- Health check path: `/health`

#### 4. Create Web Service for Frontend

- **New** → **Web Service**
- Connect GitHub repo
- Name: `bonimbait-web`
- Region: Frankfurt
- Runtime: Node
- Root directory: `apps/web`
- Build command: `npm install && npm run build`
- Start command: `npx next start -p $PORT`
- Set environment variables:
  - `NEXT_PUBLIC_API_URL` → `https://bonimbait-api.onrender.com`
  - `NEXT_PUBLIC_SITE_URL` → `https://bonimbait.com`
  - `NODE_ENV` → `production`

#### 5. Add Custom Domain

In the **bonimbait-web** service settings → **Custom Domains** → add `bonimbait.com` and `www.bonimbait.com`.

### Database Setup

After the database is provisioned:

```bash
# 1. Enable pgvector
psql "$EXTERNAL_DATABASE_URL" -c "CREATE EXTENSION IF NOT EXISTS vector;"

# 2. Run Alembic migrations
export DATABASE_URL="<internal-connection-string>"
cd apps/api && alembic upgrade head

# Or use the migration script:
python scripts/deploy/migrate_production.py

# 3. Run the data pipeline to populate content
python scripts/run_pipeline.py
```

### Custom Domain (GoDaddy to Render)

1. In **Render**: go to the bonimbait-web service → **Custom Domains** → add `bonimbait.com`.
2. Render provides the DNS target values.
3. In **GoDaddy** DNS management:

| Type  | Name | Value                          | TTL  |
|-------|------|--------------------------------|------|
| CNAME | www  | (provided by Render)           | 3600 |
| A     | @    | (provided by Render)           | 600  |

   - For the root domain (`@`), Render may provide an A record IP or a CNAME flattening target.
   - For `www`, use the CNAME value Render provides.

4. Render handles **SSL certificates automatically** (Let's Encrypt).
5. DNS propagation may take up to 48 hours (usually under 1 hour).

### pgvector on Render

- Render PostgreSQL supports pgvector on **Starter plan and above**.
- After the database is created, connect and run:
  ```sql
  CREATE EXTENSION IF NOT EXISTS vector;
  ```
- To verify: `SELECT * FROM pg_extension WHERE extname = 'vector';`
- **Alternative**: use Supabase as an external database (pgvector included on all plans, including free tier). In that case, remove the `databases` block from `render.yaml` and set `DATABASE_URL` manually as a secret env var.

### Render Monitoring

- **Dashboard**: each service has logs, metrics, and deploy history.
- **Health checks**: the API service has `/health` configured — Render will restart if it fails.
- **Auto-deploy**: Render redeploys automatically on push to the connected branch.
- **Manual deploy**: trigger from the dashboard or via the Render API.

### Render-Specific Notes

- Render provides a `PORT` environment variable at runtime. The Dockerfile and Next.js start command are configured to respect it.
- Render's free plan services spin down after inactivity. Use the **Starter plan** or above for always-on services.
- Service-to-service communication uses the external URL (`https://bonimbait-api.onrender.com`). Render does not currently offer private networking between web services on all plans.
