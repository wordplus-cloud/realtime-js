# Use cases

What people build on WordPlus Cloud, each on a page of its own: the rules of your server in Node, PHP, Python and WordPress, the code of the page in the browser and in React, and what changes for a screen of your own. They run on the same four building blocks, rooms and their events, presence, calls and live streams ([what you can build](../overview.md)), so one app mixes them freely: a shop with live orders, a chat and a call button, or a school with classes, office hours and a live stream.

**In your stack:** [Next.js](../nextjs/getting-started.md) · [Express](../express/getting-started.md) · [Laravel](https://docs.wordplus.cloud/laravel/getting-started/) · [PHP](https://docs.wordplus.cloud/php/getting-started/) · [Django](https://docs.wordplus.cloud/django/getting-started/) · [FastAPI](https://docs.wordplus.cloud/fastapi/getting-started/) · [Flask](https://docs.wordplus.cloud/flask/getting-started/) · [WordPress](https://docs.wordplus.cloud/wordpress/getting-started/), and in apps for phones: [iOS](https://docs.wordplus.cloud/ios/getting-started/) · [Android](https://docs.wordplus.cloud/android/getting-started/) · [React Native and Capacitor](../mobile/getting-started.md). Each use case links the page of each guide it builds on.

**Start with a tutorial.** Three of them build a small app from an empty folder, every file in full, and you run it in two or three browser windows at the end:

| | |
|---|---|
| [Calls from a button](support-calls.md) | a customer calls their support agent, who answers on video |
| [Team meetings](meetings.md) | a team meets on video, someone not on it is turned away, and the lead ends the meeting for everyone |
| [Live streaming](live-streaming.md) | a host goes live, and everyone who opens the page watches and writes in the chat, signed in or not |

**New to calls and live streams?** [How they work](how-it-works.md) says how each one starts, who gets in, how your server runs it, how it ends, and how a call between two people connects on any network.

**Charging your users** for calls, group calls and live streams, by the minute or by the view: [charging for calls and streams](charging.md) shows the balance checked before, the seconds your server hears after, and the cut-off while it runs.

## By kind of app

An app is most often several use cases at once. Some kinds of app, the use cases each combines, and where to start:

| Kind of app | The use cases it combines | Start from |
|---|---|---|
| A marketplace | [live updates](live-updates.md) of orders, a [chat between buyer and seller](marketplace-chat.md), [who is online](online.md), [live auctions](auctions.md), a [courier on a map](location-tracking.md) | the [marketplace](../nextjs/marketplace.md), a whole site in Next.js, or the [marketplace chat](marketplace-chat.md) |
| Telehealth | [consultations by booking](consultations.md), a [waiting room](waiting-rooms.md), notes in a [chat](chat.md), [charging](charging.md) by the minute | the [consultations site](../nextjs/consultations.md), a whole site in Next.js, or [consultations by booking](consultations.md) |
| A school | [live streaming](live-streaming.md) of lessons, [questions on stage](interviews.md), [classes](classes.md) in small groups, [members-only streams](members-only.md) for each course | the [live lessons site](../nextjs/live-lessons.md), a whole site in Next.js |
| A team tool | [team meetings](meetings.md), channels and conversations in [chat](chat.md), [who is online](online.md), [editing together](collaboration.md) | the [team intranet](../nextjs/team-intranet.md), a whole site in Next.js |
| A dating site | [who is online](online.md), a [chat](chat.md) between two, video dates by [calls](support-calls.md), a new sign in approved on the phone ([every page and app of a user](devices.md)) | the [dating site](../nextjs/dating-site.md), a whole site in Next.js |
| A support desk | a [desk of agents](support-desk.md), an [AI chat that hands over to a person](ai-chat.md), [calls from a button](support-calls.md), [remote help](remote-help.md) with the screen shared, the agents on duty from [presence](online.md) | the [support desk](support-desk.md), then the [calls from a button](support-calls.md) tutorial |
| A community | group [chats](chat.md), [who is online](online.md), [live streaming](live-streaming.md), [members-only streams](members-only.md), [meetings](meetings.md) | the [community site](../nextjs/community.md), a whole site in Next.js |
| A game lobby | [who is here](online.md) and how many, the scores in [live updates](live-updates.md), a [chat](chat.md), voice in an [audio room](classes.md) | [getting started](../getting-started.md), then [rooms](../rooms.md) and [presence](../presence.md) |

## Messaging and live updates

| | |
|---|---|
| [Live updates and notifications](live-updates.md) | An order that moves on its page, a dashboard, the progress of a job, and a notice to one user in every tab and app |
| [Chat](chat.md) | Conversations between two people and in groups, with typing, read ticks and reactions, kept in your own database |
| [Who is online and who is here](online.md) | A dot on every avatar, the people in a room with their roles, and how many look at a page |
| [Editing together](collaboration.md) | Who is in a document, their cursors, and the changes, sent as binary and kept for a reconnect |
| [Every page and app of a user](devices.md) | A question to every page and app a user has open, such as approving a sign in, and signing them out everywhere |
| [AI chat, then a person](ai-chat.md) | An answer that streams into the conversation as your own model writes it, and a person from support who takes over the same chat |
| [A support desk with agents](support-desk.md) | Each conversation goes to an agent on duty, the others read along, notes stay among agents, and the agent calls from the conversation |
| [Marketplace chat](marketplace-chat.md) | A conversation for each listing and buyer that only the two read, the seller online or last seen, and a notice to whoever is away |
| [Polls, quizzes and questions](polls.md) | Votes and questions that reach your server alone, results sent to everyone, a score for each player, and upvotes counted once |
| [Live auctions](auctions.md) | Bids your server decides one at a time, the new price to everyone, a clock that moves on a late bid, and the winner told |
| [Live location tracking](location-tracking.md) | A courier on a map, positions every few seconds never kept, and sharing that ends with the delivery |

## Calls

| | |
|---|---|
| [Calls from a button](support-calls.md) | A customer calls support from a page, it rings in every tab and app of the agent, and the agent adds a colleague |
| [Consultations by booking](consultations.md) | A video visit open only to its two people and only in its time, encrypted end to end |
| [Remote help with screen sharing](remote-help.md) | A customer calls support and shares their screen from the browser, and the agent talks them through |
| [A calling app that rings a locked phone](calling-app.md) | Calls between your users that ring a locked iPhone through CallKit and an Android phone through Telecom, and the same calls from the website |

## Group calls

| | |
|---|---|
| [Team meetings](meetings.md) | A room for each team or project, joined from a button, run from your server |
| [Classes, webinars and audio rooms](classes.md) | A few speak and everyone else listens, and a listener raises a hand to be let on |
| [Waiting rooms and breakout rooms](waiting-rooms.md) | The host admits each guest, and sends people to smaller rooms and back |
| [Watch parties](watch-party.md) | A host plays, pauses and jumps a video for everyone at once, with a chat beside it and a call of the party |

## Live streams

| | |
|---|---|
| [Live streaming](live-streaming.md) | One host live to everyone who opens the page, visitors watching without signing in, the chat kept by moderators |
| [Interviews and questions on stage](interviews.md) | Viewers raise a hand, and the host brings them on stage beside them |
| [Members-only streams](members-only.md) | A stream for those your rule lets in: members, ticket holders, a class, streamed from the browser or OBS |

## What every use case shares

- **Your rules decide.** Each room, call and stream asks your server who may join and what they may do, and WordPlus Cloud holds everyone to the answer ([permissions](../permissions.md)).
- **Sealed.** What the pages send in a private or presence room travels sealed with keys your server makes, and so do its history, who is in it, and what your server sends a user. A public room is not sealed. Calls between two people are encrypted end to end on every path, a group call when its rule says `encrypt`, and a live stream is not, as it is for everyone watching ([encryption](../encryption.md)).
- **Ready-made, or your own.** Each use case works with the ready-made parts from Better Messages and Easy Stream, and with an interface of your own on the same API, in the browser and in React ([your own interface](../interface.md), [React](../react.md)).
- **Everywhere your users are.** The same rooms, calls and streams reach the web, React, iOS and Android, and WordPress plugins through [`wordplus/realtime`](https://docs.wordplus.cloud/wordpress/getting-started/). React Native has the rooms and presence now, and calls and streams in a later version: `rt.calls()` rejects with `no_webrtc` there meanwhile ([mobile apps](../mobile/getting-started.md)).
- **On WordPress,** the server code is under the WordPress tab of each page. The page code is the same, with `const { rt, calls } = wordplusRealtimeCalls.page()` in place of `connect()` and `await rt.calls()`, once the plugin enqueues `wordplus_realtime()->calls_script()` ([JavaScript reference](https://docs.wordplus.cloud/wordpress/javascript-reference/)).
