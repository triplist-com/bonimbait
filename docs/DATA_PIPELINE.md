# Data Pipeline

## Overview

The data pipeline transforms raw YouTube videos into searchable, AI-summarized content stored in PostgreSQL. It processes ~900 videos (~450 hours) from the @TomerChenRihana channel.

**Total pipeline cost**: ~$300-400 for all 900 videos.

## Pipeline Stages

```
Stage 1        Stage 2          Stage 3            Stage 4          Stage 5
Extract  -->  Transcribe  -->  Summarize  -->     Embed     -->    Load
(yt-dlp)     (Whisper)        (Claude)           (OpenAI)        (PostgreSQL)
```

### Stage 1: Extraction

| | |
|---|---|
| **Script** | `scripts/extract/fetch_channel.py` |
| **Tool** | yt-dlp |
| **Input** | YouTube channel ID (@TomerChenRihana) |
| **Output** | `data/raw/metadata/` — JSON per video (title, description, duration, thumbnail URL, available subtitles) |
| **Cost** | Free |
| **Notes** | Also downloads existing Hebrew subtitles via `scripts/extract/download_subs.py` |

### Stage 2: Transcription

| | |
|---|---|
| **Script** | `scripts/transcribe/run.py` |
| **Tool** | OpenAI Whisper (large-v3) |
| **Input** | Audio from videos without good Hebrew subtitles |
| **Output** | JSON per video with timestamped transcript segments |
| **Cost** | ~$200-300 (for videos needing transcription) |
| **Notes** | Segments split into logical chunks (~2-5 min) by `scripts/transcribe/segment.py`. Whisper large-v3 provides decent Hebrew accuracy. |

### Stage 3: Summarization & Categorization

| | |
|---|---|
| **Script** | `scripts/summarize/run.py` |
| **Tool** | Claude API (claude-sonnet-4-6 for cost efficiency) |
| **Input** | Transcripts from Stage 2 |
| **Output** | Structured JSON per video: summary, key points, extracted costs/prices, construction rules, category assignment |
| **Cost** | ~$50-100 |
| **Validation** | `scripts/summarize/validate.py` for quality checks |

**Category taxonomy** (10 categories):

| Hebrew | English |
|--------|---------|
| תכנון ורישוי | Planning & Permits |
| עלויות ומחירים | Costs & Prices |
| שלד ובנייה | Structure & Construction |
| חשמל ואינסטלציה | Electrical & Plumbing |
| גמרים ועיצוב | Finishes & Design |
| קבלנים ועבודה | Contractors & Labor |
| חוקים ותקנות | Laws & Regulations |
| טיפים כלליים | General Tips |
| בידוד ואיטום | Insulation & Waterproofing |
| גינון וחצר | Landscaping & Yard |

### Stage 4: Embedding Generation

| | |
|---|---|
| **Script** | `scripts/embed/run.py` |
| **Tool** | OpenAI text-embedding-3-small |
| **Input** | Video segment text + video-level summaries |
| **Output** | 1536-dimensional vectors stored in PostgreSQL pgvector |
| **Cost** | ~$5-10 |
| **Notes** | Each video segment and each video summary gets its own embedding |

### Stage 5: Database Loading

| | |
|---|---|
| **Script** | `scripts/load/load_db.py` |
| **Tool** | SQLAlchemy bulk insert, PostgreSQL |
| **Input** | All processed data from Stages 1-4 |
| **Output** | Populated PostgreSQL tables with search indexes |
| **Cost** | Free (DB hosting cost only) |

Post-load steps:
- Build Hebrew full-text search indexes (tsvector)
- Build pgvector indexes (IVFFlat with 100 lists)
- Validate data integrity

## Batch Processing

- Videos processed in batches of 50
- Checkpoint saved after each batch to `data/pipeline_state.json`
- Pipeline can resume from last checkpoint on failure
- Rate limiting applied for all external API calls

## Running the Pipeline

### Full pipeline
```bash
export DATABASE_URL="postgresql+asyncpg://..."
python scripts/run_pipeline.py
```

### Individual stages
```bash
python scripts/extract/fetch_channel.py     # Stage 1
python scripts/transcribe/run.py            # Stage 2
python scripts/summarize/run.py             # Stage 3
python scripts/embed/run.py                 # Stage 4
python scripts/load/load_db.py              # Stage 5
```

## Cost Data Freshness

Cost and price information extracted from videos has a freshness rule: data from videos published more than 2 years ago is excluded from cost calculations in the wizard. This ensures the cost estimation tool reflects current market conditions rather than outdated pricing.

## Current State & Future Plans

**Current**: Pipeline is triggered manually. All stages run as Python scripts.

**Future**:
- YouTube upload webhook to automatically ingest new videos as they are published
- Incremental processing (only new/updated videos)
- Cost data cross-referencing with external pricing databases
