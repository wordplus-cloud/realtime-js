# Webhooks

WordPlus Cloud tells your server what happens in your app: the events pages send that your rules ask to hear, rooms filling and emptying, people joining presence rooms, users coming online and going offline, and live streams going live and ending.

## Where they go

Set the address on your app page in your WordPlus Cloud account, such as `https://shop.example.com/api/realtime/webhook`. It must be a public HTTPS address: WordPlus Cloud never calls into a private network. On your computer, a tunnel gives your server one ([while you develop](../sending.md#while-you-develop)).

## The request

```http
POST /api/realtime/webhook HTTP/1.1
Content-Type: application/json
X-WordPlus-Site: s1500000123
X-WordPlus-Timestamp: 1791638400
X-WordPlus-Signature: 7471cbdc121b23bfe8bb75b94442c65413c1f338089ae53baf3e6e5e9eee27d5

{"events":[{"id":"0b6f1c9e-8f5d-4c38-9d2b-6a1e2f3c4d5e","at":1791638400000,"type":"room.occupied","room":"order:42"}]}
```

- **Batched:** the events of about a second come together, up to 100 in a request.
- **At least once:** each event has its `id`. Keep the ids you took for a day, and drop a repeat.
- **Answer 2xx** once you took it, within 10 seconds. Any other answer, or none, and the batch is sent again 30 seconds later, then after 2, 10 and 30 minutes, and 1, 2, 4 and 8 hours, for 24 hours at most.
- **In order within a batch,** not across retries: a late batch may come after a newer one.

## Checking it

A webhook is signed as a request to the API is, with the webhook key, `HMAC-SHA256( secret, "wordplus-realtime webhook v1" )`:

1. `X-WordPlus-Site` is your app key.
2. `X-WordPlus-Timestamp` is within 5 minutes of your clock.
3. `X-WordPlus-Signature` is the hex HMAC-SHA256, under the webhook key, of `"{timestamp}\nPOST\n{path with query}\n{sha256 hex of the body}"`: the path your address has, and the body exactly as it came, before any parsing.

Then take the events. The helpers on [signing requests](signing.md) do all three:

**Node**

```js
import { createServer } from 'node:http';
import { webhookEvents } from './wordplus.mjs';

createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', async () => {
        try {
            for (const event of webhookEvents(req.headers, req.url, raw)) await handle(event);
            res.writeHead(204).end();
        } catch (error) {
            res.writeHead(401).end();
        }
    });
}).listen(8080);
```

**Python** (Flask, or the raw body and headers of any framework)

```python
from wordplus import webhook_events

@app.post("/api/realtime/webhook")
def realtime_webhook():
    headers = {name.lower(): value for name, value in request.headers.items()}
    try:
        events = webhook_events(headers, request.full_path.rstrip("?"), request.get_data())
    except ValueError:
        return "", 401
    for event in events:
        handle(event)
    return "", 204
```

**PHP**

```php
require 'wordplus.php';

$headers = array_change_key_case(getallheaders(), CASE_LOWER);
try {
    $events = wordplus_webhook_events($headers, $_SERVER['REQUEST_URI'], file_get_contents('php://input'));
} catch (RuntimeException $e) {
    http_response_code(401);
    exit;
}
foreach ($events as $event) {
    handle($event);
}
http_response_code(204);
```

**Go**

```go
http.HandleFunc("/api/realtime/webhook", func(w http.ResponseWriter, r *http.Request) {
    raw, _ := io.ReadAll(r.Body)
    events, err := app.Webhook(r.Header, r.URL.RequestURI(), raw)
    if err != nil {
        w.WriteHeader(401)
        return
    }
    for _, event := range events {
        handle(event)
    }
    w.WriteHeader(204)
})
```

## The events

| `type` | Its fields | When |
|---|---|---|
| `emit` | `room`, `event`, `data`, `from`, `event_id` | a page sent an event that the room token names in `w` (the room rule `webhook`). `from` is the user who sent it, `event_id` the id the pages saw. `data` is sealed in a sealed room: open it with the key of the room ([sealing](sealing.md)) |
| `room.occupied`, `room.vacated` | `room` | the first one in, the last one out |
| `member.joined`, `member.left` | `room`, `user` | in a presence room |
| `user.online`, `user.offline` | `user` | a user connected anywhere in your app, and gone 10 seconds after their last connection |
| `stream.live`, `stream.ended` | `stream`, `started_at`, `ended_at` | a live stream went live and ended, the times in milliseconds |
| `call.ended` | `call`, `call_id`, `from`, `to`, `media`, `started_at`, `answered_at`, `ended_at`, `seconds`, `reason` | a call between two people ended. `seconds` is the time they talked, from the answer to the end, 0 for a call never answered. Its `id` is the same however often it is sent |
| `group.joined`, `group.left` | `call`, `user`, `media`, `joined_at`, and on leaving `left_at` and `seconds` | someone joined or left a group call, by the name your rules gave it |
| `stream.joined`, `stream.left` | `stream`, `user`, `role`, `watch`, `joined_at`, and on leaving `left_at` and `seconds` | a signed-in person started or stopped watching or presenting while the stream was live: `stream.joined` as they open it live or it goes live with them on it, `stream.left` as they leave or it ends, `seconds` the live time alone. `watch` and `joined_at` pair the two, and going live again starts another pair. Visitors are not told |
| `webhook.test` | | your server asked for one (`POST /wordplus/realtime/webhooks/test`), to see its webhook take it |

Every event also has `id` and `at` (milliseconds).

- **Check what matters:** an `emit` comes from a page, so it says what the page sent. `from` is who sent it, as your server vouched for them.
- **Keep the conversation** from `emit`: save each message by its `event_id`, and a page reconnecting later reads it from your own route.

## Check yours

The [test values](test-values.md) have a signed webhook: with their secret, its signature over their path and body at their timestamp must be theirs, `7471cbdc121b23bfe8bb75b94442c65413c1f338089ae53baf3e6e5e9eee27d5`.

Then on your server, once it is set up:

```bash
wordplus POST /wordplus/realtime/webhooks/test    # {"ok":true,"delivered":true,"status":204}
wordplus GET /wordplus/realtime/webhooks          # the last 100 tries, the newest first
```

Each delivery has the id of its batch, the HTTP status your server answered (0 with `error` when nothing answered: `timeout`, `unreachable`, `not_public`), when it is tried again (`next_at`), and whether it may be sent again now (`resendable`). `POST /wordplus/realtime/webhooks/{id}/resend` sends a batch your server did not take again, the same events with the same ids, while it is tried again and for three days after ([reference](https://docs.wordplus.cloud/api/reference/usage-and-webhooks/)).
