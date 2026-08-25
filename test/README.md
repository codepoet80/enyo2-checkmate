# Sync logic tests

```
node test/sync-test.js
```

No dependencies and no build step — plain Node against the real source files.

## What this covers

`sync-test.js` loads `enyo-app/source/api/checkmate.js` and
`enyo-app/source/views/main.js` under a minimal Enyo shim, substituting a clock,
timers, `localStorage` and `XMLHttpRequest` that the test drives by hand. That
makes an exact request interleaving reproducible, which is the only practical way
to test a race.

The three traces at the top are the bugs that were actually reported:

| Trace | Symptom |
|---|---|
| A | Checking a task off, and the next sync un-checking it |
| B | A delete that silently doesn't take |
| C | Deleting several tasks between syncs, where only one sticks |

Each one is an interleaving that used to destroy the user's intent, so they are
written as tests to keep them fixed. The rest covers the op queue (snapshotting,
per-guid coalescing, dead-lettering, retry classification, persistence across a
restart), refresh sequencing, and the guid-keyed render diff.

## What it does not cover

Logic only. Enyo's list rendering, panel transitions, swipe handling and the
sound player are all stubbed. A passing run says the sync model is right; it says
nothing about whether the app renders. Build it and try it on a device:

```
./build.sh www        # fastest check
./build.sh webos      # the target that actually matters
```

## Not part of the build

This directory sits outside `enyo-app/`, and `enyo-app/deploy.json` is an
explicit allowlist of what gets deployed, so nothing here can reach a build
output. It is also listed in `.jshintignore`, because the tests are Node code and
would otherwise fail the app's browser-targeted `es3` lint config.
