# Product Roadmap

## V1 — Static Knowledge Base (Current)

Live at bonimbait.com. Completed March 2026.

### Features
- 200+ videos loaded with AI-generated summaries
- In-memory search with category filtering
- Category browsing (10 construction topic categories)
- Video detail pages with summaries, key points, cost tables
- Embedded YouTube player on video pages
- RTL Hebrew design with responsive layout
- SEO: meta tags, Open Graph, sitemap, structured data
- Search-first homepage with hero section and popular questions

### Stack
- Next.js 14 frontend on Render
- FastAPI backend on Render (Docker)
- PostgreSQL 16 + pgvector on Render
- Supabase Storage for thumbnails

---

## V2 — AI Answer Engine & Cost Wizard (In Progress)

Defined in GitHub Issue #1 (PRD). Built across Sprints 0-9.

### Features

| Feature | Description | Status |
|---------|-------------|--------|
| AI Answer Engine | RAG-powered Hebrew answers with video source citations, SSE streaming | Backend done, frontend integrated |
| Hybrid Search | Semantic (pgvector) + full-text (tsvector) with RRF ranking | Done |
| Cost Estimation Wizard | Step-by-step form: home specs --> detailed cost breakdown | Planned |
| Admin Panel | Content management, pipeline triggers, analytics dashboard | Planned |
| Live API | All frontend pages served from live FastAPI backend | Done |
| Answer Caching | LRU cache with 1-hour TTL for repeated queries | Done |

### Cost Wizard Flow
```
User enters home specs (size, location, finish level)
    --> System queries relevant cost data from videos
        --> Generates itemized cost estimate
            --> CTA: "Get a professional review" (Calendly booking)
```

### Admin Panel (Planned)
- Video content management (edit summaries, recategorize)
- Pipeline dashboard (trigger re-processing, monitor status)
- Search analytics (popular queries, zero-result queries)
- Cost data management (update prices, set freshness rules)

---

## V3 — Platform Expansion (Future)

### Conversational Follow-up
- Multi-turn conversations: ask follow-up questions about a previous answer
- Conversation history per session
- Context-aware answers that reference previous Q&A

### User Accounts
- Save favorite videos and searches
- Personalized recommendations based on construction phase
- Project tracking (which topics the user has researched)

### Auto YouTube Ingest
- Webhook or polling to detect new video uploads
- Automatic pipeline: extract, transcribe, summarize, embed, load
- Notification to admin for review before publishing

### WhatsApp Bot
- Ask construction questions via WhatsApp
- Same RAG engine as the website
- Share video links and cost estimates in chat

### External Pricing Database
- Cross-reference video-sourced costs with external pricing data
- Ministry of Housing price index integration
- Contractor quote aggregation

### Community Features
- User-submitted tips and corrections
- Rating system for video helpfulness
- Construction professional directory

---

## Key Metrics

| Metric | Target | How Measured |
|--------|--------|-------------|
| Daily search queries | 100+ | API logs |
| AI answer satisfaction | >80% useful | Thumbs up/down on answers |
| Wizard completions | 20+ per week | Funnel analytics |
| Upsell conversion rate | >5% wizard-to-consultation | Calendly bookings / wizard completions |
| SEO organic traffic | 500+ daily visits | Google Analytics |
| Search zero-result rate | <10% | API logs |
