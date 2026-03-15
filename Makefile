.PHONY: setup dev-db dev-web dev-api dev migrate seed lint test clean \
       deploy-api deploy-web migrate-prod smoke-test pipeline-prod

# Install all dependencies (Node.js + Python)
setup:
	cd apps/web && npm install
	cd apps/api && pip install -r requirements.txt

# Start PostgreSQL via docker-compose
dev-db:
	docker-compose up -d db
	@echo "Waiting for database to be healthy..."
	@docker-compose exec db pg_isready -U postgres -d bonimbait || \
		(echo "DB not ready yet, waiting..." && sleep 3)
	@echo "Database is ready on localhost:5432"

# Start Next.js dev server
dev-web:
	cd apps/web && npm run dev

# Start FastAPI dev server
dev-api:
	cd apps/api && uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Start everything (db in background, web + api in foreground)
dev:
	$(MAKE) dev-db
	@echo "Starting web and api servers..."
	$(MAKE) -j2 dev-web dev-api

# Run Alembic migrations
migrate:
	cd apps/api && alembic upgrade head

# Run seed script
seed:
	python scripts/seed.py

# Lint all code
lint:
	cd apps/web && npm run lint
	cd apps/api && ruff check .

# Run all tests
test:
	cd apps/web && npm test
	cd apps/api && pytest

# Stop containers and clean build artifacts
clean:
	docker-compose down -v
	rm -rf apps/web/.next apps/web/node_modules/.cache
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
	@echo "Cleaned up containers and build artifacts"

# ---- Production Targets ----

# Deploy API to Fly.io
deploy-api:
	cd apps/api && flyctl deploy --remote-only

# Deploy frontend (trigger Vercel production build)
deploy-web:
	cd apps/web && vercel --prod

# Run Alembic migrations against production database
migrate-prod:
	python scripts/deploy/migrate_production.py

# Run production smoke tests
smoke-test:
	python scripts/deploy/smoke_test.py \
		--api-url $${API_URL:-https://bonimbait-api.fly.dev} \
		--web-url $${WEB_URL:-https://bonimbait.com}

# Run data pipeline against production database
pipeline-prod:
	python scripts/run_pipeline.py
