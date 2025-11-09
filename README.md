# Ultrahuman Daily Dashboard Plugin

This plugin fetches daily metrics from the Ultrahuman API and renders line charts inside today's daily note when the note is opened. It automatically refreshes when Obsidian launches and the daily note becomes active.

## Testing and build status

The project bundles the TypeScript source via `esbuild` using the configuration in `esbuild.config.mjs`. Run the following commands to validate the build locally:

```bash
npm install
npm run build
```

> **Note**
> The sandboxed environment used for automated validation currently blocks access to `@types/node` from the npm registry, so `npm install` fails with a `403 Forbidden` error. Testing should be executed in a local environment with full registry access.

## Manual verification steps

1. Build the plugin (`npm run build`).
2. Copy `manifest.json`, `main.js`, and `styles.css` into your Obsidian vault's `.obsidian/plugins/ultrahuman-daily-note-dashboard` folder.
3. Launch Obsidian, enable the plugin, and open today's daily note.
4. Add your Ultrahuman API key in the plugin settings, adjust the metrics list if desired, and re-open the daily note to trigger a refresh.
5. Confirm the dashboard block is appended to the note and that charts render for each metric returned by the API.
