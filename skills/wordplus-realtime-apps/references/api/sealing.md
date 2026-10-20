# Sealing

What your app sends through WordPlus Cloud can travel sealed: encrypted and signed with keys only your server and your users hold, so WordPlus Cloud carries it without being able to read or change it. The packages seal by default. With the HTTP API, you seal what you send, and give the browser the keys to open it.

Sealing is your choice for each room: data you send unsealed reaches the pages as it is. A public room, which anyone may join, is better left unsealed.

## The keys

Every key is made from your local key (`WORDPLUS_LOCAL_KEY`, the 64 hex characters as the text they are) and a label:

```text
key = HMAC-SHA256( local key, "wordplus-realtime key v1|" + label )
```

| Label | Seals | Who gets it |
|---|---|---|
| `ch:{room}:{generation}` | the events of a room, its history, and the info of its members | whoever your room rule lets in, with the room token |
| `u:{id}:{generation}` | what you send one user | that user |
| `d:{day}` | what everyone your app knows may read: the directory of your users, and what calls say of the people in them | every signed-in user, for yesterday, today and tomorrow |
| `{kind}:{…}` | values of your own ([below](#your-own-kinds)) | whoever you decide |

`{day}` is the UTC day since 1970: `Math.floor( unix seconds / 86400 )`. `{generation}` starts at 1 ([taking a key back](#taking-a-key-back)). A label is up to 256 characters: a kind of `a-z` and digits, up to 16, then `:` and up to 240 of the characters room names take.

`{id}` in `u:{id}:{generation}` is the user id as it is when each of its characters is one of `A-Z a-z 0-9 _ - @ , . ; :`. Any other character, `=` among them, is written as `=` and the hex of each of its UTF-8 bytes, in capitals: `auth0|5f7c` is `u:auth0=7C5f7c:1`, `ann+news@shop.example` is `u:ann=2Bnews@shop.example:1`. So ids of digits, UUIDs and most ids read as they are, and no two ids share a key. An id of more than 64 characters, or with a space, has none.

The browser keeps a key as an entry, `{label}:{the key in hex}`: that is what the auth and keys routes give it ([your server routes](routes.md)).

## A sealed value

```text
{label}:1.{base64url( nonce + ciphertext + tag )}
```

- **XChaCha20-Poly1305**, with a random 24-byte nonce and the 16-byte tag, the label as associated data.
- **base64url** with no padding.
- **What is sealed** is the JSON text of the data, for an event, or the text itself, for a string of a profile.

To open one, split it at the last `:1.`: what is before is the label, which names the key. A value your server cannot open, because it is not sealed or not yours, is left as it is.

The helpers on [signing requests](signing.md) have `seal()` and `open()` in Node, Python and PHP, and the [Go example](go.md) `Seal` and `Open`. Libraries for XChaCha20-Poly1305: libsodium (`crypto_aead_xchacha20poly1305_ietf`, in PHP built in, in Python PyNaCl), `@noble/ciphers` in JavaScript, `golang.org/x/crypto/chacha20poly1305` (`NewX`) in Go, and libsodium bindings in Ruby, Java, .NET and Rust.

## Sending sealed

Seal the data of an event with the key of each room it goes to, so each sealed room gets its own copy, and what goes to a user with their key:

**Node**

```js
const data = seal(JSON.stringify({ status: 'shipped' }), 'ch:order:42:1');
await wordplus('POST', '/wordplus/realtime/emit', { rooms: ['order:42'], event: 'updated', data });
```

**Python**

```python
data = seal(json.dumps({"status": "shipped"}), "ch:order:42:1")
wordplus("POST", "/wordplus/realtime/emit", {"rooms": ["order:42"], "event": "updated", "data": data})
```

**PHP**

```php
$data = wordplus_seal(json_encode(['status' => 'shipped']), 'ch:order:42:1');
wordplus('POST', '/wordplus/realtime/emit', ['rooms' => ['order:42'], 'event' => 'updated', 'data' => $data]);
```

**Go**

```go
ids, err := app.Emit("order:42", "updated", map[string]any{"status": "shipped"}, true, 20)
```

The page opens it with the key the room token gave it, and the listener gets `{ status: 'shipped' }`. Its webhook events and history come sealed too: open them on your server with `open()`.

**Binary data** travels in JSON as `{ "$b": base64 }`, anywhere in the data, as the browser sends it.

## Taking a key back

When someone must no longer read a room, or what you send a user, move its key to the next generation: `ch:order:42:2`. Keep the newest generation of each room and user where all your servers read it, and for good.

- **The room:** your auth route gives the newest key to those still let in, your keys route answers a label of a newer generation to those who may join, and what you send from then on is sealed with it.
- **With a kick** ([take someone out of a room](https://docs.wordplus.cloud/api/reference/kick/)): kick, then move the key on, so what the room carries next is sealed from them.
- **What was kept before** stays sealed with the key it was sent with, which they hold too.

## Your own kinds

Seal values of your own with labels of a kind of yours, such as `note:7`: any kind but `d`, `u` and `ch`. When a page meets a sealed value it has no key for, it asks your keys route for its label, and you answer the entry when that user may read it.

## Check yours

With the local key of the [test values](test-values.md) and their nonce, sealing their plain text with their label must give their sealed value, and opening it, the plain text:

| Label | Plain | Nonce (hex) | Sealed |
|---|---|---|---|
| `ch:order:42:1` | `{"status":"paid"}` | `0101…01` (24 bytes) | `ch:order:42:1:1.AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBv5DrJzjwIWS1vFQDR7h_W90m8FHeBkw4L58yQUUc0MRG` |
| `d:20371` | `Ann Lee` | `0202…02` | `d:20371:1.AgICAgICAgICAgICAgICAgICAgICAgICdRZaMqU6guwA7nuk_7TsYaN7CoYHwG0` |
| `u:42:1` | the empty string | `0303…03` | `u:42:1:1.AwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDW-5XAbpO78AOtT48vcsItQ` |
