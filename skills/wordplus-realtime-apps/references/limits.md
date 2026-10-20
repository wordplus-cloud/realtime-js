# Limits

## Your account

| | |
|---|---|
| Apps | one for each subscription (Apps in your WordPlus Cloud account) |
| Concurrent connections | those of the app's subscription, for that app alone, across WordPlus Cloud. Up to 20% more still connect. The tabs of a user in a browser share one connection when your app serves the worker. Your account owner gets an email at 80% and at 100% of them |
| Group calls | unmetered up to 32 people on video at once in an app with 1,000 connections, and 12 more for each 1,000 after them, a person on audio counting half. Above that, by the minute from your account credits: each 1,000 connections add 5,000 a month, for group calls and live streams together, and each person above takes a credit a minute, on audio half. No limit on people in a call, or on calls at once. Once your credits, those you bought and a month of borrowing are used, nobody new above the unmetered number joins until you buy more or the month ends. Those within it still join, and those in a call stay. Calls between two people take no credits |
| Live streams | unmetered up to 50 viewers at once in an app with 1,000 connections, and 20 more for each 1,000 after them. Above that, each viewer takes a credit a minute, from the same credits as group calls. Once they are used, a new viewer above the unmetered number is refused with `no_hours` until you buy more or the month ends, and those watching go on. Each viewer holds one of the connections of the app |
| Addresses of an app | 20 |
| History | 5 minutes, about 10 MB of it per 1,000 of the connections of your plan, the oldest events trimmed first |

## Rooms

| | |
|---|---|
| The name of a room | up to 200 characters of `A-Z a-z 0-9 _ - = @ , . ; :` |
| Rooms a connection holds | 1,000 |
| Rooms one token names | 100. A page asks for more in several |
| The data of an event | 1 MB, binary included |
| Rooms one emit goes to | 1,000, and users 1,000 |
| Events in one batch | 100 |
| The members of a presence room | 100,000. The first 1,000 listed, with `join` and `leave` while it has at most that many |
| The `info` of a member | 4 KB |
| A user profile in the directory | 4 KB. 100 users a `users()` |
| Events from a page | 50 a second a connection, in bursts of 100 |
| History | 1,000 events a room, for 5 minutes at most, each kept up to 64 KB. A page of it holds 100. It is for pages that reconnect: your app keeps its own records from the [webhook](events.md#keeping-the-conversation) |
| Counts | at most once a second |
| Who is online | 1,000 users watched a connection. Offline 10 seconds after the last connection closes |
| The life of a room token | 6 hours by default, at most a day. Renewed by the page |
| The clock of a signed request | within 5 minutes of the server clock |

## Calls

| | |
|---|---|
| People in a call | two. Add more, and it goes on as a group call |
| Ringing | 45 seconds, then `no_answer`. A ring into a group call too |
| The connection of one side away during a call | 45 seconds to come back |
| The life of a call token | 6 hours at most. Renewed by the page |
| A group call | no limit on people, with video or audio only. Unmetered up to the people on video at once that your plan includes, then a credit a minute each, on audio half, as [above](#your-account) |
| User ids | a number, or text of up to 64 characters with no space |
