# Encryption and your users in mobile apps

What your app sends and receives through WordPlus Cloud is sealed, as in a browser: the realtime servers carry it, and keep the history of a room, without being able to read or change it. The app gets its keys from your server only, with the settings it signs in with or from your keys route, and opens everything before your code sees it.

| What | Sealed with | Who can open it |
|---|---|---|
| Events to a room, from your server, an app or a page, and its kept history | the room key | whoever the room rule lets in |
| The `info` of a presence member | the room key | the same |
| Events your server sends a user (`toUser`) | the key of the user | the apps and pages of that user |
| Your users in the directory | the day key | everyone your app knows |
| The media of a call (Capacitor) | a key for that call | its people |

## Sealing needs random numbers

React Native has no `crypto.getRandomValues`, which sealing needs: import `react-native-get-random-values` first, before anything else, in `index.ts`. `connect()` says so if it is missing. The Capacitor web view has it.

## Keys and sign-in

- **Give the app the user keys with its sign-in:** your server `config( user )` has them, and `connect()` takes them as `keys`, so the app connects with no request first.
- **Keys renew by themselves:** the app asks your keys route (`/api/realtime/keys`, with its token) for any it lacks, such as the key of the next day or of a room.
- **Signing out:** close the connection (`rt.close()`). The keys it held are gone with it.
- **Losing access:** when your server moves on the key of a room or of a user, the app no longer opens what comes ([encryption in depth](../encryption.md#when-someone-loses-access)).

## Your users

The app reads the directory as a page does:

```ts
const users = await rt.users( [ 34 ] );   // { 34: { user_id: 34, name: 'Ann', avatar: '…' } }
```

A user is in it once they have connected with an identity your server signed (the app sends theirs with its keys), so show a name of your own until then, and ask again when they come online.
