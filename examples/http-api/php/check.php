<?php
// Checks wordplus.php against the test values of the protocol, then against a realtime server (WORDPLUS_SITE, _SECRET, _API).
require __DIR__.'/wordplus.php';

$v = json_decode(file_get_contents(__DIR__.'/../../../spec/vectors.json'), true);
$live = ['WORDPLUS_SITE' => getenv('WORDPLUS_SITE'), 'WORDPLUS_SECRET' => getenv('WORDPLUS_SECRET'), 'WORDPLUS_LOCAL_KEY' => getenv('WORDPLUS_LOCAL_KEY')];
$out = [];

foreach (['WORDPLUS_SITE' => $v['site'], 'WORDPLUS_SECRET' => $v['secret'], 'WORDPLUS_LOCAL_KEY' => $v['local_key']] as $name => $value) {
    putenv($name.'='.$value);
}
$e = $v['emit'];
$out['signature'] = wordplus_signature($v['secret'], $e['timestamp'], $e['method'], $e['path'], $e['body']) === $e['signature'];
$w = $v['webhook'];
$headers = ['x-wordplus-site' => $v['site'], 'x-wordplus-timestamp' => $w['timestamp'], 'x-wordplus-signature' => $w['signature']];
$out['webhook'] = 'room.occupied' === wordplus_webhook_events($headers, $w['path'], $w['body'], (int) $w['timestamp'])[0]['type'];
$out['sealed'] = true;
foreach ($v['sealed'] as $s) {
    $out['sealed'] = $out['sealed'] && wordplus_seal($s['plain'], $s['label'], hex2bin($s['nonce_hex'])) === $s['sealed'] && wordplus_open($s['sealed']) === $s['plain'];
}

foreach ($live as $name => $value) {
    putenv($name.'='.$value);
}
$sent = wordplus('POST', '/wordplus/realtime/emit', ['rooms' => ['product:1'], 'event' => 'price', 'data' => ['price' => 12]]);
$online = wordplus('GET', '/wordplus/realtime/online?ids=42,34');
$out['live'] = true === $sent['ok'] && 2 === count($online['online']);
echo json_encode($out), "\n";
