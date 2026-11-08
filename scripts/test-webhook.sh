#!/usr/bin/env bash
# ==============================================================================
# GitHub Gateway Webhook Test & Health Check
# ==============================================================================

set -euo pipefail

GATEWAY_URL="${1:-${GATEWAY_URL:-}}"
WEBHOOK_SECRET="${2:-${GITHUB_WEBHOOK_SECRET:-}}"

if [[ -z "${GATEWAY_URL}" ]]; then
  echo "Usage: ./scripts/test-webhook.sh <GATEWAY_URL> [WEBHOOK_SECRET]"
  echo "Example: ./scripts/test-webhook.sh https://code-review-github-gateway-xyz.a.run.app mysecret"
  exit 1
fi

# Remove trailing slash
GATEWAY_URL="${GATEWAY_URL%/}"

echo "1. Checking Gateway Health endpoint (${GATEWAY_URL}/healthz)..."
HEALTH_RES=$(curl -s -w "\n%{http_code}" "${GATEWAY_URL}/healthz")
HTTP_CODE=$(echo "${HEALTH_RES}" | tail -n1)
BODY=$(echo "${HEALTH_RES}" | head -n -1)

echo "HTTP Code: ${HTTP_CODE}"
echo "Response:  ${BODY}"

if [[ "${HTTP_CODE}" == "200" ]]; then
  echo "✓ Gateway health check passed!"
else
  echo "✗ Gateway health check failed with status ${HTTP_CODE}."
  exit 1
fi

if [[ -n "${WEBHOOK_SECRET}" ]]; then
  echo -e "\n2. Testing Webhook signature validation..."
  PAYLOAD='{"action":"opened","pull_request":{"number":999,"title":"Test PR"},"repository":{"name":"test-repo","owner":{"login":"test-org"}}}'
  
  # Compute HMAC SHA256 signature
  SIGNATURE="sha256=$(echo -n "${PAYLOAD}" | openssl dgst -sha256 -hmac "${WEBHOOK_SECRET}" | sed 's/^.* //')"

  echo "Sending mock webhook to ${GATEWAY_URL}/api/v1/webhooks..."
  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${GATEWAY_URL}/api/v1/webhooks" \
    -H "Content-Type: application/json" \
    -H "x-github-event: pull_request" \
    -H "x-github-delivery: test-delivery-$(date +%s)" \
    -H "x-hub-signature-256: ${SIGNATURE}" \
    -d "${PAYLOAD}")

  STATUS_CODE=$(echo "${RESPONSE}" | tail -n1)
  RESPONSE_BODY=$(echo "${RESPONSE}" | head -n -1)

  echo "HTTP Code: ${STATUS_CODE}"
  echo "Response:  ${RESPONSE_BODY}"
fi
