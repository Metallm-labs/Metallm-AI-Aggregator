#!/bin/bash
# IndexNow URL submission script
# Run after deploy or commit to notify search engines of changes
# Usage: ./scripts/indexnow-submit.sh [specific-urls...]

INDEXNOW_KEY="5a74e9d497aa7d0c1bb7b88e0ddea767"
HOST="metallm.tech"
ENDPOINT="https://api.indexnow.org/indexnow"

# If specific URLs are passed, use those. Otherwise detect from git diff.
if [ $# -gt 0 ]; then
  URLS="$@"
else
  # Detect changed files from the last commit and map to URLs
  CHANGED_FILES=$(git diff --name-only HEAD~1 HEAD 2>/dev/null || git diff --name-only HEAD)
  URLS=""

  for file in $CHANGED_FILES; do
    case "$file" in
      *Landing.tsx|*App.tsx) URLS="$URLS https://$HOST/" ;;
      *LandingWhatsapp.tsx) URLS="$URLS https://$HOST/agent" ;;
      *CompareCompetitors.tsx) URLS="$URLS https://$HOST/compare-competitors" ;;
      *CompareDetail.tsx)
        URLS="$URLS https://$HOST/compare/poe https://$HOST/compare/typingmind https://$HOST/compare/chathub https://$HOST/compare/perplexity https://$HOST/compare/openrouter https://$HOST/compare/huggingchat https://$HOST/compare/merlin"
        ;;
      *Blogs*) URLS="$URLS https://$HOST/blogs" ;;
      *Terms*) URLS="$URLS https://$HOST/terms" ;;
      *Privacy*) URLS="$URLS https://$HOST/privacy" ;;
      *sitemap*) URLS="$URLS https://$HOST/sitemap.xml" ;;
      *llms.txt) URLS="$URLS https://$HOST/llms.txt" ;;
      *llms-full.txt) URLS="$URLS https://$HOST/llms-full.txt" ;;
    esac
  done

  # Deduplicate
  URLS=$(echo "$URLS" | tr ' ' '\n' | sort -u | tr '\n' ' ')
fi

if [ -z "$URLS" ]; then
  echo "[IndexNow] No URLs to submit."
  exit 0
fi

# Build JSON array
URL_ARRAY=$(echo "$URLS" | tr ' ' '\n' | grep -v '^$' | sed 's/.*/"&"/' | paste -sd ',' -)

PAYLOAD=$(cat <<EOF
{
  "host": "$HOST",
  "key": "$INDEXNOW_KEY",
  "keyLocation": "https://$HOST/$INDEXNOW_KEY.txt",
  "urlList": [$URL_ARRAY]
}
EOF
)

echo "[IndexNow] Submitting URLs:"
echo "$URLS" | tr ' ' '\n' | grep -v '^$' | sed 's/^/  - /'
echo ""

RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

if [ "$RESPONSE" = "200" ] || [ "$RESPONSE" = "202" ]; then
  echo "[IndexNow] Success! Status: $RESPONSE"
else
  echo "[IndexNow] Failed. Status: $RESPONSE"
  echo "[IndexNow] Payload was: $PAYLOAD"
fi
