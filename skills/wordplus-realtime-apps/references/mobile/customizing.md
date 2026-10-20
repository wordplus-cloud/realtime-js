# Customizing the screens in a mobile app

How far a mobile app changes the screens depends on what draws it.

## Capacitor and Ionic

A Capacitor app is a web page, so the screens change as they do on the web, in three steps: [making the screens your own](../customizing.md).

- **The look:** design tokens such as `--bm-color-accent` on the page.
- **A piece:** `components` on the React components from `@wordplus/realtime-ui/react`, or `::part()` and `<template slot>` on the elements.
- **The code:** `npx @wordplus/realtime-ui add call-screen` copies the view into your app, its tests and its preview with it.

Check every change at the width of a phone: `npx @wordplus/realtime-ui preview`, then `?width=phone`.

## React Native

The Better Messages screens are drawn for the web, so a React Native app draws its own on the SDK: its rooms, presence, events and who is online are all there ([React Native](../react.md#react-native)). Calls and the ready-made parts in React Native come later.

## Swift and Kotlin

The native call screens take the pieces of the app too: [iOS](https://docs.wordplus.cloud/ios/getting-started/) and [Android](https://docs.wordplus.cloud/android/getting-started/).
