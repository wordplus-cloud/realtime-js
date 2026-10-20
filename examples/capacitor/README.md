# The API demo in Capacitor

The shop web page (`shop/`, the same as in every example) as an app for iOS and Android: the order of Ben, who is in the shop, the chat with “typing…”, calls and the daily meeting, as in a browser. The guide is at [docs.wordplus.cloud/mobile](https://docs.wordplus.cloud/mobile/getting-started/).

The app server is the Express example (`../express`), which signs the app in with a token and answers its address with CORS. Add `capacitor://localhost` and `https://localhost` to your app in WordPlus Cloud.

```bash
npm install
SHOP_SERVER=https://shop.example.com npm run build    # the page into www/, with the worker and the room client
npx cap add ios && npm run ios                         # or: npx cap add android && npm run android
```

| File | |
|---|---|
| `src/app.js` | signing in with the server token, then the shop page with the server routes in full |
| `src/index.html` | the sign-in screen, and where the shop goes |
| `capacitor.config.json` | the app, its web folder, the Android `https` scheme |
