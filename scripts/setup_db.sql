-- Bonimbait database initialization
-- Runs automatically on first docker-compose up via /docker-entrypoint-initdb.d/

-- Enable pgvector for semantic search over embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Enable pg_trgm for fuzzy/trigram text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Hebrew full-text search note:
-- PostgreSQL does not ship with a built-in Hebrew dictionary, so we use the
-- 'simple' text search configuration which tokenizes on whitespace and
-- lowercases tokens. This works reasonably well for Hebrew because Hebrew
-- morphology (no case) means simple tokenization already captures most terms.
--
-- For improved Hebrew stemming/normalization in the future, a hunspell
-- dictionary can be loaded:
--   CREATE TEXT SEARCH DICTIONARY hebrew_hunspell (
--       TEMPLATE = ispell,
--       DictFile = he_IL,
--       AffFile  = he_IL,
--       Stopwords = hebrew
--   );
--   CREATE TEXT SEARCH CONFIGURATION hebrew (COPY = simple);
--   ALTER TEXT SEARCH CONFIGURATION hebrew
--       ALTER MAPPING FOR asciiword, asciihword, hword_asciipart, word, hword, hword_part
--       WITH hebrew_hunspell, simple;
