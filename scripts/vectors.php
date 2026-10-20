<?php
/**
 * The conformance vectors every server package checks itself against (spec/vectors.json): the keys derived from an
 * app's secret and local key, a call's key, an emit's signature (protocol 3), a room token's
 * signature, a webhook's signature, and values sealed with a fixed nonce. Written with PHP's own hash_hmac and libsodium, as the WordPress package computes them, so a package in
 * another language that matches them answers the browser and the realtime server as WordPress does.
 *
 *     php scripts/vectors.php > spec/vectors.json
 */

$secret = 'test-secret-0123456789abcdef0123456789abcdef0123456789abcdef';
$local  = 'a3f1c2d4e5b697887766554433221100ffeeddccbbaa99887766554433221100';
$site   = 's1500000007';

$derive = static function ( $label ) use ( $local ) {
	return hash_hmac( 'sha256', 'wordplus-realtime key v1|' . $label, $local, true );
};

$base64url = static function ( $data ) {
	return rtrim( strtr( base64_encode( $data ), '+/', '-_' ), '=' );
};

$labels = array( 'd:20371', 'u:42:1', 'u:user_2abc:3', 'u:k7f3q:ben:1', 'ch:order:42:1', 'ch:chat:34:42:2', 'note:7' );
$keys   = array();

foreach ( $labels as $label ) {
	$keys[] = array( 'label' => $label, 'entry' => $label . ':' . bin2hex( $derive( $label ) ) );
}

$timestamp = '1791638400';
$body      = '{"rooms":["orders"],"event":"updated","data":{"status":"paid"}}';
$path      = '/wordplus/realtime/emit';
$publish   = hash_hmac( 'sha256', 'wordplus-realtime publish v1', $secret, true );

// A webhook the realtime server sends the app's server, signed with the webhook key over the app's own path.
$hook_body = '{"events":[{"at":1791638400000,"type":"room.occupied","room":"order:42","id":"0b6f1c9e-8f5d-4c38-9d2b-6a1e2f3c4d5e"}]}';
$hook_path = '/api/realtime/webhook';
$webhook   = hash_hmac( 'sha256', 'wordplus-realtime webhook v1', $secret, true );

$header  = $base64url( '{"alg":"HS256","typ":"JWT"}' );
$payload = $base64url( '{"iss":"' . $site . '","aud":"wordplus-realtime","iat":1791638400,"exp":1791660000,"r":{"order:42":{"h":[20,30]}},"sub":"42"}' );
$token   = hash_hmac( 'sha256', 'wordplus-realtime channels v1', $secret, true );

$sealed = array();

foreach ( array( array( 'ch:order:42:1', '{"status":"paid"}' ), array( 'd:20371', 'Ann Lee' ), array( 'u:42:1', '' ) ) as $i => $case ) {
	list( $label, $plain ) = $case;
	$nonce                 = str_repeat( chr( $i + 1 ), 24 );
	$sealed[]              = array(
		'label'     => $label,
		'plain'     => $plain,
		'nonce_hex' => bin2hex( $nonce ),
		'sealed'    => $label . ':1.' . $base64url( $nonce . sodium_crypto_aead_xchacha20poly1305_ietf_encrypt( $plain, $label, $nonce, $derive( $label ) ) ),
	);
}

// A room's media key and a call's proofs, from the local key, as WordPlus_Realtime_Keys::media() and ::proof() make
// them: a call's rooms' key for its pair, a room's whose prefix encrypts it, the member proof of a call's caller, and
// the proof someone was rung into it.
$media = array();

foreach ( array( 'call|support-42|abcDEF123_-xyz|42|34', 'room|board-7' ) as $what ) {
	$media[] = array( 'what' => $what, 'key' => $base64url( hash_hmac( 'sha256', 'wordplus-realtime media v1|' . $what, $local, true ) ) );
}

$proofs = array();

foreach ( array( 'member|support-42|abcDEF123_-xyz|42|34|42', 'rung|support-42|abcDEF123_-xyz|42|34|56' ) as $what ) {
	$proofs[] = array( 'what' => $what, 'proof' => $base64url( hash_hmac( 'sha256', 'wordplus-realtime proof v1|' . $what, $local, true ) ) );
}

echo json_encode(
	array(
		'about'      => 'Conformance vectors for WordPlus Cloud realtime server packages (scripts/vectors.php). Every package must reproduce each value.',
		'secret'     => $secret,
		'local_key'  => $local,
		'site'       => $site,
		'derived'    => array(
			'channels' => bin2hex( $token ),
			'calls'    => bin2hex( hash_hmac( 'sha256', 'wordplus-realtime calls v1', $secret, true ) ),
			'publish'  => bin2hex( $publish ),
			'webhook'  => bin2hex( $webhook ),
		),
		'keys'       => $keys,
		'profile_hash_key' => bin2hex( $derive( 'profile-hash' ) ),
		'call_key'   => array(
			'id'     => 'abcDEF123_-xyz',
			'caller' => 42,
			'callee' => 34,
			'key'    => hash_hmac( 'sha256', 'wordplus-realtime call key v1|abcDEF123_-xyz|42|34', $local ),
		),
		'media'      => $media,
		'proofs'     => $proofs,
		'emit'       => array(
			'timestamp' => $timestamp,
			'method'    => 'POST',
			'path'      => $path,
			'body'      => $body,
			'signature' => hash_hmac( 'sha256', $timestamp . "\n" . 'POST' . "\n" . $path . "\n" . hash( 'sha256', $body ), $publish ),
		),
		'webhook'    => array(
			'timestamp' => $timestamp,
			'path'      => $hook_path,
			'body'      => $hook_body,
			'signature' => hash_hmac( 'sha256', $timestamp . "\n" . 'POST' . "\n" . $hook_path . "\n" . hash( 'sha256', $hook_body ), $webhook ),
		),
		'jwt'        => array(
			'input'     => $header . '.' . $payload,
			'signature' => $base64url( hash_hmac( 'sha256', $header . '.' . $payload, $token, true ) ),
		),
		'sealed'     => $sealed,
	),
	JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES
) . "\n";
