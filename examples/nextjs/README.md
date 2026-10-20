# The API demo on Next.js

Sign in as Ann (support), Ben (a customer) or Cara (the warehouse), each in a browser of their own: the order of Ben follows as Ann moves it on, Ann and Ben chat with “typing…”, everyone sees who is in the shop and can call them, and all three can meet in the daily meeting room. App Router, server actions, and the React hooks. The guide is at [docs.wordplus.cloud/nextjs](https://docs.wordplus.cloud/nextjs/getting-started/).

```bash
cp .env.example .env.local      # the key and secret of your app, with http://localhost:3000 among its addresses, and a local key
npm install                      # the browser files come from the realtime route: nothing to copy
npm run dev                      # http://localhost:3000
```

| File | |
|---|---|
| `lib/realtime.ts` | the realtime server part, once: credentials, who is asking, profiles, and who may use which channel and call |
| `app/api/realtime/[...path]/route.ts` | the routes of the browser and the webhook, and the browser files, in two lines |
| `app/(shop)/layout.tsx` | the signed-in page layout: `RealtimeProvider` with the user `config()`, and `<CallScreen />` |
| `app/(shop)/shop.tsx` | the client components: `useChannel`, `usePresence`, `useRealtime`, `CallButton`, `RoomButton` |
| `app/actions.ts` | server actions that save, then publish `except` the tab that asked |
| `lib/shop.ts`, `lib/session.ts` | the shop people and data, in memory, and who is signed in (a cookie: use your own sign-in) |
