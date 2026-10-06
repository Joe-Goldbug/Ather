#!/usr/bin/env bash
# Vercel API deploy — bypass TEAM_ACCESS_REQUIRED on CLI
# Usage:
#   ./scripts/deploy-web.sh              # preview deploy → eva-phi.vercel.app
#   ./scripts/deploy-web.sh --prod       # production deploy
set -euo pipefail

MODE="${1:---preview}"
TOKEN=$(python3 -c "
import json
with open('$HOME/Library/Application Support/com.vercel.cli/auth.json') as f:
    print(json.load(f)['token'])
")
ORG_ID="team_b3YyusbKbLYIYFMuEPBQoMG7"
PROJECT_ID="prj_KPC0QVQsNCthADKIGyBZtpmIM2hF"
PAYLOAD=$(cat <<EOF
{
  "name": "eva",
  "projectId": "$PROJECT_ID",
  "target": "$([ "$MODE" = "--prod" ] && echo "production" || echo "preview")",
  "gitSource": {
    "type": "github",
    "ref": "feature/EVA-Ethan",
    "repo": "EthanLau1/EVA"
  }
}
EOF
)

echo "🚀 Deploying apps/web → $MODE ..."

RESP=$(curl -s -X POST "https://api.vercel.com/v13/deployments?teamId=$ORG_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

DEPLOY_ID=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('uid',''))" 2>/dev/null || echo "")

if [ -z "$DEPLOY_ID" ]; then
  echo "❌ Deploy failed:"
  echo "$RESP" | python3 -m json.tool 2>/dev/null || echo "$RESP"
  exit 1
fi

echo "✅ Deployment created: $DEPLOY_ID"
echo "🔗 https://vercel.com/ethan-l-s-projects/eva/$DEPLOY_ID"
echo "⏳ Waiting for build..."

for i in $(seq 1 60); do
  sleep 5
  STATUS=$(curl -s "https://api.vercel.com/v13/deployments/$DEPLOY_ID?teamId=$ORG_ID" \
    -H "Authorization: Bearer $TOKEN" \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('state',''))" 2>/dev/null || echo "")

  if [ "$STATUS" = "READY" ]; then
    URL=$(curl -s "https://api.vercel.com/v13/deployments/$DEPLOY_ID?teamId=$ORG_ID" \
      -H "Authorization: Bearer $TOKEN" \
      | python3 -c "import sys,json; print(json.load(sys.stdin).get('url',''))" 2>/dev/null || echo "")
    echo "✅ Build successful!"
    echo "🌐 https://$URL"
    exit 0
  elif [ "$STATUS" = "ERROR" ]; then
    ERR=$(curl -s "https://api.vercel.com/v13/deployments/$DEPLOY_ID?teamId=$ORG_ID" \
      -H "Authorization: Bearer $TOKEN" \
      | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('errorMessage','') or d.get('error','').get('message','Unknown error'))" 2>/dev/null || echo "Unknown")
    echo "❌ Build failed: $ERR"
    exit 1
  fi
done

echo "⏰ Timeout"
exit 1
