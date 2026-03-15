# Bonimbait Sprint Plan

Each sprint is scoped to fit within a single Opus 4.6 context window (~200K tokens of productive work). The orchestrator agent manages handoffs between sprints.

---

## Sprint 0: Project Bootstrap & Infrastructure
**Lead**: Architect + Orchestrator
**Goal**: Set up the monorepo, dev environment, database, and CI

### Tasks
1. Initialize Next.js app in `apps/web/` with TypeScript, Tailwind, RTL config
2. Initialize Python FastAPI app in `apps/api/` with Poetry/uv
3. Set up Supabase project: PostgreSQL + pgvector extension
4. Create database schema and initial Alembic migration
5. Set up `.env.example` with all required variables
6. Create `docker-compose.yml` for local development (PostgreSQL)
7. Set up ESLint, Prettier (frontend), Ruff (backend)
8. Create GitHub repo and branch protection rules

### Deliverables
- [ ] Working Next.js dev server with RTL Hebrew page
- [ ] Working FastAPI dev server with health endpoint
- [ ] PostgreSQL with pgvector running locally
- [ ] Database schema migrated
- [ ] CI lint checks passing

### Agent Assignments
| Agent | Tasks |
|-------|-------|
| Architect | Schema design, docker-compose, infra decisions |
| Frontend | Next.js init, Tailwind RTL config, base layout |
| Backend | FastAPI init, Alembic setup, health endpoint |
| QA | Lint configs, CI setup |

---

## Sprint 1: Data Pipeline — Extraction & Transcription
**Lead**: Data Pipeline Agent
**Goal**: Extract all 900 video metadata and transcribe content

### Tasks
1. Write `scripts/extract/fetch_channel.py` — fetch all video metadata via yt-dlp
2. Write `scripts/extract/download_subs.py` — download available Hebrew subtitles
3. Write `scripts/transcribe/run.py` — Whisper transcription for videos without subs
4. Write `scripts/transcribe/segment.py` — split transcripts into logical chunks
5. Create checkpoint/resume mechanism for batch processing
6. Run extraction on the full channel (output to `data/raw/`)
7. Process transcription in batches of 50

### Deliverables
- [ ] Metadata for all 900 videos in `data/raw/metadata/`
- [ ] Hebrew transcripts for all videos (subtitles or Whisper)
- [ ] Transcripts segmented into searchable chunks
- [ ] Pipeline state tracking with resume capability

### Agent Assignments
| Agent | Tasks |
|-------|-------|
| Data Pipeline | All extraction and transcription scripts |
| Architect | Data format decisions, storage structure |
| QA | Validate transcript quality on sample set |

---

## Sprint 2: Data Pipeline — Summarization & Categorization
**Lead**: Data Pipeline Agent + NLP
**Goal**: AI-summarize all videos and auto-categorize

### Tasks
1. Define category taxonomy (construction phases, costs, legal, materials, etc.)
2. Write `scripts/summarize/run.py` — Claude summarization per video
3. Extract structured data: costs/prices, rules, tips, materials
4. Auto-categorize videos into taxonomy
5. Write `scripts/summarize/validate.py` — quality checks on summaries
6. Process all 900 videos in batches

### Category Taxonomy (initial)
- תכנון ורישוי (Planning & Permits)
- עלויות ומחירים (Costs & Prices)
- שלד ובנייה (Structure & Construction)
- חשמל ואינסטלציה (Electrical & Plumbing)
- גמרים ועיצוב (Finishes & Design)
- קבלנים ועבודה (Contractors & Labor)
- חוקים ותקנות (Laws & Regulations)
- טיפים כלליים (General Tips)
- בידוד ואיטום (Insulation & Waterproofing)
- גינון וחצר (Landscaping & Yard)

### Deliverables
- [ ] Structured summaries for all 900 videos
- [ ] Category assignments
- [ ] Extracted costs/prices with context
- [ ] Quality validation report

### Agent Assignments
| Agent | Tasks |
|-------|-------|
| Data Pipeline | Summarization scripts, batch processing |
| Architect | Category taxonomy, structured data schema |
| QA | Summary quality validation |

---

## Sprint 3: Data Pipeline — Embeddings & Database Loading
**Lead**: Data Pipeline Agent + Backend
**Goal**: Generate embeddings and load all data into PostgreSQL

### Tasks
1. Write `scripts/embed/run.py` — generate embeddings for all segments
2. Write `scripts/load/load_db.py` — bulk insert into PostgreSQL
3. Build Hebrew full-text search indexes
4. Build pgvector indexes (IVFFlat or HNSW)
5. Validate data integrity after loading
6. Create seed script for development (subset of 50 videos)

### Deliverables
- [ ] All embeddings generated and stored
- [ ] Full database populated with 900 videos
- [ ] Search indexes built and tested
- [ ] Dev seed script working

### Agent Assignments
| Agent | Tasks |
|-------|-------|
| Data Pipeline | Embedding generation, bulk loading |
| Backend | DB loading script, index creation |
| Architect | Index strategy (HNSW vs IVFFlat), search tuning |
| QA | Data integrity validation |

---

## Sprint 4: Backend API — Search & Video Endpoints
**Lead**: Backend Agent
**Goal**: Build all API endpoints for search and video access

### Tasks
1. Implement hybrid search endpoint (semantic + full-text)
2. Implement video list endpoint with pagination and filtering
3. Implement video detail endpoint
4. Implement category list endpoint
5. Implement autocomplete/suggest endpoint
6. Add response caching layer
7. Write API tests

### Deliverables
- [ ] All API endpoints working and tested
- [ ] Hybrid search returning relevant results
- [ ] Pagination and category filtering working
- [ ] API response times < 200ms (cached), < 1s (uncached search)

### Agent Assignments
| Agent | Tasks |
|-------|-------|
| Backend | All API implementation |
| Architect | Search ranking algorithm, caching strategy |
| QA | API tests, search quality benchmarks |

---

## Sprint 5: AI Answer Generation
**Lead**: Backend Agent + Data Pipeline
**Goal**: Build the AI-powered answer generation feature

### Tasks
1. Implement RAG pipeline: query → retrieve relevant segments → generate answer
2. Use Claude API to generate Hebrew answers with source citations
3. Add streaming support for answer generation
4. Implement answer caching for common queries
5. Add confidence scoring
6. Write quality tests with sample queries

### Deliverables
- [ ] `/api/answer` endpoint working with streaming
- [ ] Answers cite specific videos and timestamps
- [ ] Answer quality validated on 20+ test queries
- [ ] Caching for repeated queries

### Agent Assignments
| Agent | Tasks |
|-------|-------|
| Backend | RAG pipeline, streaming endpoint |
| Data Pipeline | Retrieval optimization, prompt engineering |
| QA | Answer quality testing |

---

## Sprint 6: Frontend — Design System & Layout
**Lead**: Frontend Agent + UX Designer
**Goal**: Build the design system, base layout, and core components

### Tasks
1. Configure Tailwind theme with design tokens (colors, typography, spacing)
2. Set up Heebo font with next/font
3. Build RTL base layout (header, footer, main content area)
4. Build SearchBar component
5. Build CategoryChip + CategoryBar (horizontal scroll)
6. Build VideoCard component
7. Build VideoGrid component (responsive)
8. Build loading skeletons for all components
9. Create Storybook or component preview page

### Deliverables
- [ ] Complete design system in Tailwind config
- [ ] All core components built and visually correct in RTL
- [ ] Responsive layout working on mobile/tablet/desktop
- [ ] Component preview page for visual verification

### Agent Assignments
| Agent | Tasks |
|-------|-------|
| Frontend | All component implementation |
| UX Designer | Design tokens, component specs, visual review |
| QA | RTL testing, responsive testing |

---

## Sprint 7: Frontend — Pages & API Integration
**Lead**: Frontend Agent
**Goal**: Build all pages and connect to the backend API

### Tasks
1. Build Homepage: search bar, categories, featured/recent videos grid
2. Build Search Results page: AI answer panel + video results
3. Build Video Detail page: summary, key points, cost table, related videos, embedded YouTube player
4. Build Category page: filtered video grid
5. Implement API client (`apps/web/lib/api.ts`)
6. Add loading states, error states, empty states
7. Implement URL-based search (query params)
8. Add pagination (infinite scroll or load more)

### Deliverables
- [ ] All pages functional with real data
- [ ] Search works end-to-end (type query → see AI answer + results)
- [ ] Video detail shows full summary with YouTube embed
- [ ] Category filtering works
- [ ] Good loading/error UX

### Agent Assignments
| Agent | Tasks |
|-------|-------|
| Frontend | All page implementation, API integration |
| Backend | Any API adjustments needed |
| UX Designer | Page layout review, interaction patterns |
| QA | E2E testing of user flows |

---

## Sprint 8: Polish, SEO & Performance
**Lead**: Frontend Agent + QA
**Goal**: Production-ready quality, SEO, and performance optimization

### Tasks
1. Add meta tags, Open Graph, structured data (Schema.org)
2. Generate sitemap.xml for all video pages
3. Add Hebrew SEO: meta descriptions, page titles
4. Optimize images (thumbnails via next/image)
5. Add analytics (Plausible or Google Analytics)
6. Performance audit and optimization (Lighthouse > 90)
7. Accessibility audit (screen reader, keyboard nav)
8. Error monitoring setup (Sentry)
9. Favicon, social preview images

### Deliverables
- [ ] Lighthouse scores > 90 across all metrics
- [ ] SEO metadata on all pages
- [ ] Sitemap generated
- [ ] Analytics tracking
- [ ] Error monitoring active
- [ ] Accessibility audit passed

### Agent Assignments
| Agent | Tasks |
|-------|-------|
| Frontend | SEO, performance optimization, analytics |
| QA | Full audit (accessibility, performance, cross-browser) |
| UX Designer | Final visual review |

---

## Sprint 9: Deployment & Launch
**Lead**: Architect + Orchestrator
**Goal**: Deploy to production and launch

### Tasks
1. Deploy Next.js to Vercel, configure custom domain (bonimbait.com)
2. Deploy FastAPI to Railway/Fly.io
3. Configure production Supabase database
4. Run full data pipeline on production DB
5. Set up SSL, DNS (GoDaddy → Vercel)
6. Load testing
7. Set up monitoring dashboards
8. Create backup strategy
9. Smoke test all features on production
10. Launch!

### Deliverables
- [ ] bonimbait.com live and serving traffic
- [ ] All 900 videos searchable
- [ ] AI answers working
- [ ] Monitoring and alerting active
- [ ] Backup strategy in place

### Agent Assignments
| Agent | Tasks |
|-------|-------|
| Architect | Infrastructure setup, DNS, SSL |
| Backend | Production deployment, data loading |
| Frontend | Vercel deployment, domain config |
| QA | Production smoke tests, load testing |

---

## Post-Launch Sprints (Future)

### Sprint 10+: Incremental Improvements
- User accounts and saved searches
- New video auto-ingestion (watch channel for new uploads)
- Cost comparison tool
- Construction timeline planner
- Community features (comments, ratings)
- Mobile app (React Native)
- WhatsApp bot integration
