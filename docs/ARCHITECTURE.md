# Technical Architecture

## System Overview

```
                    bonimbait.com (GoDaddy DNS)
                           |
                    +------+------+
                    |   Render    |
                    |  (Frontend) |
                    |  Next.js 14 |
                    +------+------+
                           |
                    +------+------+
                    |   Render    |
                    |  (Backend)  |
                    |   FastAPI   |
                    +------+------+
                           |
               +-----------+-----------+
               |                       |
        +------+------+        +------+------+
        |   Render    |        |   Supabase  |
        | PostgreSQL  |        |   Storage   |
        |  + pgvector |        | (thumbnails)|
        +-------------+        +-------------+
```

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS | SSR/SSG Hebrew RTL site |
| Backend | Python FastAPI (async) | Search, AI answers, data API |
| Database | PostgreSQL 16 + pgvector | Structured data + vector embeddings |
| ORM | SQLAlchemy 2.0 (async) | Database access |
| Migrations | Alembic | Schema versioning |
| AI Answers | Claude API (Anthropic) | RAG-based Hebrew answer generation |
| Transcription | OpenAI Whisper (large-v3) | Hebrew speech-to-text |
| Embeddings | text-embedding-3-small (OpenAI) | 1536-dim vectors for semantic search |
| Storage | Supabase Storage | Video thumbnails and static assets |

## Deployment (Render)

All three services run on Render, defined in `render.yaml` at the project root.

| Service | Type | Runtime | URL |
|---------|------|---------|-----|
| bonimbait-web | Web Service | Node | bonimbait.com |
| bonimbait-api | Web Service | Docker | bonimbait-api.onrender.com |
| bonimbait-db | PostgreSQL 16 | Managed | Internal connection |

DNS is managed via GoDaddy, pointed at Render. SSL is automatic (Let's Encrypt).

## Search Architecture

Hybrid search combining two strategies, merged with Reciprocal Rank Fusion (RRF):

```
User Query
    |
    +--> OpenAI embedding --> pgvector cosine similarity search
    |                              |
    +--> PostgreSQL tsvector --> Hebrew full-text search
                                   |
                          RRF rank fusion
                                   |
                          Top-K results returned
```

- **Semantic search**: Query embedded via text-embedding-3-small, matched against video segment embeddings using cosine distance (pgvector)
- **Full-text search**: PostgreSQL tsvector with Hebrew tokenization
- **Ranking**: RRF merges both result sets, balancing semantic relevance with keyword precision

## AI Answer Generation (RAG)

```
User Query
    |
    +--> Hybrid search (top segments)
    |
    +--> Build prompt with retrieved segments as context
    |
    +--> Claude API generates Hebrew answer with source citations
    |
    +--> SSE stream response to frontend
```

- Answers cite specific videos and timestamps
- Streaming via Server-Sent Events (SSE) for real-time UX
- Confidence scoring on generated answers

## Data Flow (Pipeline)

```
YouTube (@TomerChenRihana)
    |
    v
yt-dlp (metadata + subtitles)
    |
    v
Whisper large-v3 (transcription for videos without subs)
    |
    v
Claude API (summarization, categorization, cost extraction)
    |
    v
OpenAI text-embedding-3-small (vector embeddings)
    |
    v
PostgreSQL + pgvector (structured data + search indexes)
```

See `docs/DATA_PIPELINE.md` for detailed stage descriptions.

## Caching Strategy

| Cache | TTL | Purpose |
|-------|-----|---------|
| AI answer cache | 1 hour | Avoid re-generating answers for repeated queries |
| Search result cache | 5 minutes | Reduce DB load for popular searches |
| Cost wizard results | Daily | Pre-computed cost estimates |

Implemented as LRU caches in the FastAPI service layer (see `apps/api/services/cache.py` and `apps/api/services/answer_cache.py`).

## Database Schema

Core tables:

- **videos**: youtube_id, title, description, duration, thumbnail_url, published_at, category_id
- **video_segments**: video_id, start_time, end_time, text, summary
- **categories**: name_he, slug, description_he, icon
- **embeddings**: video_segment_id, embedding (vector 1536)
- **search_cache**: query_hash, results_json, created_at, ttl

All primary keys are UUIDs. All timestamps are UTC with timezone. Migrations managed by Alembic in `apps/api/alembic/`.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Health check |
| GET | /api/videos | List videos (paginated, filterable) |
| GET | /api/videos/{id} | Video detail with summary |
| GET | /api/categories | List categories with counts |
| GET | /api/search?q=...&category=... | Hybrid search |
| POST | /api/answer | AI answer generation (SSE streaming) |
| GET | /api/thumbnails/{id} | Serve video thumbnails |

## Frontend Architecture

- **App Router** (Next.js 14): Server Components by default, Client Components for interactivity
- **RTL-first**: `dir="rtl"` on root, logical CSS properties throughout
- **Font**: Heebo (Google Fonts via next/font)
- **Pages**: Homepage, Search Results, Video Detail, Category, About, Contact, Privacy, Terms

Key components in `apps/web/components/`: SearchBar, VideoCard, VideoGrid, CategoryChip, AiAnswer, CostTable.

## Infrastructure Diagram

```
[GoDaddy DNS] --> [Render CDN/Proxy]
                       |
              +--------+--------+
              |                 |
    [bonimbait-web]    [bonimbait-api]
     Next.js 14         FastAPI
     Node runtime       Docker
              |                 |
              |        +--------+--------+
              |        |                 |
              |  [Render PostgreSQL]  [External APIs]
              |   pgvector              - Claude API
              |                         - OpenAI API
              |
       [Supabase Storage]
        (thumbnails)
```
