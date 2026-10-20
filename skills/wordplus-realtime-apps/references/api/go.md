# A server in Go

An app server in Go on WordPlus Cloud, written from these pages alone, with no package of ours: its own rules, the routes the browser SDK asks, sending sealed events through the HTTP API, the webhook, calls, group calls and live streams. Take it as it is, or as the map for a server in your own language.

It is checked as the packages are: its test runs it against the [test values](test-values.md), and the end-to-end checks of the SDK run the browser SDK in real browsers against it and a realtime server, on every route it answers and every request it sends.

## The files

| File | |
|---|---|
| [`go.mod`](https://docs.wordplus.cloud/api/examples/go/go.mod) | the module: Go 1.23, with `golang.org/x/crypto` for XChaCha20-Poly1305 |
| [`wordplus/wordplus.go`](https://docs.wordplus.cloud/api/examples/go/wordplus/wordplus.go) | the protocol: signing, the HTTP API, keys and sealing, every token, and the webhook |
| [`wordplus/wordplus_test.go`](https://docs.wordplus.cloud/api/examples/go/wordplus/wordplus_test.go) | its test against the test values |
| [`main.go`](https://docs.wordplus.cloud/api/examples/go/main.go) | the example app: its rules and its routes |

```bash
go test ./wordplus/
WORDPLUS_SITE=… WORDPLUS_SECRET=… WORDPLUS_LOCAL_KEY=… go run .
```

## The package

| | |
|---|---|
| `App{ Site, Secret, LocalKey, API }` | your app |
| `Request( method, path, body )` | a signed request to the HTTP API, its JSON answer, or a `Refusal` with its status and code |
| `Signature( timestamp, method, path, body )` | the signature of a request ([signing requests](signing.md)) |
| `Emit( room, event, data, sealed, history )`, `EmitToUser( user, event, data )` | send, sealed with the key of the room or of the user |
| `Key( label )`, `Entry( label )`, `Seal( text, label, nonce )`, `SealJSON( value, label )`, `Open( value )` | [sealing](sealing.md) |
| `RoomGrant( user, rooms, denied )`, `PublicGrant( patterns )` | what the auth route answers, and the public grants ([room tokens](routes.md#room-tokens)) |
| `Keys( user, profile )`, `Identity( user, profile, hidden )` | what the keys route answers with nothing asked ([keys and identity](routes.md#keys-and-identity)) |
| `Line( user )`, `CallSide( call, id, role, type, me, other, info )`, `GroupCall( … )` | what the calls route answers ([calls](routes.md#calls)) |
| `StreamGrant( Stream{ … } )` | a live stream grant ([live streams](routes.md#live-streams)) |
| `Webhook( header, path, body )` | a webhook checked, its events with their data opened ([webhooks](webhooks.md)) |

## The example app

`main.go` has rules as an app would:

| | |
|---|---|
| `order:{id}` | a sealed room only its customer joins, keeping its last 10 events |
| `chat:{a}:{b}` | a sealed presence room for its two people, where pages send `message`, `typing` and `read`, and the webhook gets `message` |
| `product:{id}` | a public room anyone joins, with a live count, from the public grant |
| `support:{a}:{b}` | calls between its two people |
| `meeting:{id}` | a group call for anyone signed in, encrypted end to end |
| `show:{id}` | a live stream user 42 hosts, and everyone else watches, a visitor too |

Its routes answer the browser at `/api/realtime/`: `config` (the settings, which a page passes to `connect()`), `auth`, `keys`, `calls` and `webhook`.

The auth route, as the rules decide it:

```go
func auth(w http.ResponseWriter, r *http.Request, user string) {
	var body struct {
		Rooms []string `json:"rooms"`
	}
	if json.NewDecoder(r.Body).Decode(&body) != nil || body.Rooms == nil {
		w.WriteHeader(400)
		reply(w, map[string]string{"code": "bad_request"})
		return
	}
	allowed, denied := map[string]wordplus.Room{}, map[string]string{}
	for _, room := range body.Rooms {
		if rule, refusal := roomRule(room, user); rule != nil {
			allowed[room] = *rule
		} else {
			denied[room] = refusal
		}
	}
	reply(w, app.RoomGrant(user, allowed, denied))
}
```

Sending, sealed with the key of the room, kept for pages that reconnect:

```go
ids, err := app.Emit("order:42", "updated", map[string]any{"status": "shipped"}, true, 10)
```

The webhook:

```go
func webhook(w http.ResponseWriter, r *http.Request) {
	raw, _ := io.ReadAll(r.Body)
	events, err := app.Webhook(r.Header, r.URL.RequestURI(), raw)
	if err != nil {
		w.WriteHeader(401)
		reply(w, map[string]string{"code": err.Error()})
		return
	}
	heardMu.Lock()
	heard = append(heard, events...)
	heardMu.Unlock()
	w.WriteHeader(204)
}
```

The example takes the user from an `X-User` header, so it runs on its own. A real app takes them from its session.

## In another language

Port `wordplus.go`: it is about 600 lines, with the standard HMAC-SHA256, SHA-256, base64url and JSON of any language, and XChaCha20-Poly1305 from libsodium or its like. Check it against the test values first, then against WordPlus Cloud.
