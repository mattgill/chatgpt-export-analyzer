# ChatGPT Export Analytics

A free, static website for inspecting a ChatGPT export ZIP. The export is processed entirely in your browser: it is not uploaded to an application server, stored remotely, or sent to analytics/telemetry services.

## Use it

Open the GitHub Pages site, choose one ChatGPT export ZIP (up to 100 MiB), and wait for the local report. The report is retained in this browser's IndexedDB so it survives a refresh. It contains aggregate usage data and up to 100 conversation titles/rows; it never retains the ZIP, message bodies, reasoning recap text, node metadata, or internal thought payloads. Use **Clear local report** to remove it.

Desktop Chrome, Firefox, and Safari are supported. Mobile layouts are not currently in scope. Token and cost values are illustrative estimates based on the checked-in pricing configuration, not an invoice.

## Development

```bash
npm ci
npm run dev
npm run check
npm run test:parity
npm run test:browser
```

`npm run build` creates the static `dist/` artifact. The app uses hash routing and a relative asset base, so it works at a GitHub Pages project path without server-side rewrite rules. Pages deployment is defined in `.github/workflows/pages.yml` and runs static checks plus browser tests before publishing the artifact.

`npm run benchmark -- --size-mib 100` and `npm run benchmark -- --zip /tmp/chatgpt-export.zip` are the local performance-validation commands. The private ZIP path is optional and is never copied into the repository.

The browser application is the supported product. Its committed golden fixture protects the original accounting behavior without requiring a second runtime implementation.

## Export conversations as Markdown

For a local, one-file-per-conversation archive, run:

```bash
node scripts/conversations-to-markdown.mjs ~/chatgpt-convos
```

It recursively reads JSON export files and writes Markdown to `~/chatgpt-convos/markdown` by default. Filenames use the conversation's UTC creation date and a rough title slug, for example `2024-01-01-project-notes.md`. Choose another destination with `--output ~/chatgpt-markdown`.
