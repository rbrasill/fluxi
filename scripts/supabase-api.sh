#!/usr/bin/env bash
# Chama a Management API do Supabase usando o token da variável de ambiente.
# Uso: scripts/supabase-api.sh GET /v1/projects
#      scripts/supabase-api.sh POST /v1/projects/<ref>/database/query '{"query":"select 1"}'
set -euo pipefail
if [ -f .env ]; then set -a; . ./.env; set +a; fi
: "${SUPABASE_ACCESS_TOKEN:?Defina SUPABASE_ACCESS_TOKEN (variável de ambiente ou .env)}"
method="${1:?método}"; path="${2:?caminho}"; body="${3:-}"
curl -sS -X "$method" "https://api.supabase.com$path" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  ${body:+-d "$body"}
echo
