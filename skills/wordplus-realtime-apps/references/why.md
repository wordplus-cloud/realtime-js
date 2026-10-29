# Why WordPlus Cloud

Laravel, Django, FastAPI, Express and Flask can run websockets of their own, on your servers. WordPlus Cloud runs them for you, and adds what a websocket alone does not do:

- **No websocket servers to keep.** Your own has to hold every connection, grow past one machine and stay up through your deploys. The WordPlus Cloud servers hold them, more of them start as your app grows, and a page moves from one to another without a drop.
- **Any host for your server.** Your server only signs and sends, so it runs anywhere, serverless and edge functions included, which cannot hold a connection open themselves.
- **Nothing lost on a reconnect.** A room keeps its last events, and a page that comes back gets what it missed, in order, before what comes next.
- **Who is online across your app,** presence in every room, and live counts of who is looking.
- **Calls, not only messages.** Calls between two people and group calls need relays and media servers besides a socket. WordPlus Cloud runs both, its media servers in several regions. A call between two people goes direct, through our relays or through our media servers, and none of these takes credits.
- **Sealed end to end.** What your app sends through rooms, and the media of calls between two people, travel encrypted with keys only your server and your users hold. A group call is too when its rule says so, and a live stream, for everyone watching, is encrypted on the way ([encryption](encryption.md#calls-and-live-streams)).
- **Parts ready to use, all optional.** The Better Messages call screen, chat and list of who is online, as React components or elements for any page, and agent skills that teach AI coding agents the SDK.
- **In the style of your framework.** In Laravel it is a broadcasting driver, so `broadcast()` and `routes/channels.php` stay as they are. In Next.js, a route handler and a provider. In Django, FastAPI, Express and Flask, a router and a few rules.

Start with the guide for your framework: [Next.js](nextjs/getting-started.md), [Laravel](https://docs.wordplus.cloud/laravel/getting-started/), [Django](https://docs.wordplus.cloud/django/getting-started/), [FastAPI](https://docs.wordplus.cloud/fastapi/getting-started/), [Express](express/getting-started.md), [PHP](https://docs.wordplus.cloud/php/getting-started/) or [Flask](https://docs.wordplus.cloud/flask/getting-started/), or [any other stack](getting-started.md).
