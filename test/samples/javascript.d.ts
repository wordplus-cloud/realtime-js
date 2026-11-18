// A js or jsx block of the docs reads the page's elements and events as JavaScript does (scripts/samples.mjs): an
// element's own properties (`video.currentTime`, `chatRoom.load`), an event's `detail` and what a page keeps on
// `window` (`window.Echo`), with no type to narrow them to. What it names and calls of the package is checked as
// everywhere.

interface Window {
    [property: string]: any;
}

interface Element {
    [property: string]: any;
}

interface Event {
    readonly detail?: any;
}
