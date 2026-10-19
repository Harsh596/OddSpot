#!/usr/bin/env bash
# Oddspot bulk checks, round 2. Run after manualChecks.sh passes.
#
#   bash backend/scripts/manualChecks2.sh                  # standard run
#   AUTH_HEAVY=1 bash backend/scripts/manualChecks2.sh     # + signup races, timing, multi-user concurrency
#
# PASS = good.
# FAIL = a real bug. Fix it.
# GAP  = a design weakness you should close before launch (many are expected today).
#
# Notes
# - Restart the backend before each run: the rate limiter lives in memory.
# - AUTH_HEAVY uses ~30 signups/logins, which the default auth limiter (20 per
#   15 min) will block. Ask the agent for an AUTH_RATE_LIMIT_MAX env override
#   (non-production only) before using it.
# - Creates test_chk_* users and posts. Delete them in Atlas afterwards.
# - Run from the project root so the repo-hygiene section can see git.

BASE="${BASE:-http://localhost:5001}"
J='Content-Type: application/json'
PASS=0; FAIL=0; GAP=0

js()     { node -pe "try{const d=JSON.parse(require('fs').readFileSync(0,'utf8'));$1}catch(e){'PARSE_ERROR'}"; }
code()   { curl -s -o /dev/null -w "%{http_code}" "$@"; }
codeln() { curl -s -o /dev/null -w "%{http_code}\n" "$@"; }
hdrs()   { curl -s -o /dev/null -D - "$@"; }
tm()     { curl -s -o /dev/null -w "%{time_total}" "$@"; }
bearer() { echo "Authorization: Bearer $1"; }
section(){ echo; echo "=== $1 ==="; }
info()   { echo "INFO  $*"; }

matches() { local val="$1"; shift; local pat; for pat in "$@"; do [[ "$val" == $pat ]] && return 0; done; return 1; }
# check NAME "pattern [pattern ...]" ACTUAL    (patterns may use globs, e.g. 20? or [!2]??)
check() { local PATS; IFS=' ' read -r -a PATS <<< "$2"
  if matches "$3" "${PATS[@]}"; then echo "PASS  $1"; PASS=$((PASS+1))
  else echo "FAIL  $1   (expected $2, got $3)"; FAIL=$((FAIL+1)); fi; }
gap() { local PATS; IFS=' ' read -r -a PATS <<< "$2"
  if matches "$3" "${PATS[@]}"; then echo "PASS  $1"; PASS=$((PASS+1))
  else echo "GAP   $1   (wanted $2, got $3)"; GAP=$((GAP+1)); fi; }
# same NAME A B   (exact equality, for values containing spaces)
same() { if [ "$2" = "$3" ]; then echo "PASS  $1"; PASS=$((PASS+1))
  else echo "FAIL  $1   (values differ)"; echo "        A: $2"; echo "        B: $3"; FAIL=$((FAIL+1)); fi; }
sgap() { if [ "$2" = "$3" ]; then echo "PASS  $1"; PASS=$((PASS+1))
  else echo "GAP   $1   (A: $2 | B: $3)"; GAP=$((GAP+1)); fi; }
count_of()  { echo "$1" | awk -v c="$2" '$2==c{print $1}' | head -1; }
count_5xx() { echo "$1" | awk '$2>=500{s+=$1} END{print s+0}'; }

signup() { curl -s -X POST "$BASE/api/auth/signup" -H "$J" \
  -d "{\"username\":\"$1\",\"email\":\"$1@example.com\",\"password\":\"supersecretpassword\"$2}"; }
p() { printf '%s' "{\"title\":\"test_chk post\",\"latitude\":12.97,\"longitude\":77.59,\"city\":\"Bengaluru\",\"country\":\"India\",\"images\":[\"https://example.com/a.jpg\"]$1}"; }
mkpost()   { curl -s -X POST "$BASE/api/posts" -H "$J" -H "$(bearer "$T1")" -d "$1"; }
mkpost2()  { curl -s -X POST "$BASE/api/posts" -H "$J" -H "$(bearer "$T2")" -d "$1"; }
postcode() { code -X POST "$BASE/api/posts" -H "$J" -H "$(bearer "$T1")" -d "$1"; }
vote()     { code -X POST "$BASE/api/posts/$2/vote" -H "$J" -H "$(bearer "$1")" -d "{\"value\":$3}"; }
comment()  { code -X POST "$BASE/api/posts/$2/comments" -H "$J" -H "$(bearer "$1")" -d "{\"body\":\"$3\"}"; }
getpost()  { curl -s "$BASE/api/posts/$1"; }

# ---------------------------------------------------------------- setup
U1="test_chk_$RANDOM"; U2="test_chk_$RANDOM"
S1=$(signup "$U1" ''); S2=$(signup "$U2" '')
T1=$(echo "$S1" | js 'd.token'); T2=$(echo "$S2" | js 'd.token')
if [ -z "$T1" ] || [ "$T1" = "undefined" ] || [ "$T1" = "PARSE_ERROR" ]; then
  echo "Setup failed: could not sign up test users (rate limited? backend down?)."
  echo "Restart the backend and try again."; exit 1
fi

# ---------------------------------------------------------------- A. bodies
section "BODY AND CONTENT-TYPE EDGE CASES"
BADLOGIN='{"identifier":"test_chk_nobody","password":"wrongwrong1"}'
check "charset suffix on content-type is accepted" 401 "$(code -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json; charset=utf-8' -d "$BADLOGIN")"
check "upper-case content-type is accepted" 401 "$(code -X POST "$BASE/api/auth/login" -H 'Content-Type: Application/JSON' -d "$BADLOGIN")"
check "multipart body refused cleanly" "400 415" "$(code -X POST "$BASE/api/auth/login" -F 'a=b')"
check "form-encoded body refused cleanly" "400 415" "$(code -X POST "$BASE/api/auth/login" -H 'Content-Type: application/x-www-form-urlencoded' -d 'a=b')"
check "GET with a JSON body does not break" 200 "$(code -X GET "$BASE/api/posts/nearby?lat=12.97&lng=77.59" -H "$J" -d '{"x":1}')"
for B in '[]' 'null' '"text"' '5' ''; do
  check "top-level JSON '$B' on post create" 400 "$(postcode "$B")"
done
DEEP=$(node -e "console.log('{\"a\":'.repeat(4000)+'1'+'}'.repeat(4000))")
check "4000-level nested JSON does not crash" 400 "$(postcode "$DEEP")"
PP='{"title":"test_chk proto","latitude":12.97,"longitude":77.59,"city":"Bengaluru","country":"India","images":["https://example.com/a.jpg"],"__proto__":{"role":"admin","isAdmin":true},"constructor":{"prototype":{"polluted":"yes"}}}'
check "__proto__ and constructor keys do not break post create" "201 400" "$(postcode "$PP")"
check "server alive after nesting and prototype attempts" 404 "$(code "$BASE/api/nope")"
check "emoji and accented title accepted" 201 "$(postcode "$(p ',"title":"test_chk 🙂 ñ 日本語"')")"
check "NUL character in title refused" 400 "$(postcode "$(p ',"title":"bad\u0000title"')")"
check "lone surrogate in title does not 500" "[24]??" "$(postcode "$(p ',"title":"test_chk \ud800 x"')")"
gap "zero-width-only title refused" 400 "$(postcode "$(p ',"title":"\u200b\u200b\u200b"')")"
gap "control characters refused or stripped" 400 "$(postcode "$(p ',"title":"test_chk \u0007\u001b bell"')")"

# ---------------------------------------------------------------- B. HTTP edges
section "HTTP EDGE CASES"
LONGSEG=$(printf 'a%.0s' $(seq 10000)); LONGQ=$(printf 'a%.0s' $(seq 20000))
check "10 KB path" "404 414 431 400" "$(code "$BASE/api/$LONGSEG")"
check "20 KB query string" "200 400 414 431" "$(code "$BASE/api/posts/nearby?lat=12.97&lng=77.59&x=$LONGQ")"
check "invalid percent-encoding in path" "400 404" "$(code -g "$BASE/api/posts/%ff")"
check "invalid percent-encoding in query" "200 400" "$(code -g "$BASE/api/posts/nearby?lat=12.97&lng=77.59&q=%ff")"
check "encoded path traversal" "400 404" "$(code --path-as-is "$BASE/api/posts/..%2f..%2f..%2fetc%2fpasswd")"
check "double slash path" "200 404" "$(code "$BASE//api/posts/nearby?lat=12.97&lng=77.59")"
check "trailing slash on feed" "200 301 308 404" "$(code "$BASE/api/posts/nearby/?lat=12.97&lng=77.59")"
check "TRACE is not echoed" "[!2]??" "$(code -X TRACE "$BASE/api/nope")"
check "PUT on posts collection" "404 405" "$(code -X PUT "$BASE/api/posts" -H "$J" -H "$(bearer "$T1")" -d '{}')"
check "PATCH on posts collection" "404 405" "$(code -X PATCH "$BASE/api/posts" -H "$J" -H "$(bearer "$T1")" -d '{}')"
check "HEAD on nearby feed" 200 "$(code -I "$BASE/api/posts/nearby?lat=12.97&lng=77.59")"
check "20 KB request header" "431 400 000" "$(code -H "X-Big: $LONGQ" "$BASE/api/nope")"
check "12 KB bearer token" "401 431 400" "$(code "$BASE/api/auth/me" -H "Authorization: Bearer $(printf 'a%.0s' $(seq 12000))")"
check "duplicate Authorization headers do not 500" "[24]??" "$(code "$BASE/api/auth/me" -H 'Authorization: Bearer bad' -H "$(bearer "$T1")")"
jsonct() { hdrs "$@" | grep -ci '^content-type: application/json'; }
check "401 body is JSON" 1 "$(jsonct "$BASE/api/auth/me")"
check "404 body is JSON" 1 "$(jsonct "$BASE/api/nope")"
check "malformed-JSON 400 body is JSON" 1 "$(jsonct -X POST "$BASE/api/auth/login" -H "$J" -d '{bad')"
BIGFILE=$(mktemp); (printf '{"body":"'; head -c 200000 /dev/zero | LC_ALL=C tr '\0' 'a'; printf '"}') > "$BIGFILE"
check "413 body is JSON" 1 "$(jsonct -X POST "$BASE/api/posts" -H "$J" -H "$(bearer "$T1")" --data-binary @"$BIGFILE")"
rm -f "$BIGFILE"
CC=$(hdrs "$BASE/api/auth/me" -H "$(bearer "$T1")" | grep -ci '^cache-control:.*\(no-store\|private\|no-cache\)')
gap "authenticated responses are marked non-cacheable" 1 "$CC"
T=$(tm "$BASE/api/posts/nearby?lat=12.97&lng=77.59"); info "nearby latency: ${T}s"
check "nearby answers in under 2 s" yes "$(node -pe "$T<2?'yes':'no'")"
T=$(tm "$BASE/api/posts/nearby?lat=12.97&lng=77.59&page=999999999")
check "huge page number is fast" yes "$(node -pe "$T<2?'yes':'no'")"
check "huge page number does not 500" "[24]??" "$(code "$BASE/api/posts/nearby?lat=12.97&lng=77.59&page=999999999")"

# ---------------------------------------------------------------- C. location data
section "LOCATION DATA INTEGRITY"
check "latitude 1e999 (Infinity) refused" 400 "$(postcode "$(p ',"latitude":1e999')")"
gap "Null Island (0,0) refused" 400 "$(postcode "$(p ',"latitude":0,"longitude":0')")"
R=$(mkpost "$(p ',"latitude":12.971234567890123,"longitude":77.594567890123456')")
gap "coordinates rounded to 6 decimals" yes "$(echo "$R" | js "d.location.coordinates.every(c=>(String(c).split('.')[1]||'').length<=6)?'yes':'no'")"
C1=$(mkpost "$(p ',"city":"bengaluru"')" | js 'd.place.city')
C2=$(mkpost "$(p ',"city":"  BENGALURU "')" | js 'd.place.city')
sgap "city spelling variants map to one stored value" "$C1" "$C2"
gap "unknown country name refused" 400 "$(postcode "$(p ',"country":"Narnia"')")"
check "nearby at the north pole / antimeridian" 200 "$(code "$BASE/api/posts/nearby?lat=90&lng=180")"
check "nearby at the south pole / antimeridian" 200 "$(code "$BASE/api/posts/nearby?lat=-90&lng=-180")"
check "limit=0 does not 500" "[24]??" "$(code "$BASE/api/posts/nearby?lat=12.97&lng=77.59&limit=0")"
check "limit=1.5 does not 500" "[24]??" "$(code "$BASE/api/posts/nearby?lat=12.97&lng=77.59&limit=1.5")"
check "limit=-3 does not 500" "[24]??" "$(code "$BASE/api/posts/nearby?lat=12.97&lng=77.59&limit=-3")"
postcode "$(p ',"title":"test_chk dup spot"')" >/dev/null
gap "second identical post at the same spot refused or flagged" "400 409 429" "$(postcode "$(p ',"title":"test_chk dup spot"')")"
HID=$(mkpost "$(p ',"title":"test_chk hidden2","hideExact":true,"latitude":12.97123,"longitude":77.59456')")
HID_ID=$(echo "$HID" | js 'd._id')
check "single-post endpoint exists (GET /api/posts/:id)" 200 "$(code "$BASE/api/posts/$HID_ID")"
check "single-post endpoint does not leak exact coords" 0 "$(getpost "$HID_ID" | grep -c '77.59456\|12.97123')"
check "comments endpoint does not leak exact coords" 0 "$(curl -s "$BASE/api/posts/$HID_ID/comments" | grep -c '77.59456\|12.97123')"

# ---------------------------------------------------------------- D. business logic
section "METER AND BUSINESS LOGIC"
VP=$(mkpost2 "$(p ',"title":"test_chk victim"')" | js 'd._id')
for i in 1 2 3 4 5 6 7 8; do comment "$T1" "$VP" "spam $i" >/dev/null; done
SC=$(getpost "$VP" | grep -o '"score":[0-9.-]*' | head -1 | cut -d: -f2)
info "meter score after one user posted 8 comments: ${SC:-none}"
gap "one user's 8 comments add at most 9 meter points" yes "$(node -pe "(${SC:-99})<=9?'yes':'no'")"
gap "author cannot vote on their own post" "400 403" "$(vote "$T2" "$VP" 1)"
FLIP=$(for i in $(seq 20); do v=$(( (i % 2) * 2 - 1 )); codeln -X POST "$BASE/api/posts/$VP/vote" -H "$J" -H "$(bearer "$T1")" -d "{\"value\":$v}"; done | sort | uniq -c)
info "20 sequential like/dislike flips from T1:"; echo "$FLIP"
check "no 500 during vote flip-flopping" 0 "$(count_5xx "$FLIP")"
for i in 1 2 3 4; do mkpost2 "$(p ",\"title\":\"test_chk seq $i\"")" >/dev/null; done
PAR=$(for i in 1 2 3 4 5; do codeln -X POST "$BASE/api/posts" -H "$J" -H "$(bearer "$T2")" -d "$(p ",\"title\":\"test_chk par $i\"")" & done | sort | uniq -c)
wait
info "5 parallel posts from T2:"; echo "$PAR"
check "no 500 under parallel post creation" 0 "$(count_5xx "$PAR")"
ACC=$(count_of "$PAR" 201); ACC=${ACC:-0}
EXP=$((5 + ACC))
check "stats.posts matches posts created (expected $EXP)" "\"posts\":$EXP" "$(curl -s "$BASE/api/auth/me" -H "$(bearer "$T2")" | grep -o '"posts":[0-9]*' | head -1)"

# ---------------------------------------------------------------- E. JWT
section "JWT CONTENTS"
b64() { node -pe "Buffer.from(require('fs').readFileSync(0,'utf8').trim(),'base64url').toString()"; }
JH=$(echo "$T1" | cut -d. -f1 | b64); JP=$(echo "$T1" | cut -d. -f2 | b64)
info "JWT payload fields: $(echo "$JP" | js "Object.keys(d).join(',')")"
check "JWT algorithm is HS256" HS256 "$(echo "$JH" | js 'd.alg')"
check "JWT has an expiry" yes "$(echo "$JP" | js "d.exp?'yes':'no'")"
check "JWT lifetime is at most 7 days" yes "$(echo "$JP" | js "(d.exp-d.iat)<=604800?'yes':'no'")"
check "JWT payload carries no email" 0 "$(echo "$JP" | grep -ci email)"
gap "JWT lifetime is 1 day or less (use refresh tokens)" yes "$(echo "$JP" | js "(d.exp-d.iat)<=86400?'yes':'no'")"
gap "JWT carries no role (role changes must apply at once)" 0 "$(echo "$JP" | grep -ci '"role"')"

# ---------------------------------------------------------------- F. heavy
if [ "${AUTH_HEAVY:-0}" = "1" ]; then
  section "IDENTITY AND AUTH RACES (AUTH_HEAVY)"
  UP=$(echo "$U1" | tr 'a-z' 'A-Z')
  check "username uniqueness is case-insensitive" 409 "$(code -X POST "$BASE/api/auth/signup" -H "$J" -d "{\"username\":\"$UP\",\"email\":\"fresh$RANDOM@example.com\",\"password\":\"supersecretpassword\"}")"
  check "email uniqueness is case-insensitive" "400 409" "$(code -X POST "$BASE/api/auth/signup" -H "$J" -d "{\"username\":\"test_chk_x$RANDOM\",\"email\":\"$(echo "$U1" | tr 'a-z' 'A-Z')@EXAMPLE.COM\",\"password\":\"supersecretpassword\"}")"
  check "login with email works" 200 "$(code -X POST "$BASE/api/auth/login" -H "$J" -d "{\"identifier\":\"$U1@example.com\",\"password\":\"supersecretpassword\"}")"
  check "homoglyph (Cyrillic) username refused" 400 "$(code -X POST "$BASE/api/auth/signup" -H "$J" -d "{\"username\":\"t\\u0435st_chk_h$RANDOM\",\"email\":\"h$RANDOM@example.com\",\"password\":\"supersecretpassword\"}")"
  U3="test_chk_$RANDOM"; PW72=$(printf 'A%.0s' $(seq 72))
  RS=$(code -X POST "$BASE/api/auth/signup" -H "$J" -d "{\"username\":\"$U3\",\"email\":\"$U3@example.com\",\"password\":\"${PW72}XYZ\"}")
  if [ "$RS" = "400" ]; then echo "PASS  passwords over 72 bytes are refused (bcrypt truncates them)"; PASS=$((PASS+1))
  else check "password over 72 bytes is not silently truncated" 401 "$(code -X POST "$BASE/api/auth/login" -H "$J" -d "{\"identifier\":\"$U3\",\"password\":\"${PW72}123\"}")"; fi
  EA=$(curl -s -X POST "$BASE/api/auth/login" -H "$J" -d '{"identifier":"test_chk_nobody_x","password":"wrongwrong1"}')
  EB=$(curl -s -X POST "$BASE/api/auth/login" -H "$J" -d "{\"identifier\":\"$U1\",\"password\":\"wrongwrong1\"}")
  same "login error identical for unknown user and wrong password" "$EA" "$EB"
  avg() { local s=0 t; for i in 1 2 3 4; do t=$(tm -X POST "$BASE/api/auth/login" -H "$J" -d "$1"); s=$(node -pe "$s+$t"); done; node -pe "($s/4).toFixed(4)"; }
  AU=$(avg '{"identifier":"test_chk_nobody_x","password":"wrongwrong1"}')
  AW=$(avg "{\"identifier\":\"$U1\",\"password\":\"wrongwrong1\"}")
  info "login timing: unknown user ${AU}s, wrong password ${AW}s"
  gap "login timing similar for unknown vs wrong password (under 1.5x)" yes "$(node -pe "Math.max($AU,$AW)/Math.min($AU,$AW)<1.5?'yes':'no'")"

  UR="test_chk_r$RANDOM"
  OUT=$(for i in 1 2 3 4 5; do codeln -X POST "$BASE/api/auth/signup" -H "$J" -d "{\"username\":\"$UR\",\"email\":\"$UR@example.com\",\"password\":\"supersecretpassword\"}" & done | sort | uniq -c)
  wait; info "5 parallel signups with one username:"; echo "$OUT"
  N=$(count_of "$OUT" 201); check "exactly one parallel signup wins" 1 "${N:-0}"
  check "no 500 in signup race" 0 "$(count_5xx "$OUT")"

  section "MULTI-USER CONCURRENCY (AUTH_HEAVY)"
  S3=$(signup "test_chk_$RANDOM" ''); S4=$(signup "test_chk_$RANDOM" ''); S5=$(signup "test_chk_$RANDOM" '')
  T3=$(echo "$S3" | js 'd.token'); T4=$(echo "$S4" | js 'd.token'); T5=$(echo "$S5" | js 'd.token')
  VP2=$(mkpost "$(p ',"title":"test_chk multi-vote"')" | js 'd._id')
  VOUT=$(for tok in "$T2" "$T3" "$T4" "$T5"; do codeln -X POST "$BASE/api/posts/$VP2/vote" -H "$J" -H "$(bearer "$tok")" -d '{"value":1}' & done | sort | uniq -c)
  wait; echo "$VOUT"
  check "no 500 in multi-user voting" 0 "$(count_5xx "$VOUT")"
  PJ=$(getpost "$VP2")
  check "4 parallel users produce exactly 4 likes" '"likes":4' "$(echo "$PJ" | grep -o '"likes":[0-9]*' | head -1)"
  info "score after 4 likes: $(echo "$PJ" | grep -o '"score":[0-9.-]*' | head -1)"
  RP=$(mkpost "$(p ',"title":"test_chk report race"')" | js 'd._id')
  ROUT=$(for tok in "$T2" "$T3" "$T4"; do codeln -X POST "$BASE/api/posts/$RP/report" -H "$J" -H "$(bearer "$tok")" -d '{"reason":"unsafe_or_private"}' & done | sort | uniq -c)
  wait; echo "$ROUT"
  check "no 500 in parallel reports" 0 "$(count_5xx "$ROUT")"
  check "three parallel reports flip hideExact on" 1 "$(getpost "$RP" | grep -c '"hideExact":true')"
  RP2=$(mkpost "$(p ',"title":"test_chk dup report"')" | js 'd._id')
  DOUT=$(for i in 1 2 3 4 5 6 7 8; do codeln -X POST "$BASE/api/posts/$RP2/report" -H "$J" -H "$(bearer "$T5")" -d '{"reason":"spam"}' & done | sort | uniq -c)
  wait; echo "$DOUT"
  N=$(count_of "$DOUT" 201); check "8 parallel reports from one user: exactly one accepted" 1 "${N:-0}"
  check "no 500 in duplicate-report race" 0 "$(count_5xx "$DOUT")"
else
  info "Skipped AUTH_HEAVY sections (set AUTH_HEAVY=1 to include them)."
fi

# ---------------------------------------------------------------- G. repo hygiene
section "REPO HYGIENE (from the project root)"
if git rev-parse --git-dir >/dev/null 2>&1; then
  check "no .env files tracked" 0 "$(git ls-files | grep -cE '(^|/)\.env$|(^|/)\.env\.(local|production|development)$')"
  check "no Atlas credentials in tracked files" 0 "$(git grep -IlE 'mongodb\+srv://[^:/<[:space:]]+:[^@<[:space:]]+@' -- . ':(exclude)*.example' ':(exclude)*.md' | wc -l | tr -d ' ')"
  check "node_modules not tracked" 0 "$(git ls-files | grep -c 'node_modules/')"
  check "no private keys tracked" 0 "$(git grep -IlE 'BEGIN (RSA |EC )?PRIVATE KEY' | wc -l | tr -d ' ')"
  check "no fallback JWT secret in code" 0 "$(git grep -nE 'JWT_SECRET.*\|\|' -- backend | wc -l | tr -d ' ')"
else
  info "not a git repository here: skipped."
fi
for d in backend frontend; do
  if [ -d "$d" ]; then
    ( cd "$d" && npm audit --omit=dev --audit-level=high >/dev/null 2>&1 ); AUD=$?
    check "npm audit: no high/critical issues in $d (needs internet)" 0 "$AUD"
  fi
done

echo
echo "================================"
echo "Passed: $PASS   Failed: $FAIL   Gaps: $GAP"
echo "FAIL = fix now.  GAP = close before launch."
echo "Delete test_chk_* users and posts in Atlas, then restart the backend."
[ "$FAIL" -eq 0 ]
