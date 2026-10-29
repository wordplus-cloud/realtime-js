# Getting started

The realtime SDK gives your app rooms that pages join, events with acks, presence, who is online, history, and what your server sends a user. It has two halves:

- **Your server** declares your rooms once, by pattern, says who may join them, call whom and see what, signs it, and sends events to rooms and to users. On Node, that is this package `@wordplus/realtime/server`. On PHP and Laravel, it is `wordplus/realtime-php`, and on Python (Django, FastAPI, Flask) `wordplus-realtime`. All three answer the browser the same way.
- **The browser** connects to WordPlus Cloud, joins rooms, and sends and gets events: `emit`, `emitWithAck`, `volatile`. That is this package `@wordplus/realtime` (and `/react`, `/native`), whatever your server speaks. The Better Messages chat, list of who is online and call screen come with it as ready-made parts, all optional.

Where your server code differs by language, each example below comes in Node, PHP and Python. For [Next.js](nextjs/getting-started.md), [Laravel](https://docs.wordplus.cloud/laravel/getting-started/), [Django](https://docs.wordplus.cloud/django/getting-started/), [FastAPI](https://docs.wordplus.cloud/fastapi/getting-started/), [Express](express/getting-started.md), [PHP](https://docs.wordplus.cloud/php/getting-started/), [Flask](https://docs.wordplus.cloud/flask/getting-started/), [mobile apps](mobile/getting-started.md), [iOS](https://docs.wordplus.cloud/ios/getting-started/) and [Android](https://docs.wordplus.cloud/android/getting-started/), a whole guide each, in its own code, has an example app. This one is for any other stack.

## 1. Your app in WordPlus Cloud

**Apps are in early access.** Ask for it on our [contact form](https://www.wordplus.cloud/contact), and we turn **Apps** on in your WordPlus Cloud account. Until then your account has no Apps page.

In your WordPlus Cloud account, go to **Apps → Add app**. Give the app a name and the addresses its pages are served from, such as `https://app.example.com`, plus `http://localhost:3000` while you develop. Only pages on those addresses may connect.

- **Capacitor:** an app in Capacitor is `capacitor://localhost`.
- **React Native, Swift and Kotlin:** an app with no address to list is let in by itself.

You get the app **key**, which is public because every page carries it, and its **secret**, which only your server has. Also make a **local key** of your own: it seals what goes through WordPlus Cloud, and it never leaves your servers.

```dotenv
WORDPLUS_SITE=s1500000007
WORDPLUS_SECRET=…
WORDPLUS_LOCAL_KEY=…        # openssl rand -hex 32; the same on every server of the app, kept as long as the app
```

## 2. Install

**Node**

```bash
npm install @wordplus/realtime
```

**PHP**

```bash
composer require wordplus/realtime-php      # PHP 8.1 or later, with sodium
```

**Python**

```bash
pip install 'wordplus-realtime[django]'     # or [fastapi] or [flask], or none. uv add works the same
```

Each package carries the browser files, the client as an ES module among them, and its routes serve them (step 3): a PHP or Python app needs no Node, and its page imports the client as it is. With a bundler of your own, `npm install @wordplus/realtime` and import it the same way.

The same packages are on the WordPlus mirror, packages.wordplus.cloud, for a network that cannot reach the registries:

- **npm:** `npm install https://packages.wordplus.cloud/npm/wordplus-realtime-1.0.1.tgz`. Every version is listed in [index.json](https://packages.wordplus.cloud/npm/index.json).
- **Composer:** `composer config repositories.wordplus composer https://packages.wordplus.cloud/composer`, then `composer require` as above.
- **pip and uv:** add `--find-links https://packages.wordplus.cloud/pypi/index.html`.

There is nothing to copy: the worker, which lets the tabs of a user share one connection, the room client for group calls, and the ready-made parts come from your routes, in a folder named after their version, so each release serves its own.

## 3. Your server

Say who your users are, and declare your rooms. Each room is named after what it carries: `order:42` for the updates of order 42. A page that joins it asks your server first, and a rule answers: a function your server declares once for every room whose name fits the pattern `order:{id}`. WordPlus Cloud then holds the page to the answer ([permissions](permissions.md)). This rule says:

1. **Visitors** who are not signed in stay out.
2. **The customer of the order** joins, and nobody else. `ownerOf` is yours, from your data.

And the room keeps its last 20 updates, for a page that reconnects.

**Node**

```ts
// lib/realtime.ts
import { createRealtime } from '@wordplus/realtime/server';

export const realtime = createRealtime( {
    site: process.env.WORDPLUS_SITE!,
    secret: process.env.WORDPLUS_SECRET!,
    localKey: process.env.WORDPLUS_LOCAL_KEY!,
    // Who is asking: their id, or null for nobody.
    user: async ( request ) => ( await getSession( request ) )?.userId ?? null,
    // What others see of them: in presence, calls and the directory.
    profile: async ( user ) => ( { name: await nameOf( user ), avatar: await avatarOf( user ) } ),
} );

// The room of an order, order:42, the last 20 updates kept.
realtime.room( 'order:{id}', { history: 20 }, async ( user, { id } ) => {
    // 1. Visitors stay out.
    if ( user === null ) return false;

    // 2. The customer of the order, and nobody else.
    return ( await ownerOf( id ) ) === user;
} );
```

**PHP**

```php
use WordPlus\Realtime\Realtime;

// In Laravel, the package makes this from config/wordplus-realtime.php: use the Realtime facade, and
// routes/channels.php for rooms (see Laravel).
$realtime = Realtime::fromEnvironment( [
    // What others see of a user: in presence, calls and the directory.
    'profile' => fn ( $user ) => [ 'name' => name_of( $user ), 'avatar' => avatar_of( $user ) ],
] );

// The room of an order, order:42, the last 20 updates kept.
$realtime->room( 'order:{id}', function ( $user, array $p ) {
    // 1. Visitors stay out.
    if ( null === $user ) {
        return false;
    }

    // 2. The customer of the order, and nobody else.
    return owner_of( $p['id'] ) === $user;
}, [ 'history' => 20 ] );
```

**Python**

```python
# realtime.py
from wordplus_realtime import Realtime

realtime = Realtime.from_environment(
    # What others see of a user: in presence, calls and the directory.
    profile=lambda user: {"name": name_of(user), "avatar": avatar_of(user)},
)

# The room of an order, order:42, the last 20 updates kept.
def may_follow_order(user, p):
    # 1. Visitors stay out.
    if user is None:
        return False

    # 2. The customer of the order, and nobody else.
    return owner_of(p["id"]) == user

realtime.room("order:{id}", may_follow_order, history=20)
```

The user is the signed-in user id, a number or a string, or `null` (`None`) for nobody. Next, answer the browser at `/api/realtime/auth`, `/calls` and `/keys`, the WordPlus Cloud [webhook](sending.md#webhooks) at `/webhook`, and the browser files at `/api/realtime/files/…`:

**Node**

```ts
// Next.js: app/api/realtime/[...path]/route.ts, a catch-all, as the files are folders deep
import { realtime } from '@/lib/realtime';
export const GET = realtime.route;
export const POST = realtime.route;

// Express, or any Node server: before express.json(), so the body of a webhook is checked as it was sent
app.use( '/api/realtime', realtime.node( ( req ) => req.user?.id ?? null ) );

// Hono, Remix, SvelteKit, Bun, Deno, workers: any fetch handler, for GET and POST
app.all( '/api/realtime/*', ( c ) => realtime.route( c.req.raw ) );
```

**PHP**

```php
// Laravel: nothing to add. The package routes are /wordplus/realtime/auth, /calls, /keys and /webhook.

// Plain PHP: public/api/realtime.php, with your web server sending /api/realtime/* here
if ( ! $realtime->respondFile() ) {   // the browser files, on GET
    $realtime->respond( basename( parse_url( $_SERVER['REQUEST_URI'], PHP_URL_PATH ) ), current_user_id() );
}
```

**Python**

```python
# Django: "wordplus_realtime.django" in INSTALLED_APPS, then urls.py, for the user of the session
import wordplus_realtime.django as wr
urlpatterns = [path("api/realtime/", include(wr.urls(realtime)))]

# FastAPI and Starlette: current_user(request) gives the user id, or None, and may be async
import wordplus_realtime.fastapi as wr
app.include_router(wr.router(realtime, current_user), prefix="/api/realtime")

# Flask: the routes as a blueprint, the user from Flask-Login or session["user_id"]
import wordplus_realtime.flask
wordplus_realtime.flask.init_app(app, realtime)

# Any other framework: answer_request() for the routes, webhook() for the webhook, file() for the browser files
```

The routes take JSON POSTs, and GETs for the browser files alone. A page on another site cannot send JSON without asking first, and it is never allowed to.

## 4. The browser

```ts
import { connect } from '@wordplus/realtime';

const rt = await connect( { app: 's1500000007' } );   // the worker and the room client from your routes

const order = rt.join( 'order:42' );
order.on( 'updated', ( data ) => refresh( data ) );
order.on( 'error', ( e ) => console.warn( e.code ) );
```

`connect()` first asks your keys route for the user keys and identity. To skip that request, render your server settings for the user into the page, and pass them as they are: `connect( config )`.

**Node**

```ts
const config = await realtime.config( userId );   // in a Next.js server component, then <RealtimeProvider options={ config }>
```

**PHP**

```php
// Laravel: @wordplusRealtime in the layout writes window.wordplusRealtimeConfig, with the CSRF token.
// Plain PHP: in the <head>, the settings and an import map naming @wordplus/realtime the client the routes serve.
<?= $realtime->head( current_user_id() ) ?>
```

**Python**

```python
# In the <head>: the settings, with the CSRF token in Django, and an import map naming @wordplus/realtime the client the
# routes serve. Django: {% load wordplus_realtime %}{% wordplus_realtime %}. Flask: {{ wordplus_realtime() }}.
head = realtime.head(current_user_id())     # any other framework, into the page as it is
```

Then the page connects with them, its module importing the client with no bundler through the import map, or through yours:

```html
<script type="module">
    import { connect } from '@wordplus/realtime';
    const rt = await connect( window.wordplusRealtimeConfig );
</script>
```

## 5. Send

**Node**

```ts
await realtime.to( 'order:42' ).emit( 'updated', { status: 'paid' } );
```

**PHP**

```php
$realtime->to( 'order:42' )->emit( 'updated', [ 'status' => 'paid' ] );   // Laravel: broadcast( new OrderPaid( $order ) )
```

**Python**

```python
realtime.to("order:42").emit("updated", {"status": "paid"})   # await … .aemit(…) from async code
```

Everyone in the room gets `{ status: 'paid' }`, sealed on the way with the room key, and a page that reconnects later gets it from the room history.

![Two browsers side by side: Ann marks order 1042 as shipped on the staff page of the shop, and the order page of Ben shows Shipped at once, without a reload](https://docs.wordplus.cloud/img/apps/orders-live.webp)

## Next

- [Rooms](rooms.md), [presence and who is online](presence.md), [sending from your server](sending.md) and [events from the page](events.md)
- [Calls, group calls and the call screen](calls.md), and [live streams](streams.md)
- [React and React Native](react.md)
- [Encryption and your users](encryption.md)
- [Making the screens your own](customizing.md): their look, a piece of your own, or their whole code
- A whole guide, with an example app, for [Next.js](nextjs/getting-started.md), [Laravel](https://docs.wordplus.cloud/laravel/getting-started/), [Django](https://docs.wordplus.cloud/django/getting-started/), [FastAPI](https://docs.wordplus.cloud/fastapi/getting-started/), [Express](express/getting-started.md), [PHP](https://docs.wordplus.cloud/php/getting-started/), [Flask](https://docs.wordplus.cloud/flask/getting-started/), [mobile apps](mobile/getting-started.md), [iOS](https://docs.wordplus.cloud/ios/getting-started/) and [Android](https://docs.wordplus.cloud/android/getting-started/)
- The server references for [Node](server.md), [PHP](https://docs.wordplus.cloud/apps/php-reference/) and [Python](https://docs.wordplus.cloud/apps/python-reference/), and the [browser reference](browser.md)
- [Errors](errors.md) and [limits](limits.md)

## What to build next

Each use case is a page of its own, with the rules of your server in Node, PHP and Python and the code of the page: [chat](use-cases/chat.md), [who is online](use-cases/online.md), [live updates and notifications](use-cases/live-updates.md), [calls from a button](use-cases/support-calls.md), [team meetings](use-cases/meetings.md), [live streaming](use-cases/live-streaming.md) and the rest in the [use cases](use-cases/overview.md). Three of them build a small app from an empty folder, every file in full.
