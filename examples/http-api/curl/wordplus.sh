#!/usr/bin/env bash
# The HTTP API of WordPlus Cloud from a shell: a signed request with curl and OpenSSL 3. Source it, then:
#
#   wordplus POST /wordplus/realtime/emit '{"rooms":["order:42"],"event":"updated","data":{"status":"paid"}}'
#   wordplus GET '/wordplus/realtime/online?ids=42,34'
#
# with WORDPLUS_SITE and WORDPLUS_SECRET set, and WORDPLUS_API when it is not https://rest.wordplus.cloud.

# Hex HMAC-SHA256, under the publish key, of timestamp, method, path and the body hash.
wordplus_signature() {
    local timestamp=$1 method=$2 path=$3 body=$4 key hash
    key=$(printf %s 'wordplus-realtime publish v1' | openssl dgst -sha256 -hmac "$WORDPLUS_SECRET" -r | cut -d' ' -f1)
    hash=$(printf %s "$body" | openssl dgst -sha256 -r | cut -d' ' -f1)
    printf '%s\n%s\n%s\n%s' "$timestamp" "$method" "$path" "$hash" | openssl dgst -sha256 -mac HMAC -macopt "hexkey:$key" -r | cut -d' ' -f1
}

# A signed request: wordplus METHOD PATH [JSON BODY]. Prints the JSON answer.
wordplus() {
    local method=$1 path=$2 body=${3-} timestamp data=()
    timestamp=$(date +%s)
    [ -n "$body" ] && data=(--data-binary "$body")
    curl -sS -X "$method" "${WORDPLUS_API:-https://rest.wordplus.cloud}$path" \
        -H 'Content-Type: application/json' \
        -H "X-WordPlus-Site: $WORDPLUS_SITE" \
        -H "X-WordPlus-Timestamp: $timestamp" \
        -H "X-WordPlus-Signature: $(wordplus_signature "$timestamp" "$method" "$path" "$body")" \
        ${data[@]+"${data[@]}"}
}
