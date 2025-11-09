# Ultrahuman Daily Dashboard Plugin

This Obsidian plugin fetches daily metrics from the Ultrahuman API and appends an auto-managed dashboard block to today's daily note. Each dashboard entry is rendered as a responsive SVG line chart so you can review glucose, Hive, sleep, or any other Ultrahuman metrics you track.

## Installation

1. Download the latest contents of this repository (or clone it) and copy the following files into your vault's `.obsidian/plugins/ultrahuman-daily-note-dashboard` folder:
   - `manifest.json`
   - `main.js`
   - `styles.css`
2. Reload Obsidian and enable **Ultrahuman Daily Dashboard** from the community plugins tab.
3. Open the plugin settings to paste your Ultrahuman API key, tweak the metrics list, and confirm whether the dashboard should refresh on startup.

The plugin does not require a build step — the committed `main.js` file is ready to use as-is.

## How it works

- When Obsidian opens your daily note, the plugin requests Ultrahuman metrics for that date and writes them into a fenced code block tagged with `ultrahuman`, wrapped between HTML markers. The block is replaced on every refresh so your note stays tidy.
- A markdown post processor reads the stored JSON and renders each metric as a smooth SVG line chart with summary statistics (latest value, average, and range) displayed above the visualization.
- You can trigger a manual refresh at any time via the **Refresh Ultrahuman dashboard** command palette action.

## Troubleshooting

- Make sure the Daily notes core plugin is enabled; the Ultrahuman dashboard needs it to locate or create today's note.
- If you see an "add your API key" notice, open the settings tab and paste a valid Ultrahuman personal access token.
- Network or authentication failures are reported in Obsidian's developer console (`Ctrl/Cmd + Shift + I`).
