#!/bin/bash
set -euo pipefail

# Bonimbait Production Setup Script
# Run this once to set up the production environment.

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# ----- Step 1: Check prerequisites -----
info "Step 1: Checking prerequisites..."

command -v docker >/dev/null 2>&1 || error "docker is not installed"
command -v python3 >/dev/null 2>&1 || error "python3 is not installed"
command -v node >/dev/null 2>&1 || error "node is not installed"

FLY_INSTALLED=false
RAILWAY_INSTALLED=false
if command -v flyctl >/dev/null 2>&1; then
    FLY_INSTALLED=true
    info "  flyctl found"
fi
if command -v railway >/dev/null 2>&1; then
    RAILWAY_INSTALLED=true
    info "  railway CLI found"
fi

if [ "$FLY_INSTALLED" = false ] && [ "$RAILWAY_INSTALLED" = false ]; then
    warn "Neither flyctl nor railway CLI found. Install one:"
    warn "  Fly.io:  curl -L https://fly.io/install.sh | sh"
    warn "  Railway: npm install -g @railway/cli"
fi

if command -v vercel >/dev/null 2>&1; then
    info "  vercel CLI found"
else
    warn "vercel CLI not found. Install: npm install -g vercel"
fi

info "Prerequisites check complete."

# ----- Step 2: Supabase setup instructions -----
info "Step 2: Supabase Project Setup"
echo ""
echo "  Manual steps required:"
echo "  1. Go to https://supabase.com/dashboard and create a new project"
echo "  2. Region: Frankfurt (eu-central-1) recommended"
echo "  3. Note down the connection string (Settings > Database)"
echo "  4. Enable pgvector: SQL Editor > run: CREATE EXTENSION IF NOT EXISTS vector;"
echo "  5. Set DATABASE_URL in your .env file"
echo ""
read -p "Press Enter when Supabase is configured (or Ctrl+C to abort)..."

# ----- Step 3: Run migrations -----
info "Step 3: Running database migrations..."
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

if [ -z "${DATABASE_URL:-}" ]; then
    error "DATABASE_URL is not set. Configure it in .env first."
fi

cd apps/api
python3 -m alembic upgrade head
cd ../..
info "Migrations complete."

# ----- Step 4: Data pipeline instructions -----
info "Step 4: Data Pipeline"
echo ""
echo "  To populate the production database, run the data pipeline:"
echo "    python scripts/run_pipeline.py"
echo "  Or run individual steps:"
echo "    python scripts/extract/fetch_channel.py"
echo "    python scripts/transcribe/run.py"
echo "    python scripts/summarize/run.py"
echo "    python scripts/embed/run.py"
echo "    python scripts/load/run.py"
echo ""
read -p "Press Enter to continue (run pipeline separately if needed)..."

# ----- Step 5: Deploy API -----
info "Step 5: Deploying API..."
if [ "$FLY_INSTALLED" = true ]; then
    info "Deploying to Fly.io..."
    cd apps/api
    if ! flyctl apps list 2>/dev/null | grep -q bonimbait-api; then
        info "Creating Fly.io app..."
        flyctl launch --no-deploy --name bonimbait-api --region fra
    fi
    flyctl secrets set \
        DATABASE_URL="$DATABASE_URL" \
        ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}" \
        OPENAI_API_KEY="${OPENAI_API_KEY:-}" \
        CORS_ORIGINS="https://bonimbait.com,https://www.bonimbait.com" \
        ENV=production
    flyctl deploy
    cd ../..
    info "API deployed to Fly.io."
elif [ "$RAILWAY_INSTALLED" = true ]; then
    info "Deploying to Railway..."
    cd apps/api
    railway up
    cd ../..
    info "API deployed to Railway."
else
    warn "No deployment CLI found. Deploy manually."
fi

# ----- Step 6: Deploy Frontend -----
info "Step 6: Deploying Frontend..."
if command -v vercel >/dev/null 2>&1; then
    cd apps/web
    vercel --prod
    cd ../..
    info "Frontend deployed to Vercel."
else
    warn "vercel CLI not found. Deploy via Vercel dashboard or install: npm i -g vercel"
fi

# ----- Step 7: DNS Configuration -----
info "Step 7: DNS Configuration (GoDaddy)"
echo ""
echo "  Configure DNS records at GoDaddy for bonimbait.com:"
echo ""
echo "  Option A: Point to Vercel"
echo "    - A record:     @ -> 76.76.21.21"
echo "    - CNAME record: www -> cname.vercel-dns.com"
echo ""
echo "  Option B: Transfer nameservers to Vercel"
echo "    - Update nameservers at GoDaddy to Vercel's nameservers"
echo "    - See: https://vercel.com/docs/projects/domains"
echo ""

# ----- Step 8: Verify health endpoints -----
info "Step 8: Verifying health endpoints..."

API_URL="${API_URL:-https://bonimbait-api.fly.dev}"
WEB_URL="${WEB_URL:-https://bonimbait.com}"

echo "  Checking API health..."
if curl -sf "${API_URL}/health" >/dev/null 2>&1; then
    info "  API health: OK"
else
    warn "  API health: UNREACHABLE (may need DNS propagation)"
fi

echo "  Checking frontend..."
if curl -sf "${WEB_URL}" >/dev/null 2>&1; then
    info "  Frontend: OK"
else
    warn "  Frontend: UNREACHABLE (may need DNS propagation)"
fi

# ----- Step 9: Smoke tests -----
info "Step 9: Running smoke tests..."
if [ -f scripts/deploy/smoke_test.py ]; then
    python3 scripts/deploy/smoke_test.py --api-url "${API_URL}" --web-url "${WEB_URL}"
else
    warn "Smoke test script not found. Skipping."
fi

info "Production setup complete!"
echo ""
echo "  API:      ${API_URL}"
echo "  Frontend: ${WEB_URL}"
echo "  Docs:     ${API_URL}/docs"
