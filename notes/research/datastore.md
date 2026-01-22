# Peek Personal Datastore

Browser profile directories are a jumble of organically-grown files and directories that are designed to serve browser internals vs being a store of user-curated and shaped information.

The Peek Personal Datastore combines an address index with unstructured data, metadata, time-series data, and files.

This is a local, private and pesonal store first and foremost.

Peek needs a way of storing data that provides a few primary things:

- Store various data types, and attach metadata to them
- Store feeds, such as web navigation history, stored data history, custom generated feeds, timeseries data, and feeds pulled in from elsewhere
- Have some kind of approach to binary files like images and videos, maybe fine to keep on filesystem but referenced by an index
- Support bidirectional filesystem sync for some flavors of file, such as markdown, where we might want an Obsidian vault to map some set of "files" in the datastore that we can also edit in a "stickies" app running in Peek, for example
- Mime types are implemented in nearly every aspect of the datastore to allow for type-based querying
- Tags are implemented in nearly every aspect of the datastore to allow for coarse-grained annotations and querying

Non-primary but keep in FOV:
- Runtime/browser engine agnosticism, eg if we move off Electron someday
- Designed with sync in mind, for mirroring to other devices, saving parts to specific cloud operations, or whole snapshots for backups and archives
- Designed with sync in mind to collaborate with others - eg perhaps a subset of notes are synced with some other person's set of notes

Primary types:

- Address index: Peek at its core is a web user agent. First class support for saving addresses. Examples: HTTP URLs, other protocol URLs or URIs, such as IPFS CIDs. Fine to limit to URIs for now. The address index includes navigation history, or an imported Pocket archive or any type of address for any reason.
- Web navigation history: Index of visits to addresses in the index.
- Non-URL data, which can reference one or more URLs or none at all. Examples: markdown notes, images
- Metadata for all data types: We want to annotate addresses and non-addresses with tags, signatures, mime-types, language metadata, usage information, etc.

## Application patterns

- Applications need to read from and write to the datastore in ways specific to them.
- Not necessarily full sandbox / sharding / area, but the ability to operate on types they know and use.
- Eg Panorama will need to access the address index, and store group metadata, and access it quickly.
- Address classifiers will be a very common use-case, with many applications just being specialized address classifiers, so maybe we need some application-level "data view" implemented for quickly accessing data in this way.
- Perhaps lenses/views are a useful abstraction here.

## Use-cases

Private local
- navigation history
- personal notes
- saving images from pages
- text/numerical datapoints and their history, eg (so, time-series data)

Private remote
- publishing a note to a remote server
- syncing the datastore between my devices
- publishing backups/archives

Public remote
- publish a note to my website
- sync w/ a remote service, eg push urls+notes tagged 'arena' to are.na and pull from it

Collaboration
- syncing private data between two people

Shared calendar scenario
- two stores with calendar data
- connect via agreed shared method

## Data, schemas, and schemalessness

As Peek matures into a natively generative system, we need complex types beyond MIME types and what filesystems afford - the whole flora and fauna of digital daily life. We need a way of describing data when passing it between features and "applications" in Peek. We don't need some holy grail supersystem dream, maybe it's fine to just internet MIME types, filesystem types, and something like Atproto's "lexicons" when interacting in public collaborative scenarios.

The store itself is probably fine using basic types, and we can layer on complex types in the context of applications.

## Implementation notes and ideas

- JS/TS/Electron
- Tinybase
- Automerge

Layer on:
- identities
- signing
- verifiability
- collaboration

## Examples

- Atproto personal datastore (not designed to be private by default tho) https://atproto.com/guides/self-hosting
- Solid pods https://solidproject.org/
- Perkeep is more focused on permanence but it does a lot of these things https://github.com/perkeep/perkeep
