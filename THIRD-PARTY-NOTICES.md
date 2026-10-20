# Third-party code

`@wordplus/realtime` is MIT (see LICENSE). Some of what it ships carries other people's code, under their own licences:

- **`assets/realtime-worker.js` and `assets/realtime-rooms.min.js`**, built by @wordplus/realtime-client. `assets/THIRD-PARTY-NOTICES.txt` lists every package that build bundles into them, with each licence in full. That includes the room client's NOTICE and its Apache License 2.0 (a modified client SDK, Copyright 2021 LiveKit, Inc., changed by WordPlus), and the packages the room client bundles in turn, such as webrtc-adapter (BSD-3-Clause) and @livekit/protocol (Apache License 2.0).
- **`assets/realtime-ui.min.js`**, the call screen, built by @wordplus/realtime-ui (MIT). `assets/realtime-ui.THIRD-PARTY-NOTICES.txt` lists every package it bundles, with each licence in full: React and React DOM (MIT), rxjs (Apache License 2.0) and the screens' smaller libraries (MIT, BSD-2-Clause, BSD-3-Clause, 0BSD).
- **`dependencies`** (@noble/ciphers, socket.io-client) are installed beside the package with their own licence files.
