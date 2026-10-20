# The mobile example apps

The API demo as two apps, in the package `examples/react-native` (Expo) and `examples/capacitor`, with the [Express example](https://docs.wordplus.cloud/express/example/) as their server: sign in as Ben in the app and as Ann in a browser, and they see each other.

![The order page of Ben in the React Native app on an iPhone: order 1042 shipped and live, Ann and Ben in the shop, and their chat with the new message from Ann and “Ann is typing…”, from her browser](https://docs.wordplus.cloud/img/mobile/example.webp)

| | React Native | Capacitor |
|---|---|---|
| The order of Ben, as Ann moves it on | `join()` on the `order:{id}` room | the shop page, `shop/shop.js` |
| Who is in the shop | the `shop` presence room | `<online-list>`, with a call button for each |
| The chat | messages emitted with an ack and kept, typing as volatile events | `<chat-room>`, with reactions and read ticks |
| Calls and the daily meeting | later (they need a WebRTC module) | the call screen, as in a browser |
| The order timeline, the mugs and who is looking, the webhooks | | the shop page, as in a browser |

**Try it online** at [mobile.docs.wordplus.cloud](https://mobile.docs.wordplus.cloud/): the Capacitor app in a phone, signed in as Ben, beside the page of Ann in the same shop, a shop of your own for a day, whose calls end after 10 minutes and meetings after 15. Swift and Kotlin apps have guides of their own: [iOS](https://docs.wordplus.cloud/ios/getting-started/) and [Android](https://docs.wordplus.cloud/android/getting-started/). Under each card, **See the code** shows the parts of this example that make it, on the server and on the page: the lines between `#region demo: <card>` and `#endregion` in its files.

## The server

```bash
cd examples/express
cp .env.example .env       # the key and secret of your app, and a local key
npm install && npm start   # http://localhost:3000, with POST /api/token for the apps
```

It signs an app in with `POST /api/token`, answers its requests by the token (`Authorization: Bearer …`), and answers the Capacitor address with CORS. Add `capacitor://localhost` and `https://localhost` to your app in WordPlus Cloud for Capacitor.

## React Native

```bash
cd examples/react-native
npm install
EXPO_PUBLIC_SHOP_SERVER=http://localhost:3000 npx expo start     # i: the iOS simulator, a: the Android emulator (10.0.2.2:3000)
```

Sign in as one of the shop people, or open the app with a link that signs in: `exp://<your Mac>:8081/--/?as=42` in Expo Go.

| File | |
|---|---|
| `index.ts` | `react-native-get-random-values`, first |
| `shop.ts` | signing in with the server token, and `connect()` from `@wordplus/realtime/native` with its settings |
| `App.tsx` | the screens: the order, who is in the shop, and the chat |

## Capacitor

```bash
cd examples/capacitor
npm install
SHOP_SERVER=https://shop.example.com npm run build    # the shop page into www/, with the worker, the room client and the components
npx cap add ios && npm run ios                         # or android
```

| File | |
|---|---|
| `src/app.js` | signing in with the server token (or, in the demo phone, the token its address brings), then the shop page with the server routes in full |
| `shop/` | the shop page, the same as in every example |
| `capacitor.config.json` | the app, its web folder, the Android `https` scheme |

The Capacitor app is among the examples `@wordplus/realtime` checks on every change, with Ben in the app and Ann and Cara in browsers.
