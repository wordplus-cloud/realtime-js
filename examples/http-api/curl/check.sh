#!/usr/bin/env bash
# Checks wordplus.sh against the test values of the protocol, then against a realtime server (WORDPLUS_SITE, _SECRET, _API).
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
source "$here/wordplus.sh"
vectors="$here/../../../spec/vectors.json"
value() { node -e "process.stdout.write(String(require(process.argv[1]).$1))" "$vectors"; }

live_secret=$WORDPLUS_SECRET
WORDPLUS_SECRET=$(value secret)
signature=$(wordplus_signature "$(value emit.timestamp)" "$(value emit.method)" "$(value emit.path)" "$(value emit.body)")
[ "$signature" = "$(value emit.signature)" ] && vector=true || vector=false
WORDPLUS_SECRET=$live_secret

sent=$(wordplus POST /wordplus/realtime/emit '{"rooms":["product:1"],"event":"price","data":{"price":12}}')
online=$(wordplus GET '/wordplus/realtime/online?ids=42,34')
live=$(node -e 'const [s, o] = process.argv.slice(1).map(JSON.parse); process.stdout.write(String(s.ok === true && o.online.length === 2))' "$sent" "$online")
echo "{\"signature\":$vector,\"live\":$live}"
