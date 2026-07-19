# Website validation

## Browser performance gate

Run `npm run benchmark -- --size-mib 100` before release and record compressed/expanded size, elapsed time, completion, and browser memory observations here. This repository does not contain real export data.

Run `npm run benchmark -- --zip /tmp/chatgpt-export.zip` only when the owner supplies that private local file. The command reports only file size and never reads, copies, or prints its contents.

## Current environment

The Playwright browser binaries and required host libraries are installed. The Pages-path suite passed in Chromium, Firefox, and WebKit.

## Synthetic generator result

`npm run benchmark -- --size-mib 100` completed a real Chromium analysis of an intentionally uncompressed synthetic ZIP with `104,855,622` compressed bytes (under the 100 MiB ceiling), `104,855,488` expanded conversation bytes, and `105,171` conversations. End-to-end elapsed time was `23,955 ms` with zero page errors. The optional private path `/tmp/chatgpt-export.zip` was absent and correctly reported a skip.
