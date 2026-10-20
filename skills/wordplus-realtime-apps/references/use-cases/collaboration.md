# Editing together

A document, a board or a design several people work on at once: who is in it, where each cursor is, and every change reaching the others as it is made. Cursors go as volatile events, dropped rather than queued and never kept, while changes are kept for a page that reconnects. Changes may be binary, the way editors that merge changes on their own (CRDTs) send them.

## The room

A room for each document, named after it: `doc:7`. Everyone editing joins it, sees who else is in it, and sends their cursor and their changes to the others.

Your server decides who may join. A page that joins asks your server first, and a rule answers: a function your server registers once for every room whose name fits `doc:{id}`. WordPlus Cloud then holds the page to the answer ([permissions](../permissions.md)). This rule lets in those who may edit the document, and the room:

1. **Lists who is in it** to everyone in it.
2. **Keeps the last 100 changes** for a page that reconnects.
3. **Carries only cursors and changes** between the pages, and nothing else.

**Node**

```ts
realtime.room( 'doc:{id}', {
    presence: true,                 // 1. who is in it
    history: 100,                   // 2. the last 100 changes, for a page that reconnects
    emit: [ 'cursor', 'update' ],   // 3. what the pages may send each other
}, async ( user, { id } ) => mayEdit( id, user ) );   // those who may edit the document
```

**PHP**

```php
$realtime->room( 'doc:{id}', function ( $user, array $p ) {
    return may_edit( $p['id'], $user );   // those who may edit the document
}, [
    'presence' => true,                     // 1. who is in it
    'history'  => 100,                      // 2. the last 100 changes, for a page that reconnects
    'emit'     => [ 'cursor', 'update' ],   // 3. what the pages may send each other
] );
```

**Python**

```python
def may_join_doc(user, p):
    return may_edit(p["id"], user)   # those who may edit the document

realtime.room(
    "doc:{id}",
    may_join_doc,
    presence=True,               # 1. who is in it
    history=100,                 # 2. the last 100 changes, for a page that reconnects
    emit=["cursor", "update"],   # 3. what the pages may send each other
)
```

**WordPress**

```php
wordplus_realtime()->room( 'doc:{id}', function ( $user_id, array $p ) {
	return $user_id > 0 && user_can( $user_id, 'edit_post', (int) $p['id'] );   // those who may edit the post
}, array(
	'presence' => true,                          // 1. who is in it
	'history'  => 100,                           // 2. the last 100 changes, for a page that reconnects
	'emit'     => array( 'cursor', 'update' ),   // 3. what the pages may send each other
) );
```

A reader who may look but not edit: the rule answers `{ emit: [ 'cursor' ] }` for them, or `{ readOnly: true }` to send nothing.

## The page

```js
const doc = rt.join( 'doc:7' );

// Who is in it, with your profile name and picture.
doc.on( 'joined', () => showEditors( [ ...doc.members ] ) );
doc.on( 'join', ( { id, info } ) => addEditor( id, info ) );
doc.on( 'leave', ( { id } ) => removeEditor( id ) );

// Cursors: as they move, never queued or kept.
editor.onpointermove = ( e ) => doc.volatile.emit( 'cursor', { x: e.offsetX, y: e.offsetY } );
doc.on( 'cursor', ( { x, y }, meta ) => moveCursorOf( meta.from, x, y ) );

// Changes: binary, checked and kept.
editor.onchange = ( change ) => doc.emit( 'update', { bytes: encode( change ) } );   // a Uint8Array
doc.on( 'update', ( { bytes }, meta ) => apply( decode( bytes ) ) );
```

- **Binary** may be anywhere in the data: an `ArrayBuffer`, a `Uint8Array` or a `Blob`. It arrives as a `Uint8Array`, sealed like the rest.
- **Volatile events** suit anything only its latest value matters for: cursors, selections, who is scrolling where. Up to 50 events a second a connection.
- **A page back from a reconnect** gets the changes it missed, in order, from the history of the room, then the new ones. One that opens later loads the document from your server, which saves the changes it gets by [webhook](../sending.md#webhooks) (`webhook: [ 'update' ]`).
- **Who sent it,** `meta.from`, is the user your server vouched for.

## Your server keeps the document

Name the changes in the webhook of the room, and your server applies them to the copy it keeps, so a page that opens tomorrow starts from the latest:

**Node**

```ts
realtime.room( 'doc:{id}', { presence: true, history: 100, emit: [ 'cursor', 'update' ], webhook: [ 'update' ] }, mayEditRule );
realtime.on( 'update', async ( { room, data, event_id } ) => saveChange( room.slice( 'doc:'.length ), event_id, data.bytes ) );
```

**PHP**

```php
$realtime->on( 'update', fn ( array $e ) => save_change( substr( $e['room'], 4 ), $e['event_id'], $e['data']['bytes'] ) );
```

**Python**

```python
realtime.on("update", lambda e: save_change(e["room"][4:], e["event_id"], e["data"]["bytes"]))
```

**WordPress**

```php
wordplus_realtime()->on( 'update', function ( array $e ) {
	my_save_change( (int) substr( $e['room'], 4 ), $e['event_id'], $e['data']['bytes'] );   // a string of the bytes
} );
```

The bytes arrive as the page sent them: a `Uint8Array` in Node, `bytes` in Python, and a string of the bytes in PHP.

## Variations

- **Comments and mentions:** a second event, `comment`, kept and sent to your server, with a notice to the one mentioned by `realtime.toUser( id ).emit( 'mention', … )` ([live updates](live-updates.md)).
- **A whiteboard on a call:** the same room beside a group call of the same name ([team meetings](meetings.md)).
- **Locks:** your server owns them, and announces each with `realtime.to( 'doc:7' ).emit( 'locked', { block, by } )`.
