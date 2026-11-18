# Angular

`@wordplus/realtime/angular`, for Angular 20 and up: rooms, presence, who is online, typing, what your server sends a user, calls, group calls and live streams in standalone components, as signals. The ready-made screens come as elements, which any component of yours puts in its template.

- **A provider and functions:** `provideRealtime()` goes in your application's providers, and each `inject…()` function is called where `inject()` is, in a field initializer or the constructor of a component, a directive or a service.
- **Signals:** each function answers signals, which a template reads as `chat.error()`. What changes goes in as a signal, an input or a function, and a change follows it: `injectRoom( () => 'order:' + this.id() )`.
- **Let go by themselves:** each lets go of what it holds as its component goes: the room, the call, the stream, the people it watched.
- **Nothing connects on the server:** a page Angular renders there draws each room and call idle, and joins once it is in the browser.
- **No NgModule and no compiler step:** they are plain functions on `@angular/core`, and work with zone.js or without it.

## Install

```bash
npm install @wordplus/realtime
```

**Your server** declares the rooms and says who may join them, in the routes at `/api/realtime`: the same server as for any page, whichever you have ([Express](express/getting-started.md#3-your-server), [Next.js](nextjs/getting-started.md), [Laravel](https://docs.wordplus.cloud/laravel/getting-started/), [Django](https://docs.wordplus.cloud/django/getting-started/), [FastAPI](https://docs.wordplus.cloud/fastapi/getting-started/)). Add the address your app is served from to your app in WordPlus Cloud: `https://app.example.com`, and `http://localhost:4200` while you develop.

**While you develop,** `ng serve` passes `/api` on to your server, so the routes are on the app's own address and get its cookies:

```json
{
    "/api": { "target": "http://localhost:3000", "secure": false }
}
```

Save it as `proxy.conf.json` and name it in `angular.json`, under `serve`'s `options`: `"proxyConfig": "proxy.conf.json"`.

**With server rendering** (`ng new --ssr`), `src/server.ts` is an Express app: mount the routes there, before the line that hands every request to Angular.

```ts
app.use( '/api/realtime', realtime.node( ( req ) => req.session.userId ?? null ) );
```

## The connection

```ts
// src/app/app.config.ts
import { type ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { provideRealtime } from '@wordplus/realtime/angular';

export const appConfig: ApplicationConfig = {
    providers: [ provideZonelessChangeDetection(), provideRealtime() ],
};
```

It connects once for the application, as it starts, and closes as it ends. With no options it asks your routes at `/api/realtime` which app this is and who the user is, as `connect()` does.

- **Options** are those of `connect()`, or your server's `config()` for the signed-in user. As a function, it runs where `inject()` works and may read signals, so it can take them from a service of yours, and a change connects again, as a user signs in or out: `provideRealtime( () => inject( Session ).realtime() )`.
- **Part of the app only:** put it in the `providers` of a route instead, and it connects as that route is first opened.
- **Its routes elsewhere:** `provideRealtime( { endpoint: 'https://api.example.com/realtime' } )`, and that server answers your app's address with CORS.

## The functions

| | |
|---|---|
| `provideRealtime( options? )` | the connection, in your application's providers |
| `injectRealtime()` | the connection (`Realtime`), or `null` until it is up |
| `injectConnection()` | `{ connected, error }`: whether it is up, and why it could not connect or was refused (`{ code }`: `wrong_origin`, `over_capacity`, `keys_failed` …), cleared once it connects. It comes back by itself |
| `injectRoom( name, handlers?, { with }? )` | joins while the component is on the page. Each handler gets `( data, meta )`. Gives `{ state, error, members, count, room, emit( event, data ), emitWithAck( event, data ) }`. `null` joins nothing. `{pair}` in the name is this user and `with`. `injectRoom<Events, Info>( … )` names what its events carry ([events](events.md#what-an-event-carries)) |
| `injectPresence( name )` | the members of a presence room, `[ { id, info } ]` |
| `injectOnline( ids, { count }? )` | `{ online, lastSeen, count }`: who of `ids` is online, by id, and with `count` how many are across your app |
| `injectProfiles( ids )` | the names and pictures of these users, by id, from your [directory](encryption.md#your-users) |
| `injectTyping( room, event? )` | who is typing in a room: the ids of those who sent `event` (`typing` by default) with `{ on: true }` |
| `injectUserEvent( event, handler )` | what your server sends this user (`toUser( id ).emit()`), while the component is on the page |
| `injectCalls()` | `{ calls, incoming, error }`: the page's calls once loaded, and those ringing |
| `injectCall()` | a call between two on a screen of your own: `{ call, state, remote, peer, endReason, group, error, camera, microphone, screen, start( token ), answer( incoming ), end(), setCamera( on ), setMicrophone( on ), setScreenShare( on ) }` |
| `injectGroupCall( name, getToken )` | `{ group, state, people, self, error, camera, microphone, screen, setCamera( on ), setMicrophone( on ), setScreenShare( on ) }` |
| `injectStream( name, getToken? )` | `{ stream, state, error }`: a live stream, and everything its screen draws as it changes |
| `injectTrack( element, track )` | shows a track on a `<video>` or an `<audio>` |
| `injectStreamVideo( element, stream )` | shows a live stream on a `<video>` |

Every field they give is a signal, read only. Called anywhere else, such as in `ngOnInit()`, each says it needs an injection context, as `inject()` does: call it in a field initializer, or inside `runInInjectionContext( injector, () => … )`. Used with no `provideRealtime()`, each stays idle and says so once in the console.

### A room

```ts
// src/app/order.ts
import { Component, input, signal } from '@angular/core';
import { injectRoom } from '@wordplus/realtime/angular';

@Component( {
    selector: 'app-order',
    template: `
        <p>Order {{ id() }}: {{ status() }}</p>
        @if ( order.state() === 'failed' ) {
            <p>This order is not yours to follow: {{ order.error() }}</p>
        }
    `,
} )
export class Order {
    readonly id = input.required<number>();
    readonly status = signal( 'open' );

    // Moves to the room of another order as `id` changes, and leaves it as the component goes.
    readonly order = injectRoom( () => `order:${ this.id() }`, {
        updated: ( data: { status: string } ) => this.status.set( data.status ),
    } );
}
```

`state` is `joining`, `joined`, `failed`, `left`, or `idle` with no room, and `error` says why it failed: `forbidden`, `expired`, `no_rule`, `kicked` … A room your server sends to needs nothing more ([sending](sending.md)). Several components may join one room: it is left when the last of them goes.

**Sending, typing, and a room between two:**

```ts
// src/app/chat.ts
import { Component, input, signal } from '@angular/core';
import { injectRoom, injectTyping } from '@wordplus/realtime/angular';

type ChatEvents = { message: { text: string }; typing: { on: boolean } };

@Component( {
    selector: 'app-chat',
    template: `
        @for ( line of lines(); track $index ) {
            <p>{{ line }}</p>
        }
        @if ( typing().length > 0 ) {
            <p>Typing…</p>
        }
        <input #box (input)="chat.room()?.volatile?.emit( 'typing', { on: box.value !== '' } )" (keydown.enter)="send( box )">
    `,
} )
export class Chat {
    readonly other = input.required<number>();
    readonly lines = signal<string[]>( [] );

    // chat:34:42 for user 42 talking to 34, the smaller id first, so both of them name the same room.
    readonly chat = injectRoom<ChatEvents>( 'chat:{pair}', {
        message: ( data ) => this.lines.update( ( lines ) => [ ...lines, data.text ] ),
    }, { with: this.other } );
    readonly typing = injectTyping( this.chat );

    async send( box: HTMLInputElement ): Promise<void> {
        const text = box.value;
        box.value = '';
        this.chat.room()?.volatile.emit( 'typing', { on: false } );
        await this.chat.emitWithAck( 'message', { text } );
        this.lines.update( ( lines ) => [ ...lines, text ] );
    }
}
```

`emit()` sends and waits for nothing, `emitWithAck()` resolves once the room took it, and `room().volatile` sends what may be lost, such as typing ([events from the page](events.md)). `injectTyping()` leaves out this page's user, and drops someone 4 seconds after their last word unless they say more, or at once when they send a message.

### Who is here, and who is online

```ts
// src/app/lobby.ts
import { Component, computed } from '@angular/core';
import { injectOnline, injectPresence, injectProfiles } from '@wordplus/realtime/angular';

@Component( {
    selector: 'app-lobby',
    template: `
        <h2>In the lobby: {{ members().length }}</h2>
        @for ( member of members(); track member.id ) {
            <p>{{ member.info.name }}</p>
        }
        <p>{{ profiles()[ 34 ]?.name ?? 'Ann' }} is {{ status.online()[ 34 ] ? 'online' : 'away' }}</p>
        <p>{{ status.count() }} online across the app</p>
    `,
} )
export class Lobby {
    readonly members = injectPresence<{ name: string }>( 'lobby' );
    readonly ids = computed( () => [ 34, ...this.members().map( ( member ) => member.id ) ] );
    readonly status = injectOnline( this.ids, { count: true } );
    readonly profiles = injectProfiles( [ 34 ] );
}
```

- `injectPresence()` is who is in a presence room now, with the `info` your server's rule gave each ([presence](presence.md)).
- `injectOnline()` follows whoever you name, anywhere in your app, and `lastSeen` says when each who is away was last seen. A new array of the same ids changes nothing. It lets go of the ids as the component goes: one that no other `injectOnline()` of the page still follows is let go five seconds later, so a list drawn again doesn't follow and let go of the same people.
- `injectProfiles()` is the names and pictures your server's `profile()` gives, as they arrive.

### What your server sends a user

```ts
// src/app/notices.ts
import { Component, signal } from '@angular/core';
import { injectUserEvent } from '@wordplus/realtime/angular';

@Component( {
    selector: 'app-notices',
    template: `@if ( notice() ) { <p role="status">{{ notice() }}</p> }`,
} )
export class Notices {
    readonly notice = signal<string | null>( null );

    constructor() {
        // realtime.toUser( 42 ).emit( 'notice', { text } ) on your server: every tab and app of the user hears it.
        injectUserEvent( 'notice', ( data: { text: string } ) => this.notice.set( data.text ) );
    }
}
```

### Calls

A call starts with a token from a route of yours, which says whether this user may call that one ([who may call](calls.md#who-may-call)). The ready-made call screen needs none of this: [the elements](#the-ready-made-screens) below ring and draw it. These are for a screen of your own.

A track goes on a `<video>` or an `<audio>` with `injectTrack()`. For a template that lists them, write a directive of your own over it, once: it is five lines, and the package ships no directive, as that would need Angular's compiler to build it.

```ts
// src/app/media-track.ts
import { Directive, ElementRef, inject, input } from '@angular/core';
import type { RemoteTrack } from '@wordplus/realtime';
import { injectTrack } from '@wordplus/realtime/angular';

/** `<video [track]="…">`: shows a track on the element it is on, as it changes. */
@Directive( { selector: 'video[track], audio[track]' } )
export class MediaTrack {
    readonly track = input<RemoteTrack | MediaStreamTrack | null | undefined>();

    constructor() {
        injectTrack( inject( ElementRef ), this.track );
    }
}
```

```ts
// src/app/call.ts
import { Component, input } from '@angular/core';
import { injectCall, injectCalls } from '@wordplus/realtime/angular';
import { MediaTrack } from './media-track';

@Component( {
    selector: 'app-call',
    imports: [ MediaTrack ],
    template: `
        @if ( current.call() ) {
            <video [track]="current.remote()?.camera" autoplay playsinline muted></video>
            <audio [track]="current.remote()?.microphone" autoplay></audio>
            <video [track]="current.camera()" autoplay playsinline muted class="self"></video>
            <button (click)="current.setCamera( ! current.camera() )">Camera</button>
            <button (click)="current.end()">Hang up</button>
        } @else if ( calls.incoming()[ 0 ]; as ring ) {
            <button (click)="current.answer( ring )">Answer</button>
        } @else {
            <button (click)="call()">Call</button>
            @if ( current.endReason() ) {
                <p>The call ended: {{ current.endReason() }}</p>
            }
        }
        @if ( current.error() ) {
            <p>{{ current.error() }}</p>
        }
    `,
} )
export class Call {
    readonly to = input.required<number>();
    readonly calls = injectCalls();
    readonly current = injectCall();

    async call(): Promise<void> {
        // Your route answers { token } from realtime.callToken( user, to ) if your app says yes.
        const answer = await fetch( `/api/call-token?to=${ this.to() }&type=video` );
        const { token } = await answer.json() as { token: string };
        await this.current.start( token );
    }
}
```

- `start()` and `answer()` open the camera and microphone the call's type asks for, each on its own: a camera refused leaves the microphone on, and says why in `error` (`device_denied`, `device_missing`, `device_busy`). `{ devices: false }` opens none.
- **The call ends when the component goes,** and `endReason` says why one ended: `hangup`, `rejected`, `busy`, `no_answer`, and `group` when someone was added and it became a group call, which is then `group()`.
- `call()` is the call itself, for what the rest doesn't cover: `add()`, `devices()`, `startAudio()` after a click where the browser blocked the sound.
- **A track without a directive:** `remote = viewChild<ElementRef<HTMLVideoElement>>( 'remote' )` with `<video #remote>`, and in the constructor `injectTrack( this.remote, () => this.current.remote()?.camera )`.

### Group calls

```ts
// src/app/meeting.ts
import { Component, input } from '@angular/core';
import { injectGroupCall } from '@wordplus/realtime/angular';
import { MediaTrack } from './media-track';

@Component( {
    selector: 'app-meeting',
    imports: [ MediaTrack ],
    template: `
        @switch ( meeting.state() ) {
            @case ( 'connecting' ) { <p>Joining…</p> }
            @case ( 'waiting' ) { <p>Waiting for the host…</p> }
        }
        @if ( meeting.error() ) {
            <p>You can't join this meeting: {{ meeting.error() }}</p>
        }
        <button (click)="meeting.setMicrophone( ! meeting.microphone() )">Microphone</button>
        <button (click)="meeting.setCamera( ! meeting.camera() )">Camera</button>
        <video [track]="meeting.camera()" autoplay playsinline muted class="self"></video>
        @for ( person of meeting.people(); track person.identity ) {
            <video [track]="person.camera" autoplay playsinline muted></video>
            <audio [track]="person.microphone" autoplay></audio>
        }
    `,
} )
export class Meeting {
    readonly id = input.required<number>();

    // Your route answers { token } from realtime.groupCallToken( user, `meeting:${ id }` ), which says what this person may do.
    readonly meeting = injectGroupCall( () => `meeting:${ this.id() }`, async () => {
        const answer = await fetch( `/api/meeting-token?id=${ this.id() }` );
        return ( await answer.json() as { token: string } ).token;
    } );
}
```

It joins as the component comes and leaves as it goes, or as the name changes to another or to `null`. `people` is the others as they change, each with `camera`, `microphone` and `screen`, and `self` is this page's user as the others see them. `group()` is the call itself, for `moderate()` and `devices()` ([calls](calls.md)).

### Live streams

```ts
// src/app/show.ts
import { Component, type ElementRef, input, viewChild } from '@angular/core';
import { injectStream, injectStreamVideo } from '@wordplus/realtime/angular';

@Component( {
    selector: 'app-show',
    template: `
        <video #picture autoplay playsinline muted></video>
        <p>{{ show.state()?.viewers ?? 0 }} watching</p>
        @if ( show.state()?.audioBlocked ) {
            <button (click)="show.stream()?.startAudio()">Turn the sound on</button>
        }
        @if ( show.error() ) {
            <p>{{ show.error() }}</p>
        }
    `,
} )
export class Show {
    readonly id = input.required<number>();
    readonly picture = viewChild<ElementRef<HTMLVideoElement>>( 'picture' );

    // Your route answers { token } from realtime.streamToken( user, `live:${ id }` ), asked again as each runs out.
    readonly show = injectStream( () => `live:${ this.id() }`, async () => {
        const answer = await fetch( `/api/stream-token?id=${ this.id() }` );
        return ( await answer.json() as { token: string } ).token;
    } );

    constructor() {
        injectStreamVideo( this.picture, this.show.stream );
    }
}
```

`state` is everything the ready-made player draws, as it changes: the phase, `viewers`, the chat, the pinned message and the pictures ([a screen of your own](streams.md#a-screen-of-your-own)). `stream()` is the stream itself, for `chat.send()`, and for its host `goLive()`. The sound plays apart from the `<video>`, which stays muted. The ready-made player, `<live-stream>`, needs none of this.

### The connection itself

```ts
// src/app/connection-status.ts
import { Component, computed } from '@angular/core';
import { injectConnection } from '@wordplus/realtime/angular';

@Component( {
    selector: 'app-connection-status',
    template: `
        @if ( why() ) {
            <p role="alert">Can't connect: {{ why() }}</p>
        } @else if ( ! connection.connected() ) {
            <p role="status">Reconnecting…</p>
        }
    `,
} )
export class ConnectionStatus {
    readonly connection = injectConnection();

    // A refusal's code (wrong_origin, over_capacity …), or why the connection could not be made.
    readonly why = computed( () => {
        const error = this.connection.error();
        return error && ( 'code' in error ? error.code : error.message );
    } );
}
```

`injectRealtime()` is the connection, `null` until it is up, for what the functions don't cover, such as `rt.calls()`, `rt.users()`, a room's history, and the ready-made screens below ([browser reference](browser.md)).

## The ready-made screens

The call screen, the conversation window, who is online and the live stream player, from Better Messages, are elements: `<call-button>`, `<group-call-button>`, `<online-list>`, `<online-count>`, `<typing-line>`, `<chat-room>`, `<call-spot>` and `<live-stream>` ([elements](elements.md)). They are optional: the functions above draw all of it your way ([your own interface](interface.md)).

**Load them once,** in your root component, once the connection is up. Their scripts come from your routes:

```ts
// src/app/app.ts
import { Component, effect } from '@angular/core';
import { injectRealtime } from '@wordplus/realtime/angular';
import { ConnectionStatus } from './connection-status';
import { Shop } from './shop';

@Component( {
    selector: 'app-root',
    imports: [ ConnectionStatus, Shop ],
    template: '<app-connection-status /><app-shop />',
} )
export class App {
    readonly realtime = injectRealtime();

    constructor() {
        effect( () => {
            // The call screen and its ring, and the elements. rt.ui() for the elements with no calls, rt.streamScreen()
            // for <live-stream>.
            void this.realtime()?.callScreen();
            void this.realtime()?.streamScreen();
        } );
    }
}
```

**Then any component uses them** with `CUSTOM_ELEMENTS_SCHEMA`, which tells Angular these are elements of the page:

```ts
// src/app/shop.ts
import { Component, CUSTOM_ELEMENTS_SCHEMA, signal } from '@angular/core';

type Sent = { id: string; room: string; text: string; at: number };

@Component( {
    selector: 'app-shop',
    schemas: [ CUSTOM_ELEMENTS_SCHEMA ],
    template: `
        <online-list room="shop" title="In the shop now" token-url="/api/call-token" type="video audio"></online-list>
        <online-count [attr.room]="'product:' + product()"></online-count>
        <call-button [attr.to]="agent()" token-url="/api/call-token" type="video" name="Ann">Call support</call-button>
        <chat-room room="chat:{pair}" [attr.to]="agent()" name="Ann" placeholder="Write a message"
                   [load]="loadMessages" (sent)="keep( $event )" style="height: 480px"></chat-room>
        <live-stream name="live:12" token-url="/api/stream-token?id=12" title="Opening night"></live-stream>
    `,
} )
export class Shop {
    readonly product = signal( 42 );
    readonly agent = signal( 34 );

    readonly loadMessages = async ( before: { id: string; at: number } | null ) => {
        const answer = await fetch( '/api/chat/34/messages' + ( before ? `?before=${ before.id }` : '' ) );
        return await answer.json() as { messages: unknown[]; more: boolean };
    };

    keep( event: Event ): void {
        const sent = ( event as CustomEvent<Sent> ).detail;
        void fetch( '/api/chat/messages', { method: 'POST', body: JSON.stringify( sent ) } );
    }
}
```

- **They read attributes,** as plain HTML has them: `room="shop"` as it is, and what changes as `[attr.room]="…"`. A binding without `attr.`, `[room]="…"`, sets a property they don't read.
- **Properties** are only `<chat-room>`'s `load`, a function that pages back through your messages in place of the route `messages`, and `<live-stream>`'s `view`: `[load]="loadMessages"`.
- **Events** are DOM events: `(sent)` on `<chat-room>` with the message as its `detail`, and `(realtime-control)` on a `<call-screen>` of yours whose template adds a button to the call controls ([elements](elements.md#call-screen)).
- **`token-url`** is your route, which each element asks for its call, group call or stream ([who may call](calls.md#who-may-call)).
- **They draw in a shadow root,** so your styles don't reach in: their design tokens, such as `--wplus-color-accent: 37, 99, 235`, set on the elements, change their colours ([customizing](customizing.md#on-any-page-the-elements)).
- **Your own names:** `provideRealtime( { screen: { prefix: 'shop' } } )` makes them `<shop-online-list>`, `<shop-chat-room>` …, so your pages name nothing but your app.
- They draw nothing on the server, and come to life once their script has loaded in the browser.

## Testing your components

The functions run in `TestBed` as in your app. Give the test the providers your app has, with `provideRealtime()` and your own server's routes or a stand-in for them, and `TestBed.tick()`, or `await fixture.whenStable()`, lets each signal take what changed.
