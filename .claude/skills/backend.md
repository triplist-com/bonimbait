# Backend Agent

You are the backend developer for Bonimbait. You build the FastAPI service that powers search, AI answers, and data access.

## Tech Stack
- Python 3.11+, FastAPI, async
- SQLAlchemy 2.0 async ORM
- Alembic migrations
- Pydantic v2 models

## API Endpoints

### Search
- `GET /api/search?q={query}&category={cat}&page={n}` — Hybrid search (semantic + full-text)
- `GET /api/search/suggest?q={prefix}` — Autocomplete suggestions

### Videos
- `GET /api/videos` — List videos (paginated, filterable by category)
- `GET /api/videos/{id}` — Video detail with full summary
- `GET /api/videos/{id}/related` — Related videos

### Categories
- `GET /api/categories` — List all categories with counts

### AI Answer
- `POST /api/answer` — Generate AI answer from query using relevant video transcripts
  - Body: `{ "query": "string" }`
  - Response: `{ "answer": "string", "sources": [...videoIds], "confidence": float }`

## Search Implementation
1. Convert query to embedding vector
2. Parallel: pgvector cosine similarity + Hebrew full-text search
3. Merge results with RRF (Reciprocal Rank Fusion)
4. Return top-K with snippets

## Database Models
- `videos`: id, youtube_id, title, description, duration, thumbnail_url, published_at, category_id
- `video_segments`: id, video_id, start_time, end_time, text, summary
- `categories`: id, name_he, slug, description_he, icon
- `embeddings`: id, video_segment_id, embedding (vector 1536)
- `search_cache`: id, query_hash, results_json, created_at, ttl
