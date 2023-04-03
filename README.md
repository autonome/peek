# Peek

Please meet Peek, a web user agent application designed for using the web where, when and how you want it.

** WARNING**
* Peek is not a web browser! There are no tabs, and no windows in the browser sense of them. If that's what you're looking for, there are a few decent browsers for you to choose from.
* Peek is not safe for general use yet! It is a crude proof of concept I whipped up while on vacation. While I have thoughts on security model and user interface, I have not written it up into a proper security model yet.

## Features

You can use Peek in three ways, with more coming:

* Peeks - Keyboard activated modal chromeless web pages mapped to `Opt+0-9`
* Slides - Gesture activated modal chromeless web pages which slide in from left/right/bottom/top
* Scripts - Scripts periodically executed against a web page in the background which extract data and notify on changes

### Peeks

Peeks are keyboard activated modal chromeless web pages mapped to `Opt+0-9` and closed on blur, the `Escape` key or `cmd/ctrl+w`.

### Slides

Slides are gesture activated modal chromeless web pages which slide in from left/right/bottom/top, and closed on blur, the `Escape` key or `cmd/ctrl+w`.

### Scripts

Scripts periodically load a web page in the background and extract data matching a CSS selector, stores it, and notify the user when the resulting data changes.

Ok, so not really "scripts" yet. But safe and effective enough for now.

## Why

Some thoughts driving the design of Peek:

* Web user agents should be bounded by the user, not browser vendor business models
* Windows and tabs should have died a long time ago, a mixed metaphor constraining the ability of the web to grow/thrive/change and meet user needs
* Security user interface must be a clear articulation of risks and trade-offs, and users should own the decisions

# Architecture / Implementation

Peek is designed to be modular and configurable around the idea that parts of it can run in different environments.

For example:
* Definitely planning on a mobile app which syncs and runs your peeks/slides/scripts
* I'd like to have a decentralized compute option for running your scripts outside of your clients and syncing the data
* Want cloud storage for all config and data, esp infinite history, so can do fun things with it

## Desktop App

Proof of concept is Electron. By far the best option today for cross-platform desktop apps which need a web rendering engine. There's really nothing else remotely suited (yet).

The user interface is just Tweakpane panels and modal chromeless web pages rn.

TODO
* Need to look at whether could library-ize some of what Agregore implemented for non-HTTP protocol support.
* Min browser might be interesting as a forkable base to work from and contribute to, if they're open to it. At least, should look more at the architecture.

### Usage

* `cmd/ctl+Escape` to open settings
* `opt+0-9` to open Peeks

## Mobile

TBD

## Cloud

* Going full crypto payments for distributed compute on this one.

## Future

* GCLI - not just a command bar, but like the Ubiquity extension
* Lossless personal encrypted archive of web history
* Implement the Firefox "awesomebar" scoring and search algorithm so that Peek *learns* you
* Extension model designed for web user agent user interface experimentation
* Panorama

## Development

```
yarn install
yarn start
```

## History

Peek was a browser extension that let you quickly peek at your favorite web pages without breaking your flow - loading pages mapped to keyboard shortcuts into a modal window with no controls, closable via the `Escape` key.

However, as browser extension APIs become increasingly limited, it was not possible to create a decent user experience and I abandoned it. You can access the extension in this repo [in the extension directory](/autonome/peek/extension/).

The only way to create the ideal user experience for a web user agent that *Does What I Want* is to make it a browser-ish application, and that's what Peek is now.

