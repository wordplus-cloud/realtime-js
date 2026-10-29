# Deploying a Next.js app

On Vercel, or any host that runs Next.js: nothing realtime is kept on your servers, so serverless functions, edge functions and several instances all work as they are.

## Its settings

| | |
|---|---|
| `WORDPLUS_SITE`, `WORDPLUS_SECRET` | from your app in WordPlus Cloud |
| `WORDPLUS_LOCAL_KEY` | yours: kept as long as the app |

On Vercel, set them in the project Environment Variables, the same for Production and Preview. Never as `NEXT_PUBLIC_`: the key reaches pages through `config()`, which is what it is for.

`next build` needs none of them, so a Docker image or a CI build has no secret baked in: they are read when the app serves its first request, which fails with the name of what is missing.

## Its addresses

Add every address your pages are served from to the app in WordPlus Cloud: scheme, host and port exactly (`https://shop.example.com`, `https://www.shop.example.com`). A page anywhere else is refused with `wrong_origin`. Up to 20 addresses an app. If your server hears [webhooks](sending.md#webhooks), set their address there too.

An app is for one website and its subdomains, beside the addresses you develop on: `http://localhost:3000`, one on your own network, or a name ending in `.test` or `.local`. A preview at its own `*.vercel.app` address counts as another website, so give the branch you test a subdomain of yours (in Vercel, a domain assigned to a Git branch), such as `https://staging.shop.example.com`, and add it to the app like any other address. The Preview environment then takes the same settings as Production.

## Its files

`realtime-worker.js`, `realtime-rooms.min.js`, `realtime-rooms-e2ee.worker.js`, `realtime-ui.min.js` and `realtime-ui-streams.min.js` come from the realtime route, `GET /api/realtime/files/{version}/{name}`, so each deployment serves the ones its package came with, from the origin of the page itself, where a browser runs a worker. They are in the server bundle, and each answer is kept for a year as immutable: the edge caches them, and a new version is a new folder.

## Rendering

- **`config()` is per user:** render it in a dynamic layout or page (one that reads cookies is), never in a statically generated one, which would hand the keys of one user to everyone.
- **Pages without a user** may connect with `config( null )`: the rooms declared `public: true` are theirs, with grants that may be cached with the page.

## Several servers

Any function or instance answers any request, and sending works from all of them. Only moving keys on keeps a little state, the key generations, in a store they all share, such as Redis: serverless functions share no memory of their own ([encryption](encryption.md#when-someone-loses-access)).

## Content Security Policy

If your app sends one (in `middleware.ts` or `next.config` headers), let pages reach the WordPlus Cloud servers (the realtime servers, which may move a connection to another of them, and the media servers for group calls) and run the workers from your own address:

```text
connect-src 'self' https://*.wordplus.cloud wss://*.wordplus.cloud;
worker-src 'self';
```

## Clocks

Your server signs what it sends with the time. Hosts keep theirs synced. A clock more than 5 minutes off has its emits refused with `stale_signature`.
