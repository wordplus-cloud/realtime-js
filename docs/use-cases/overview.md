# Use cases

What people build on WordPlus Cloud, each on a page of its own: the rules of your server in Node, PHP, Python and WordPress, the code of the page, and what changes for a screen of your own. They run on the same four building blocks, rooms and their events, presence, calls and live streams ([what you can build](../overview.md)), so one app mixes them freely: a shop with live orders, a chat and a call button, or a school with classes, office hours and a live stream.

**Start with a tutorial.** Three of them build a small app from an empty folder, every file in full, and you run it in two or three browser windows at the end:

| | |
|---|---|
| [Calls from a button](support-calls.md) | a customer calls their support agent, who answers on video |
| [Team meetings](meetings.md) | a team meets on video, someone not on it is turned away, and the lead ends the meeting for everyone |
| [Live streaming](live-streaming.md) | a host goes live, and everyone who opens the page watches and writes in the chat, signed in or not |

**New to calls and live streams?** [How they work](how-it-works.md) says how each one starts, who gets in, how your server runs it, how it ends, and how a call between two people connects on any network.

**Charging your users** for calls, group calls and live streams, by the minute or by the view: [charging for calls and streams](charging.md) shows the balance checked before, the seconds your server hears after, and the cut-off while it runs.

## Messaging and live updates

| | |
|---|---|
| [Live updates and notifications](live-updates.md) | An order that moves on its page, a dashboard, the progress of a job, and a notice to one user in every tab and app |
| [Chat](chat.md) | Conversations between two people and in groups, with typing, read ticks and reactions, kept in your own database |
| [Who is online and who is here](online.md) | A dot on every avatar, the people in a room with their roles, and how many look at a page |
| [Editing together](collaboration.md) | Who is in a document, their cursors, and the changes, sent as binary and kept for a reconnect |
| [Asking the apps of a user](devices.md) | A question to every page and app a user has open, such as approving a sign in, and signing them out everywhere |

## Calls

| | |
|---|---|
| [Calls from a button](support-calls.md) | A customer calls support from a page, it rings in every tab and app of the agent, and the agent adds a colleague |
| [Consultations by booking](consultations.md) | A video visit open only to its two people and only in its time, encrypted end to end |

## Group calls

| | |
|---|---|
| [Team meetings](meetings.md) | A room for each team or project, joined from a button, run from your server |
| [Classes, webinars and audio rooms](classes.md) | A few speak and everyone else listens, and a listener raises a hand to be let on |
| [Waiting rooms and breakout rooms](waiting-rooms.md) | The host admits each guest, and sends people to smaller rooms and back |

## Live streams

| | |
|---|---|
| [Live streaming](live-streaming.md) | One host live to everyone who opens the page, visitors watching without signing in, the chat kept by moderators |
| [Interviews and questions on stage](interviews.md) | Viewers raise a hand, and the host brings them on stage beside them |
| [Members-only streams](members-only.md) | A stream for those your rule lets in: members, ticket holders, a class, streamed from the browser or OBS |

## What every use case shares

- **Your rules decide.** Each room, call and stream asks your server who may join and what they may do, and WordPlus Cloud holds everyone to the answer ([permissions](../permissions.md)).
- **Sealed.** What a page sends travels sealed with keys your server makes, and calls are encrypted end to end ([encryption](../encryption.md)).
- **Ready-made, or your own.** Each use case works with the ready-made parts from Better Messages and Easy Stream, and with an interface of your own on the same API ([your own interface](../interface.md)).
- **Everywhere your users are.** The same rooms, calls and streams reach the web, React, React Native, iOS and Android, and WordPress plugins through [`wordplus/realtime`](https://docs.wordplus.cloud/wordpress/getting-started/).
- **On WordPress,** the server code is under the WordPress tab of each page. The page code is the same, with `const { rt, calls } = wordplusRealtimeCalls.page()` in place of `connect()` and `await rt.calls()`, once the plugin enqueues `wordplus_realtime()->calls_script()` ([JavaScript reference](https://docs.wordplus.cloud/wordpress/javascript-reference/)).
