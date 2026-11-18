# Samples with mistakes planted in them

test/samples.test.ts compiles this page as it compiles the docs, and every mistake below must be found on its line.
Nothing else here may be: the app's own names, a route's body, markup and a marked fragment are taken as they are.

```ts
import { createRealtime } from '@wordplus/realtime/server';

const realtime = createRealtime();
app.get( '/api/call-token', async ( req, res ) => {
    const me = userOf( req );
    if ( ! await mayCall( me, req.query.to ) ) return res.sendStatus( 403 );
    res.json( { token: await realtime.callTokn( me, req.query.to ) } );
} );
```

```tsx
import { useRoomz } from '@wordplus/realtime/react';
```

```tsx
const rt = useRealtime();
return <button onClick={ () => rt.call( 'support:{pair}', { to: 42 } ) }>Call</button>;
```

```js
const rt = await connect( { app: 's1500000007', endpoints: '/api/realtime' } );
rt.join( 'order:7' ).on( 'updated', ( data ) => showStatus( data.status ) );
```

```tsx
<CallScreen />
<Chat room="chat:34:42" />
```

```ts fragment
createRealtime( { …, nothing: true } );
```
