<?php
// The HTTP API of WordPlus Cloud from PHP with no package of ours: a signed request, a webhook checked, a value sealed.
// PHP 8.1 or later, with curl and sodium.

/** Hex HMAC-SHA256, under the publish key, of timestamp, method, path and the body hash. */
function wordplus_signature(string $secret, string $timestamp, string $method, string $path_with_query, string $body): string
{
    $key = hash_hmac('sha256', 'wordplus-realtime publish v1', $secret, true);

    return hash_hmac('sha256', $timestamp."\n".$method."\n".$path_with_query."\n".hash('sha256', $body), $key);
}

/** A signed request to the realtime server: its JSON answer, or a RuntimeException with the code it refused with. */
function wordplus(string $method, string $path, ?array $body = null): array
{
    $api = getenv('WORDPLUS_API') ?: 'https://rest.wordplus.cloud';
    $raw = null === $body ? '' : json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    $timestamp = (string) time();

    $curl = curl_init(rtrim($api, '/').$path);
    curl_setopt_array($curl, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'X-WordPlus-Site: '.getenv('WORDPLUS_SITE'),
            'X-WordPlus-Timestamp: '.$timestamp,
            'X-WordPlus-Signature: '.wordplus_signature(getenv('WORDPLUS_SECRET'), $timestamp, $method, $path, $raw),
        ],
    ] + (null === $body ? [] : [CURLOPT_POSTFIELDS => $raw]));
    $answer = json_decode((string) curl_exec($curl), true) ?? [];
    $status = curl_getinfo($curl, CURLINFO_RESPONSE_CODE);

    if (empty($answer['ok'])) {
        throw new RuntimeException('WordPlus Cloud refused it: '.($answer['error'] ?? 'http_'.$status), $status);
    }

    return $answer;
}

/** The events of a webhook, its signature checked: the body as it came, and the path it came to with its query. */
function wordplus_webhook_events(array $headers, string $path_with_query, string $raw, ?int $now = null): array
{
    $timestamp = $headers['x-wordplus-timestamp'] ?? '';
    $given = $headers['x-wordplus-signature'] ?? '';
    if (($headers['x-wordplus-site'] ?? '') !== getenv('WORDPLUS_SITE') || !ctype_digit($timestamp) || '' === $given) {
        throw new RuntimeException('missing_signature');
    }
    if (abs(($now ?? time()) - (int) $timestamp) > 300) {
        throw new RuntimeException('stale_signature');
    }

    $key = hash_hmac('sha256', 'wordplus-realtime webhook v1', getenv('WORDPLUS_SECRET'), true);
    $expected = hash_hmac('sha256', $timestamp."\nPOST\n".$path_with_query."\n".hash('sha256', $raw), $key);
    if (!hash_equals($expected, $given)) {
        throw new RuntimeException('bad_signature');
    }

    return json_decode($raw, true)['events'];
}

/** The key a label names: HMAC-SHA256 of the label under the local key, the 64 hex characters as they are. */
function wordplus_key(string $label): string
{
    return hash_hmac('sha256', 'wordplus-realtime key v1|'.$label, getenv('WORDPLUS_LOCAL_KEY'), true);
}

/** A value sealed with the key a label names: "{label}:1.{base64url(nonce, ciphertext and tag)}". */
function wordplus_seal(string $text, string $label, ?string $nonce = null): string
{
    $nonce ??= random_bytes(SODIUM_CRYPTO_AEAD_XCHACHA20POLY1305_IETF_NPUBBYTES);
    $sealed = sodium_crypto_aead_xchacha20poly1305_ietf_encrypt($text, $label, $nonce, wordplus_key($label));

    return $label.':1.'.rtrim(strtr(base64_encode($nonce.$sealed), '+/', '-_'), '=');
}

/** A value this app sealed, opened; null for one it did not seal or that changed on the way. */
function wordplus_open(string $value): ?string
{
    $at = strrpos($value, ':1.');
    if (false === $at || 0 === $at) {
        return null;
    }
    $label = substr($value, 0, $at);
    $raw = base64_decode(strtr(substr($value, $at + 3), '-_', '+/'));
    $plain = sodium_crypto_aead_xchacha20poly1305_ietf_decrypt(substr($raw, 24), $label, substr($raw, 0, 24), wordplus_key($label));

    return false === $plain ? null : $plain;
}
