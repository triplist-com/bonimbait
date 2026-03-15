# Bonimbait - Construction Knowledge Base

## Project Overview
Hebrew RTL knowledge base website (bonimbait.com) that aggregates ~900 YouTube videos about private home construction in Israel. The platform provides searchable, categorized, AI-summarized content so homebuilders can quickly find tips, costs, labor prices, construction rules, and best practices.

## Domain
- **Production**: bonimbait.com (GoDaddy)
- **Language**: Hebrew (RTL)
- **Target audience**: Individuals building private homes in Israel

## Architecture

### Tech Stack
- **Frontend**: Next.js 14+ (App Router), TypeScript, Tailwind CSS, RTL-first design
- **Backend**: Next.js API Routes + Python FastAPI microservice (for NLP/search)
- **Database**: PostgreSQL (Supabase) for structured data, pgvector for embeddings
- **Search**: pgvector semantic search + PostgreSQL full-text search (Hebrew)
- **AI/NLP**: Claude API for summarization, OpenAI Whisper for transcription, text-embedding-3-small for embeddings
- **Infrastructure**: Vercel (frontend), Railway/Fly.io (Python API), Supabase (DB)
- **CDN/Storage**: Supabase Storage for thumbnails/assets

### Data Pipeline
1. **Extraction**: yt-dlp to get video metadata + subtitles/audio from YouTube channel
2. **Transcription**: Whisper (large-v3) for Hebrew speech-to-text (for videos without good subtitles)
3. **Processing**: Claude API to summarize, extract key topics, costs, rules, and tag categories
4. **Embedding**: Generate vector embeddings for each video segment
5. **Indexing**: Store in PostgreSQL with pgvector for semantic search

### Project Structure
```
bonimbayit/
├── CLAUDE.md                    # This file
├── .claude/
│   ├── skills/                  # Agent skills for orchestration
│   └── settings.json
├── apps/
│   ├── web/                     # Next.js frontend
│   │   ├── app/                 # App router pages
│   │   ├── components/          # React components
│   │   ├── lib/                 # Utilities, API clients
│   │   └── public/              # Static assets
│   └── api/                     # Python FastAPI service
│       ├── routers/             # API endpoints
│       ├── services/            # Business logic
│       ├── models/              # DB models
│       └── pipeline/            # Data processing pipeline
├── packages/
│   └── shared/                  # Shared types/constants
├── scripts/                     # Data pipeline scripts
│   ├── extract/                 # YouTube extraction
│   ├── transcribe/              # Whisper transcription
│   ├── summarize/               # Claude summarization
│   └── embed/                   # Embedding generation
├── data/                        # Local data (gitignored)
├── docs/                        # Architecture docs, sprint plans
│   └── sprints/                 # Sprint definitions
└── tests/                       # E2E and integration tests
```

## Coding Conventions

### General
- All code comments in English
- All user-facing text in Hebrew
- TypeScript strict mode enabled
- Python 3.11+ with type hints

### Frontend (Next.js)
- Use App Router (not Pages Router)
- Server Components by default, Client Components only when needed
- RTL-first: use `dir="rtl"` on root, logical CSS properties (margin-inline-start, not margin-left)
- Tailwind with RTL plugin
- Component naming: PascalCase (e.g., `VideoCard.tsx`)
- Use `next/font` for Hebrew font (e.g., Heebo or Assistant)

### Backend (Python)
- FastAPI with async endpoints
- SQLAlchemy 2.0+ async ORM
- Pydantic v2 for request/response models
- Alembic for migrations

### Database
- Table names: snake_case, plural (e.g., `videos`, `video_segments`)
- Use UUIDs for primary keys
- All timestamps in UTC with timezone

### Git
- Branch naming: `feature/`, `fix/`, `data/`, `infra/`
- Commit messages in English, conventional commits style
- PR required for main branch

## Key Commands
```bash
# Frontend
cd apps/web && npm run dev          # Start Next.js dev server
cd apps/web && npm run build        # Build for production
cd apps/web && npm run lint         # Lint frontend

# Backend
cd apps/api && uvicorn main:app --reload  # Start FastAPI dev
cd apps/api && pytest                     # Run API tests

# Data Pipeline
python scripts/extract/fetch_channel.py   # Fetch YouTube metadata
python scripts/transcribe/run.py          # Transcribe videos
python scripts/summarize/run.py           # Generate summaries
python scripts/embed/run.py               # Generate embeddings

# Database
cd apps/api && alembic upgrade head       # Run migrations
```

## Environment Variables (see .env.example)
- `DATABASE_URL` - PostgreSQL connection string
- `ANTHROPIC_API_KEY` - For Claude summarization
- `OPENAI_API_KEY` - For Whisper + embeddings
- `YOUTUBE_CHANNEL_ID` - Target channel ID
- `NEXT_PUBLIC_API_URL` - Python API URL

## Agent Orchestration
This project uses a multi-agent approach where specialized agents handle different domains. The orchestrator agent manages context and delegates to:
- **Architect Agent**: System design, tech decisions, DB schema
- **Frontend Agent**: Next.js components, pages, RTL styling
- **Backend Agent**: API endpoints, business logic, auth
- **Data Pipeline Agent**: YouTube extraction, transcription, NLP
- **QA Agent**: Testing, validation, accessibility
- **UX Agent**: Design system, responsive layout, Hebrew typography

See `.claude/skills/` for agent skill definitions.
