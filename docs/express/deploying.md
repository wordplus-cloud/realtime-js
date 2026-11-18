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

`realtime-worker.js`, `realtime-rooms.min.js`, `realtime-rooms-e2ee.worker.js`, `realtime-ui.min.js`, and `realtime-ui-streams.min.js` with `hls.light.min.js`, which its player loads where a browser plays no HLS of its own, come from the realtime routes, `GET /api/realtime/files/{version}/{name}`, from the address of your pages, where a browser runs a worker, and each release serves the ones its package came with. Each answer is kept for a year as immutable, so a CDN in front of your app keeps them too, and a new version is a new folder.

## Another address

A page served from another address than your routes, such as a single-page app at `https://app.shop.example.com` asking an API at `https://api.shop.example.com`, names your routes in full and sends its user in a header, as a browser sends no cookie to another address:

```js
const rt = await connect( { app: 's1500000007', endpoint: 'https://api.shop.example.com/api/realtime', headers: { Authorization: 'Bearer ' + token } } );
```

- **In WordPlus Cloud,** add the page address to the app, as every other ([its addresses](#its-addresses)).
- **Your user function** (`realtime.node( user )`) reads that header and checks the token, as the rest of your API does. A page can send anything here, and whoever your function believes is who they are.
- **CORS comes from your framework, not this package,** so a page never gets the header twice, which a browser refuses. For the page address alone:
  - the address back exactly in `Access-Control-Allow-Origin`, with `Vary: Origin`
  - `POST` for the routes and `GET` for the files, as a group call fetches its encryption worker from there, and the `OPTIONS` asked before them
  - `Content-Type` and the headers the page sends (`Authorization` above)
  - no `Access-Control-Allow-Credentials`, as the page sends no cookie
- **The worker** at another address is one a browser never starts, so each tab of that page connects by itself.

```js
import cors from 'cors';   // npm install cors

// Before the realtime routes.
app.use( '/api/realtime', cors( { origin: [ 'https://app.shop.example.com' ], methods: [ 'GET', 'POST' ], allowedHeaders: [ 'Content-Type', 'Authorization' ], maxAge: 600 } ) );
app.use( '/api/realtime', realtime.node( ( req ) => userOfToken( req.get( 'authorization' ) ) ) );
```

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
