# Deploying an Express app

## Its settings

| | |
|---|---|
| `WORDPLUS_SITE`, `WORDPLUS_SECRET` | from your app in WordPlus Cloud: the same on every server |
| `WORDPLUS_LOCAL_KEY` | yours: the same on every server, kept as long as the app |

Keep the secret and the local key out of your repository and out of every page. The key reaches pages through `realtime.config()`, which is what it is for.

## Its addresses

Add every address your pages are served from to the app in WordPlus Cloud: scheme, host and port exactly (`https://shop.example.com`, `https://www.shop.example.com`). A page anywhere else is refused with `wrong_origin`. Up to 20 addresses an app. If your server hears [webhooks](sending.md#webhooks), set their address there too.

## Its files

`realtime-worker.js`, `realtime-rooms.min.js`, `realtime-rooms-e2ee.worker.js`, `realtime-ui.min.js` and `realtime-ui-streams.min.js` come from the realtime routes, `GET /api/realtime/files/{version}/{name}`, from the address of your pages, where a browser runs a worker, and each release serves the ones its package came with. Each answer is kept for a year as immutable, so a CDN in front of your app keeps them too, and a new version is a new folder.

## Behind a proxy

```js
app.set( 'trust proxy', 1 );   // so the session cookie is Secure behind a TLS-terminating proxy
app.use( session( { /* … */ cookie: { secure: true, sameSite: 'lax' } } ) );
```

The routes need the session cookie: serve them from the address of the pages, as above.

## Several servers

Nothing realtime is kept on your servers: any of them answers any request, and sending works from all of them. Only moving keys on keeps a little state, the generations, in a store they share ([encryption](encryption.md#when-someone-loses-access)).

## Content Security Policy

If your pages send one, let them reach the WordPlus Cloud servers (the realtime servers, which may move a connection to another of them, and the media servers for group calls) and run the workers from your own address:

```text
connect-src 'self' https://*.wordplus.cloud wss://*.wordplus.cloud;
worker-src 'self';
```

## Clocks

Your server signs what it sends with the time. Keep its clock synced (NTP): one more than 5 minutes off has its emits refused with `stale_signature`.
