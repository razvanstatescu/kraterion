#!/usr/bin/env bash
# End-to-end smoke for the control-plane Phase 1 surface.
# Boots against an already-running control-plane on $CP_URL (default 4001).
#
# What it covers (mirrors the plan's verification list):
#   1. /health/ready
#   2. dev-sign-up → token + akia + secret
#   3. /v1/me → matching account_id, one project
#   4. POST /v1/projects → second project; list shows 2
#   5. POST /v1/projects/<id>/api-keys → secret returned
#   6. GET .../api-keys → no secret leaks
#   7. POST /v1/api-keys/<id>/revoke → revoked_at set
#   8. Negative: missing Bearer / bad token → 401 envelope
#   9. Negative: invalid project name → 400 envelope
#
# Exits non-zero with the failing step number on any failure.

set -euo pipefail

CP_URL="${CP_URL:-http://127.0.0.1:4001}"
EMAIL="cp-smoke-$(date +%s)-$$@kraterion.dev"
SUI_ADDR="0xcafe$(printf '%060d' $$)"

step() { printf "\n\033[1m=== %s ===\033[0m\n" "$1"; }
fail() { printf "\033[31mFAIL: %s\033[0m\n" "$1" >&2; exit "${2:-1}"; }
needs() { command -v "$1" >/dev/null || fail "missing dependency: $1" 99; }

needs curl
needs jq

step "1. /health/ready"
ready=$(curl -fsS "$CP_URL/health/ready")
[ "$(echo "$ready" | jq -r .status)" = "ready" ] || fail "ready did not return status=ready" 1

step "2. dev-sign-up"
signup=$(curl -fsS -X POST "$CP_URL/v1/auth/dev-sign-up" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"sui_address\":\"$SUI_ADDR\"}")
TOKEN=$(echo "$signup" | jq -r .token)
AKIA=$(echo "$signup" | jq -r .akia)
SECRET=$(echo "$signup" | jq -r .secret)
ACCOUNT_ID=$(echo "$signup" | jq -r .account.id)
PROJECT_ID=$(echo "$signup" | jq -r .project.id)
[ -n "$TOKEN" ] && [ "$TOKEN" != "null" ] || fail "no token in sign-up response" 2
[ -n "$SECRET" ] && [ "$SECRET" != "null" ] || fail "no secret in sign-up response" 2

step "3. GET /v1/me"
me=$(curl -fsS "$CP_URL/v1/me" -H "Authorization: Bearer $TOKEN")
[ "$(echo "$me" | jq -r .account.id)" = "$ACCOUNT_ID" ] || fail "/me account mismatch" 3
[ "$(echo "$me" | jq -r '.projects | length')" = "1" ] || fail "/me should show 1 project" 3

step "4. POST /v1/projects + list"
curl -fsS -X POST "$CP_URL/v1/projects" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"second-project"}' >/dev/null
list=$(curl -fsS "$CP_URL/v1/projects" -H "Authorization: Bearer $TOKEN")
[ "$(echo "$list" | jq -r '.projects | length')" = "2" ] || fail "expected 2 projects" 4

step "5. mint API key under first project"
mint=$(curl -fsS -X POST "$CP_URL/v1/projects/$PROJECT_ID/api-keys" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"smoke-key-2"}')
NEW_KEY_ID=$(echo "$mint" | jq -r .api_key.id)
NEW_SECRET=$(echo "$mint" | jq -r .secret)
[ -n "$NEW_SECRET" ] && [ "$NEW_SECRET" != "null" ] || fail "no secret in mint response" 5

step "6. list API keys (no secret leak)"
keys=$(curl -fsS "$CP_URL/v1/projects/$PROJECT_ID/api-keys" -H "Authorization: Bearer $TOKEN")
[ "$(echo "$keys" | jq -r '.api_keys | length')" = "2" ] || fail "expected 2 keys under first project" 6
echo "$keys" | jq -e '.api_keys[] | (.secret_wrapped == null and .secret == null)' >/dev/null || fail "list leaked secret_wrapped" 6

step "7. revoke key"
rev=$(curl -fsS -X POST "$CP_URL/v1/api-keys/$NEW_KEY_ID/revoke" -H "Authorization: Bearer $TOKEN")
[ "$(echo "$rev" | jq -r .id)" = "$NEW_KEY_ID" ] || fail "revoke wrong id" 7
[ "$(echo "$rev" | jq -r .revoked_at)" != "null" ] || fail "revoked_at not set" 7

step "8. negative: missing / bad bearer"
status=$(curl -s -o /dev/null -w '%{http_code}' "$CP_URL/v1/me")
[ "$status" = "401" ] || fail "missing bearer should return 401, got $status" 8
status=$(curl -s -o /dev/null -w '%{http_code}' "$CP_URL/v1/me" -H "Authorization: Bearer not.a.token")
[ "$status" = "401" ] || fail "bad bearer should return 401, got $status" 8

step "9. negative: invalid project name"
status=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$CP_URL/v1/projects" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"bad name with spaces"}')
[ "$status" = "400" ] || fail "invalid name should return 400, got $status" 9

step "10. read-views: empty list for fresh account"
list=$(curl -fsS "$CP_URL/v1/buckets" -H "Authorization: Bearer $TOKEN")
[ "$(echo "$list" | jq -r '.buckets | length')" = "0" ] || fail "fresh account should have 0 buckets" 10
[ "$(echo "$list" | jq -r '.next_cursor')" = "null" ] || fail "next_cursor should be null on small page" 10

step "11. read-views: 404 on unknown bucket id"
status=$(curl -s -o /dev/null -w '%{http_code}' \
  "$CP_URL/v1/buckets/00000000-0000-0000-0000-000000000000" \
  -H "Authorization: Bearer $TOKEN")
[ "$status" = "404" ] || fail "unknown bucket should 404, got $status" 11

step "12. read-views: 404 on unknown object id"
status=$(curl -s -o /dev/null -w '%{http_code}' \
  "$CP_URL/v1/objects/00000000-0000-0000-0000-000000000000" \
  -H "Authorization: Bearer $TOKEN")
[ "$status" = "404" ] || fail "unknown object should 404, got $status" 12

step "13. read-views: malformed cursor returns 400 InvalidArgument"
status=$(curl -s -o /dev/null -w '%{http_code}' \
  "$CP_URL/v1/buckets?cursor=not-a-real-cursor" \
  -H "Authorization: Bearer $TOKEN")
[ "$status" = "400" ] || fail "bad cursor should 400, got $status" 13

step "14. prepare-tx: prepare-create"
# The endpoint always exists; if Enoki is configured it returns a sponsored tx,
# otherwise 500 with "Enoki is not configured" (because the prepare path
# delegates to the Enoki sponsorship layer in Phase 4).
prep_status=$(curl -s -o /tmp/cp_prep.json -w '%{http_code}' -X POST "$CP_URL/v1/buckets/prepare-create" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"project_id\":\"$PROJECT_ID\",\"name\":\"smoke-bucket-1\",\"encryption_mode\":\"private\"}")
if [ "$prep_status" = "200" ]; then
  jq -e '.digest | type == "string" and (length > 0)' /tmp/cp_prep.json >/dev/null || fail "digest missing" 14
  jq -e '.bytes | type == "string" and (length > 0)' /tmp/cp_prep.json >/dev/null || fail "bytes missing" 14
  jq -e '.expected.sponsored_by == "enoki"' /tmp/cp_prep.json >/dev/null || fail "sponsored_by != enoki" 14
  jq -e '.expected.allowed_move_call_targets | length == 1' /tmp/cp_prep.json >/dev/null || fail "allow-list should be exactly 1 target" 14
  jq -e '.expected.allowed_move_call_targets[0] | endswith("::create_grant_and_share_bucket")' /tmp/cp_prep.json >/dev/null || fail "allow-list target mismatch" 14
  echo "    [enoki] live sponsorship 200 OK"
elif [ "$prep_status" = "500" ]; then
  jq -e '.error.code == "InternalError"' /tmp/cp_prep.json >/dev/null || fail "expected InternalError envelope on 500, got: $(cat /tmp/cp_prep.json)" 14
  jq -e '.error.message | contains("Enoki")' /tmp/cp_prep.json >/dev/null || fail "expected Enoki-related error message, got: $(cat /tmp/cp_prep.json)" 14
  echo "    [no-enoki] endpoint exists but ENOKI_PRIVATE_KEY not set — skipping live verification"
else
  fail "unexpected prep status $prep_status: $(cat /tmp/cp_prep.json)" 14
fi

step "15. prepare-tx: project not owned → 404 (auth happens before Enoki)"
status=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$CP_URL/v1/buckets/prepare-create" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"project_id":"00000000-0000-0000-0000-000000000000","name":"smoke-x-1","encryption_mode":"private"}')
[ "$status" = "404" ] || fail "unowned project should 404, got $status" 15

step "16. prepare-tx: bucket not found → 404 (grant-api on missing id)"
status=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  "$CP_URL/v1/buckets/00000000-0000-0000-0000-000000000000/prepare-grant-api" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{}')
[ "$status" = "404" ] || fail "missing bucket should 404, got $status" 16

step "17. prepare-tx: invalid encryption mode → 400"
status=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$CP_URL/v1/buckets/prepare-create" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"project_id\":\"$PROJECT_ID\",\"name\":\"smoke-bucket-2\",\"encryption_mode\":\"banana\"}")
[ "$status" = "400" ] || fail "bad mode should 400, got $status" 17

step "18. zklogin: malformed JWT → 400 InvalidArgument"
status=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$CP_URL/v1/auth/zklogin" \
  -H "Content-Type: application/json" \
  -d '{"google_jwt":"not-a-jwt-just-a-long-string-that-passes-zod"}')
[ "$status" = "400" ] || fail "malformed JWT should 400, got $status" 18

step "19. sponsor/execute: Zod validation rejects bad signature length"
status=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$CP_URL/v1/sponsor/execute" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"digest":"abc","signature":"x"}')
[ "$status" = "400" ] || fail "short signature should 400, got $status" 19

printf "\n\033[32mAll smoke steps passed.\033[0m\n"
printf "Bootstrap account: %s\n" "$EMAIL"
printf "AKIA (initial)   : %s\n" "$AKIA"
printf "Secret (initial) : %s\n" "$SECRET"
