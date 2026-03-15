# Bonimbait Deployment Guide

## Overview

The Bonimbait stack consists of three main components:

| Component | Technology | Hosting |
|-----------|-----------|---------|
| Frontend  | Next.js 14 | Vercel |
| API       | Python FastAPI | Fly.io or Railway |
| Database  | PostgreSQL + pgvector | Supabase |

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

## 3. Frontend Deployment (Vercel)

### Option A: Connect GitHub (Recommended)

1. Go to [Vercel Dashboard](https://vercel.com/dashboard).
2. Import the repository.
3. Set root directory to `apps/web`.
4. Vercel auto-detects Next.js.
5. Set environment variables:
   - `NEXT_PUBLIC_API_URL` = `https://bonimbait-api.fly.dev`
   - `NEXT_PUBLIC_SITE_URL` = `https://bonimbait.com`
   - `NEXT_PUBLIC_GA_ID` = `G-XXXXXXX` (if applicable)

### Option B: CLI Deploy

```bash
cd apps/web
vercel --prod
```

### Custom Domain

In Vercel project settings, add `bonimbait.com` as a custom domain.

---

## 4. DNS Configuration (GoDaddy)

### Option A: Point Records to Vercel

Log into GoDaddy DNS management for `bonimbait.com` and set:

| Type  | Name | Value                  | TTL  |
|-------|------|------------------------|------|
| A     | @    | 76.76.21.21            | 600  |
| CNAME | www  | cname.vercel-dns.com   | 3600 |

### Option B: Transfer Nameservers to Vercel

1. In Vercel, add the domain and select "Use Vercel Nameservers".
2. Copy the nameserver values provided by Vercel.
3. In GoDaddy, go to **Domain Settings > Nameservers > Change** and enter the Vercel nameservers.

DNS propagation may take up to 48 hours (usually under 1 hour).

---

## 5. SSL Certificates

SSL is **automatic**:

- **Vercel**: Provisions and renews Let's Encrypt certificates automatically.
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

### Frontend (Vercel)

- **Vercel Analytics**: Enable in project settings for Core Web Vitals.
- **Vercel Speed Insights**: Built-in performance monitoring.
- **Deployment logs**: Available in the Vercel dashboard.

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

- Check Vercel deployment logs.
- Verify `NEXT_PUBLIC_API_URL` is set correctly.
- Run `npm run build` locally to reproduce errors.

### Smoke Test Failures

```bash
python scripts/deploy/smoke_test.py --api-url https://bonimbait-api.fly.dev --web-url https://bonimbait.com
```
