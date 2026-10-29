# Deploying mobile apps

## Your app in WordPlus Cloud

| | |
|---|---|
| React Native | nothing to add: it has no address |
| Capacitor on iOS | `capacitor://localhost` |
| Capacitor on Android | `https://localhost` (`http://localhost` with `androidScheme: 'http'`) |
| The Ionic web view | `ionic://localhost` |

Use the app you have for your website, so the apps and the site share rooms and users. The key and secret stay on your server. The app gets what it needs from your server `config()` when it signs in.

## Your server address

Builds point at your server in full (`https://shop.example.com`), over HTTPS: iOS refuses plain HTTP to anything but the device itself, and Android from API 28. While you develop on a simulator, `localhost` reaches your Mac from the iOS simulator, and `10.0.2.2` from the Android emulator.

## CORS for Capacitor

A Capacitor app page is on its own address, so your server answers it across origins, for the realtime routes and anything else the app asks:

```js
// Express
const APPS = [ 'capacitor://localhost', 'https://localhost' ];
app.use( ( req, res, next ) => {
    if ( ! APPS.includes( req.get( 'origin' ) ) ) return next();
    res.set( {
        'Access-Control-Allow-Origin': req.get( 'origin' ),
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Realtime-Tab',
        'Access-Control-Allow-Methods': 'GET, POST',
        Vary: 'Origin',
    } );
    req.method === 'OPTIONS' ? res.sendStatus( 204 ) : next();
} );
```

In Laravel, `config/cors.php` with those `allowed_origins`. In Django, `django-cors-headers`. In FastAPI, `CORSMiddleware`. React Native needs none: it is not a page.

## The app files (Capacitor)

`realtime-worker.js`, `realtime-rooms.min.js`, `realtime-rooms-e2ee.worker.js`, `realtime-ui.min.js` and `realtime-ui-streams.min.js` go in the app web folder (`npx wordplus-realtime copy www/`) in every build, so the app carries the ones its package came with. A page runs a worker only from its own address, so `connect()` names them there: `worker: '/realtime-worker.js'` and `rooms: '/realtime-rooms.min.js'` ([getting started](getting-started.md#4-capacitor-and-ionic)).

## Content Security Policy

If the page of a Capacitor app sends one, as a `<meta http-equiv="Content-Security-Policy">` in its `index.html`, let it reach your server and the WordPlus Cloud servers (the realtime servers, which may move a connection to another of them, and the media servers for calls), and run the workers from the files of the app:

```text
connect-src 'self' https://shop.example.com https://*.wordplus.cloud wss://*.wordplus.cloud;
worker-src 'self';
```

React Native has none to set.
