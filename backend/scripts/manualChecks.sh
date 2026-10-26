#!/usr/bin/env bash
# Oddspot bulk API checks. Run with the backend already running:
#   bash backend/scripts/manualChecks.sh
#
# - FAIL means "gap to review", not always a bug. Paste the FAIL lines to Claude.
# - It creates test_chk_* users and posts. Delete them in Atlas afterwards.
# - The last section hammers login and trips the rate limiter. Restart the
#   backend afterwards to reset it (the limiter is in memory).
# - Needs: bash, curl, node. Optional: BASE=... ORIGIN=... env overrides.

BASE="${BASE:-http://localhost:5001}"
ORIGIN="${ORIGIN:-http://localhost:5173}"
J='Content-Type: application/json'
PASS=0
FAIL=0

js()   { node -pe "try{const d=JSON.parse(require('fs').readFileSync(0,'utf8'));$1}catch(e){'PARSE_ERROR'}"; }
code() { curl -s -o /dev/null -w "%{http_code}" "$@"; }
codeln() { curl -s -o /dev/null -w "%{http_code}\n" "$@"; }
check() {
  if [[ "$3" == $2 ]]; then echo "PASS  $1"; PASS=$((PASS+1))
  else echo "FAIL  $1   (expected $2, got $3)"; FAIL=$((FAIL+1)); fi
}
section() { echo; echo "=== $1 ==="; }

signup() { curl -s -X POST "$BASE/api/auth/signup" -H "$J" \
  -d "{\"username\":\"$1\",\"email\":\"$1@example.com\",\"password\":\"supersecretpassword\"$2}"; }
# p: a valid post body. Extra fields override earlier ones (last JSON key wins).
p() { echo "{\"title\":\"test_chk post\",\"latitude\":12.97,\"longitude\":77.59,\"city\":\"Bengaluru\",\"country\":\"India\",\"images\":[\"https://example.com/a.jpg\"]$1}"; }
mkpost()   { curl -s -X POST "$BASE/api/posts" -H "$J" -H "Authorization: Bearer $T1" -d "$1"; }
postcode() { code -X POST "$BASE/api/posts" -H "$J" -H "Authorization: Bearer $T1" -d "$1"; }

# ---------------------------------------------------------------- setup
U1="test_chk_$RANDOM"; U2="test_chk_$RANDOM"
S1=$(signup "$U1" ',"role":"admin"')
S2=$(signup "$U2" '')
T1=$(echo "$S1" | js 'd.token')
T2=$(echo "$S2" | js 'd.token')
if [ -z "$T1" ] || [ "$T1" = "undefined" ] || [ "$T1" = "PARSE_ERROR" ]; then
  echo "Setup failed: could not sign up test users (rate limited? backend down?)."
  echo "Restart the backend and try again."; exit 1
fi
ID1=$(echo "$S1" | js 'd.user.id')

# ---------------------------------------------------------------- auth
section "AUTH"
check "signup ignores role:admin (mass assignment)" "member" "$(echo "$S1" | js 'd.user.role')"
check "signup response has no password hash" 0 "$(echo "$S1" | grep -ci passwordHash)"
check "login response has no password hash" 0 "$(curl -s -X POST "$BASE/api/auth/login" -H "$J" -d "{\"identifier\":\"$U1\",\"password\":\"supersecretpassword\"}" | grep -ci passwordHash)"
check "/me has no password hash" 0 "$(curl -s "$BASE/api/auth/me" -H "Authorization: Bearer $T1" | grep -ci passwordHash)"
check "NoSQL operator injection on login" "40[01]" "$(code -X POST "$BASE/api/auth/login" -H "$J" -d '{"identifier":{"$ne":null},"password":{"$ne":null}}')"
check "login with non-string password" "40[01]" "$(code -X POST "$BASE/api/auth/login" -H "$J" -d "{\"identifier\":\"$U1\",\"password\":12345678}")"
check "signup username with spaces" 400 "$(code -X POST "$BASE/api/auth/signup" -H "$J" -d '{"username":"a b c","email":"x1@example.com","password":"supersecretpassword"}')"
check "signup too-short password" 400 "$(code -X POST "$BASE/api/auth/signup" -H "$J" -d '{"username":"test_chk_short","email":"x2@example.com","password":"123"}')"
check "signup invalid email" 400 "$(code -X POST "$BASE/api/auth/signup" -H "$J" -d '{"username":"test_chk_mail","email":"notanemail","password":"supersecretpassword"}')"
check "duplicate email, new username" "40[09]" "$(code -X POST "$BASE/api/auth/signup" -H "$J" -d "{\"username\":\"test_chk_dup$RANDOM\",\"email\":\"$U1@example.com\",\"password\":\"supersecretpassword\"}")"
check "tampered token rejected" 401 "$(code "$BASE/api/auth/me" -H "Authorization: Bearer ${T1}tampered")"
NONE=$(node -e "const b=s=>Buffer.from(s).toString('base64url');console.log(b('{\"alg\":\"none\",\"typ\":\"JWT\"}')+'.'+b('{\"id\":\"$ID1\"}')+'.')")
check "alg:none token rejected" 401 "$(code "$BASE/api/auth/me" -H "Authorization: Bearer $NONE")"
check "token without Bearer prefix rejected" 401 "$(code "$BASE/api/auth/me" -H "Authorization: $T1")"

# ---------------------------------------------------------------- mass assignment / ownership
section "MASS ASSIGNMENT AND OWNERSHIP"
R=$(mkpost "$(p ',"tier":"country","meter":{"score":9999,"likes":500},"authorId":"000000000000000000000000","removed":true,"solved":true,"stats":{"posts":99}')")
check "client cannot set tier" "city" "$(echo "$R" | js 'd.tier')"
check "client cannot set meter" "0" "$(echo "$R" | js 'd.meter.score')"
check "authorId comes from token, not body" "$ID1" "$(echo "$R" | js 'd.authorId')"
check "client cannot set removed" "false" "$(echo "$R" | js 'd.removed')"
check "client cannot set solved" "false" "$(echo "$R" | js 'd.solved')"
PID=$(echo "$R" | js 'd._id')
check "create post without token" 401 "$(code -X POST "$BASE/api/posts" -H "$J" -d "$(p '')")"
check "comment without token" 401 "$(code -X POST "$BASE/api/posts/$PID/comments" -H "$J" -d '{"body":"hi"}')"
check "report without token" 401 "$(code -X POST "$BASE/api/posts/$PID/report" -H "$J" -d '{"reason":"spam"}')"

# ---------------------------------------------------------------- validation
section "VALIDATION"
LONG=$(printf 'a%.0s' $(seq 141))
TAGS=$(node -e "console.log(JSON.stringify(Array.from({length:60},(_,i)=>'t'+i)))")
check "empty title" 400 "$(postcode "$(p ',"title":""')")"
check "whitespace-only title" 400 "$(postcode "$(p ',"title":"     "')")"
check "title over 140 chars" 400 "$(postcode "$(p ",\"title\":\"$LONG\"")")"
check "title as object (operator injection)" 400 "$(postcode "$(p ',"title":{"$gt":""}')")"
check "latitude as string" 400 "$(postcode "$(p ',"latitude":"abc"')")"
check "latitude over 90" 400 "$(postcode "$(p ',"latitude":91')")"
check "longitude over 180" 400 "$(postcode "$(p ',"longitude":181')")"
check "latitude missing" 400 "$(postcode '{"title":"x","longitude":77,"city":"A","country":"B"}')"
check "city missing" 400 "$(postcode '{"title":"x","latitude":12,"longitude":77,"country":"B"}')"
check "http:// image URL" 400 "$(postcode "$(p ',"images":["http://example.com/a.jpg"]')")"
check "javascript: image URL" 400 "$(postcode "$(p ',"images":["javascript:alert(1)"]')")"
check "data: image URL" 400 "$(postcode "$(p ',"images":["data:image/png;base64,AAAA"]')")"
check "images not an array" 400 "$(postcode "$(p ',"images":"https://example.com/a.jpg"')")"
check "7 images (max 6)" 400 "$(postcode "$(p ',"images":["https://e.com/1.jpg","https://e.com/2.jpg","https://e.com/3.jpg","https://e.com/4.jpg","https://e.com/5.jpg","https://e.com/6.jpg","https://e.com/7.jpg"]')")"
check "60 tags" 400 "$(postcode "$(p ",\"tags\":$TAGS")")"
check "unknown post type" 400 "$(postcode "$(p ',"type":"hacked"')")"
check "empty comment" 400 "$(code -X POST "$BASE/api/posts/$PID/comments" -H "$J" -H "Authorization: Bearer $T1" -d '{"body":""}')"
check "5001-char comment" 400 "$(code -X POST "$BASE/api/posts/$PID/comments" -H "$J" -H "Authorization: Bearer $T1" -d "{\"body\":\"$(printf 'a%.0s' $(seq 5001))\"}")"
check "vote value 0" 400 "$(code -X POST "$BASE/api/posts/$PID/vote" -H "$J" -H "Authorization: Bearer $T1" -d '{"value":0}')"
check "vote value as string" 400 "$(code -X POST "$BASE/api/posts/$PID/vote" -H "$J" -H "Authorization: Bearer $T1" -d '{"value":"1"}')"
check "report with invalid reason" 400 "$(code -X POST "$BASE/api/posts/$PID/report" -H "$J" -H "Authorization: Bearer $T2" -d '{"reason":"because"}')"

# ---------------------------------------------------------------- robustness
section "ROBUSTNESS AND ERROR HANDLING"
check "malformed JSON returns 400" 400 "$(code -X POST "$BASE/api/auth/login" -H "$J" -d '{bad json')"
check "malformed JSON leaks no stack trace" 0 "$(curl -s -X POST "$BASE/api/auth/login" -H "$J" -d '{bad json' | grep -ci 'node_modules\|\.js:[0-9]\|^ *at ')"
check "wrong content-type does not crash" "[24]0?" "$(code -X POST "$BASE/api/auth/login" -H 'Content-Type: text/plain' -d 'hello')"
BIG=$( (printf '{"body":"'; head -c 200000 /dev/zero | LC_ALL=C tr '\0' 'a'; printf '"}') | curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/posts" -H "$J" -H "Authorization: Bearer $T1" --data-binary @- )
check "200 KB body rejected (limit is 100kb)" 413 "$BIG"
check "invalid ObjectId in vote route" "40[04]" "$(code -X POST "$BASE/api/posts/abc/vote" -H "$J" -H "Authorization: Bearer $T1" -d '{"value":1}')"
check "invalid ObjectId in comments route" "40[04]" "$(code "$BASE/api/posts/abc/comments")"
check "nonexistent post vote" 404 "$(code -X POST "$BASE/api/posts/000000000000000000000000/vote" -H "$J" -H "Authorization: Bearer $T1" -d '{"value":1}')"
check "nonexistent post comments" "404" "$(code -X POST "$BASE/api/posts/000000000000000000000000/comments" -H "$J" -H "Authorization: Bearer $T1" -d '{"body":"hi"}')"
check "unknown API route returns 404" 404 "$(code "$BASE/api/does-not-exist")"
check "unknown route is JSON, not HTML" 0 "$(curl -s "$BASE/api/does-not-exist" | grep -ci '<html')"
check "DELETE on a post (not built) is 404/405" "40[45]" "$(code -X DELETE "$BASE/api/posts/$PID" -H "Authorization: Bearer $T1")"

# ---------------------------------------------------------------- headers and CORS
section "HEADERS AND CORS"
check "X-Powered-By removed" 0 "$(curl -sI "$BASE/api/nope" | grep -ci '^x-powered-by')"
check "X-Content-Type-Options: nosniff" 1 "$(curl -sI "$BASE/api/nope" | grep -ci '^x-content-type-options: nosniff')"
check "CORS never allows the evil origin" 0 "$(curl -sI -H 'Origin: http://evil.example' "$BASE/api/nope" | grep -ci '^access-control-allow-origin: http://evil')"
check "CORS header for allowed origin" 1 "$(curl -sI -H "Origin: $ORIGIN" "$BASE/api/nope" | grep -ci '^access-control-allow-origin')"
check "CORS is not a wildcard" 0 "$(curl -sI -H "Origin: $ORIGIN" "$BASE/api/nope" | grep -ci '^access-control-allow-origin: \*')"
check "preflight from allowed origin" "20?" "$(code -X OPTIONS -H "Origin: $ORIGIN" -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: authorization,content-type' "$BASE/api/posts")"

# ---------------------------------------------------------------- nearby feed
section "NEARBY FEED"
check "nearby without lat/lng" 400 "$(code "$BASE/api/posts/nearby")"
check "nearby lat=abc" 400 "$(code "$BASE/api/posts/nearby?lat=abc&lng=77.59")"
check "nearby lat out of range" 400 "$(code "$BASE/api/posts/nearby?lat=95&lng=77.59")"
check "nearby operator injection" 400 "$(code -g "$BASE/api/posts/nearby?lat[\$gt]=0&lng=77.59")"
check "nearby with huge maxDistance does not 500" 200 "$(code "$BASE/api/posts/nearby?lat=12.97&lng=77.59&maxDistance=999999999")"
check "nearby with negative maxDistance does not 500" "[24]0?" "$(code "$BASE/api/posts/nearby?lat=12.97&lng=77.59&maxDistance=-5")"
check "nearby page=-1 does not 500" "[24]0?" "$(code "$BASE/api/posts/nearby?lat=12.97&lng=77.59&page=-1")"
check "nearby limit=abc does not 500" "[24]0?" "$(code "$BASE/api/posts/nearby?lat=12.97&lng=77.59&limit=abc")"
N=$(curl -s "$BASE/api/posts/nearby?lat=12.97&lng=77.59&limit=100000" | js 'd.posts.length')
check "limit capped at 50 (got $N posts)" "yes" "$([ "$N" -le 50 ] 2>/dev/null && echo yes || echo no)"
HIDDEN=$(mkpost "$(p ',"title":"test_chk hidden","hideExact":true,"latitude":12.97123,"longitude":77.59456')")
check "hideExact response is fuzzed" "true" "$(echo "$HIDDEN" | js 'd.location.fuzzed')"
check "hideExact does not return exact latitude" "12.9[67]*" "$(echo "$HIDDEN" | js 'd.location.coordinates[1]')"
FEED=$(curl -s "$BASE/api/posts/nearby?lat=12.97&lng=77.59")
check "feed never contains exact hidden coords" 0 "$(echo "$FEED" | grep -c '77.59456')"
check "feed distance for hidden posts is a multiple of 500" "yes" "$(echo "$FEED" | js 'd.posts.filter(x=>x.hideExact).every(x=>x.distanceMeters%500===0)?"yes":"no"')"

# ---------------------------------------------------------------- concurrency
section "CONCURRENCY (race conditions)"
CP=$(curl -s -X POST "$BASE/api/posts" -H "$J" -H "Authorization: Bearer $T2" -d "$(p ',"title":"test_chk race"')" | js 'd._id')
echo "--- 20 parallel likes from ONE user: expect one 200 and the rest 200/409, but NO 500 ---"
for i in $(seq 20); do codeln -X POST "$BASE/api/posts/$CP/vote" -H "$J" -H "Authorization: Bearer $T1" -d '{"value":1}' & done | sort | uniq -c
wait
LIKES=$(curl -s "$BASE/api/posts/$CP" | grep -o '"likes":[0-9]*' | head -1)
check "likes counter is exactly 1 after 20 parallel votes" '"likes":1' "$LIKES"
echo "--- 10 parallel comments from one user (429s here mean the limiter blocked them) ---"
for i in $(seq 10); do codeln -X POST "$BASE/api/posts/$CP/comments" -H "$J" -H "Authorization: Bearer $T2" -d "{\"body\":\"race $i\"}" & done | sort | uniq -c
wait
POSTJSON=$(curl -s "$BASE/api/posts/$CP")
echo "post meter now: $(echo "$POSTJSON" | grep -o '"meter":{[^}]*}' | head -1)"
check "comments counter is 10 (skip if you saw 429s)" '"comments":10' "$(echo "$POSTJSON" | grep -o '"comments":[0-9]*' | head -1)"
check "score = 10 comments x3 + 1 like = 31 (skip if you saw 429s)" '"score":31' "$(echo "$POSTJSON" | grep -o '"score":[0-9.-]*' | head -1)"

# ---------------------------------------------------------------- rate limit (last on purpose)
section "RATE LIMITING (restart backend afterwards)"
echo "--- 25 bad logins: expect some 401s and then 429s ---"
for i in $(seq 25); do codeln -X POST "$BASE/api/auth/login" -H "$J" -d '{"identifier":"nobody","password":"wrongwrong"}'; done | sort | uniq -c
TOO=$(code -X POST "$BASE/api/auth/login" -H "$J" -d '{"identifier":"nobody","password":"wrongwrong"}')
check "login is rate limited after repeated failures" 429 "$TOO"

echo
echo "================================"
echo "Passed: $PASS   Failed: $FAIL"
echo "Now delete the test_chk_* users and posts in Atlas, and restart the backend."
