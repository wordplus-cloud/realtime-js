# The API demo in React Native

Sign in as Ben (a customer) in the app and as Ann (support) in a browser: his order follows as she moves it on, both are in the shop, and they chat with “typing…”, in the same rooms as the shop web pages. Expo, with `@wordplus/realtime/native`. Calls and live streams are in `@wordplus/realtime-react-native`, which needs a native build, so they aren't in this example ([calls](https://docs.wordplus.cloud/react-native/calls/)). The guide is at [docs.wordplus.cloud/mobile](https://docs.wordplus.cloud/mobile/getting-started/).

The app server is the Express example (`../express`): run it first, with your app key and secret.

```bash
npm install
EXPO_PUBLIC_SHOP_SERVER=http://localhost:3000 npx expo start     # i: the iOS simulator, a: the Android emulator (10.0.2.2:3000)
```

Sign in as one of the shop people, or open the app with a link that signs in: `exp://<your Mac>:8081/--/?as=42` in Expo Go.

| File | |
|---|---|
| `index.ts` | `react-native-get-random-values`, first: sealing needs it |
| `shop.ts` | signing in with the server token, and `connect()` with the settings it sends |
| `App.tsx` | the screens: the order, who is in the shop, and the chat |
