# Multi-Agent Development System

## Overview

Bonimbait is developed using a multi-agent system where specialized AI agents handle different domains. An orchestrator agent coordinates work, delegates tasks, and manages handoffs between agents across sprints.

Each sprint is scoped to fit within a single Claude Opus 4.6 context window (~200K tokens of productive work). This constraint forces clear task boundaries and explicit context handoffs.

## Agent Roster

| Agent | Skill File | Responsibilities |
|-------|-----------|-----------------|
| Orchestrator | `.claude/skills/orchestrator.md` | Sprint management, agent coordination, context handoffs, integration verification |
| Architect | `.claude/skills/architect.md` | System design, DB schema, API contracts, infrastructure, search architecture |
| Backend | `.claude/skills/backend.md` | FastAPI endpoints, business logic, RAG pipeline, caching |
| Frontend | `.claude/skills/frontend.md` | Next.js pages, React components, RTL styling, API integration |
| Data Pipeline | `.claude/skills/data-pipeline.md` | YouTube extraction, Whisper transcription, Claude summarization, embeddings |
| UX Designer | `.claude/skills/ux-designer.md` | Design tokens, component specs, Hebrew typography, responsive layout, visual review |
| QA | `.claude/skills/qa.md` | Unit/integration/E2E tests, accessibility, performance audits, search quality |

## How It Works

### 1. Sprint Planning
The orchestrator reads the sprint plan (`docs/sprints/SPRINT_PLAN.md`) and identifies which agents are needed for the current sprint.

### 2. Task Delegation
For each task, the orchestrator provides the assigned agent with:
- Clear task description and acceptance criteria
- Relevant file paths and dependencies
- Decisions from other agents that affect the task
- Reference to the sprint plan

### 3. Execution
Each agent works within its domain, producing code, configs, or documentation. Agents do not cross domain boundaries without orchestrator coordination.

### 4. Integration
The orchestrator verifies that outputs from different agents are compatible (e.g., API contracts match between backend and frontend).

### 5. Quality Gate
Before marking a sprint complete, the QA agent validates deliverables against the sprint's acceptance criteria.

### 6. Handoff
The orchestrator updates `docs/sprints/progress.md` and prepares context for the next sprint.

## Sprint Plan

10 sprints from bootstrap to launch, plus post-launch improvements.

| Sprint | Name | Lead Agents | Goal |
|--------|------|-------------|------|
| 0 | Project Bootstrap & Infrastructure | Architect, Orchestrator | Monorepo, dev environment, DB schema, CI |
| 1 | Data Pipeline — Extraction & Transcription | Data Pipeline | Extract 900 video metadata, transcribe content |
| 2 | Data Pipeline — Summarization & Categorization | Data Pipeline | AI-summarize all videos, auto-categorize |
| 3 | Data Pipeline — Embeddings & DB Loading | Data Pipeline, Backend | Generate embeddings, load into PostgreSQL |
| 4 | Backend API — Search & Video Endpoints | Backend | Hybrid search, video CRUD, categories, caching |
| 5 | AI Answer Generation | Backend, Data Pipeline | RAG pipeline with streaming, answer caching |
| 6 | Frontend — Design System & Layout | Frontend, UX Designer | Tailwind theme, core components, RTL layout |
| 7 | Frontend — Pages & API Integration | Frontend | All pages connected to live API |
| 8 | Polish, SEO & Performance | Frontend, QA | Lighthouse >90, meta tags, sitemap, analytics |
| 9 | Deployment & Launch | Architect, Backend, Frontend | Deploy to Render, DNS, SSL, smoke tests |

### Sprint Dependencies

```
Sprint 0 (bootstrap)
    |
    +--> Sprints 1-3 (data pipeline) --+
    |                                   +--> Sprint 9 (deploy)
    +--> Sprints 6-7 (frontend) -------+
              |
              +--> Sprint 8 (polish)
    |
    +--> Sprints 4-5 (backend API) --> Sprint 7 (frontend integration)
```

Sprints 1-3 (data pipeline) and Sprints 6 (frontend design) can run in parallel since they are independent. Sprint 7 (frontend integration) depends on Sprints 4-5 (backend API) being complete.

### Current Progress

All 10 sprints completed as of March 2026. See `docs/sprints/progress.md` for details.

### Post-Launch (Sprint 10+)

- Cost estimation wizard
- User accounts and saved searches
- Auto YouTube ingest (new video detection)
- WhatsApp bot integration
- External pricing database
- Community features

## Agent Activation Pattern

The orchestrator selects agents per sprint based on the task breakdown:

```
Orchestrator reads sprint plan
    |
    +--> Identifies required agents
    |
    +--> Prepares context package per agent
    |
    +--> Delegates tasks (parallel where possible)
    |
    +--> Collects outputs
    |
    +--> Runs QA validation
    |
    +--> Updates progress tracker
```

## Constraints

- **Budget-conscious**: Prefer managed services with free/starter tiers
- **Solo-maintainable**: Architecture must be manageable by a single developer
- **Hebrew-first**: All search, NLP, and UX must handle Hebrew and RTL correctly
- **Context-window-scoped**: Each sprint fits within one Opus 4.6 session
