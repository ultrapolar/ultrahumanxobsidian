# Ultrahuman × Obsidian Plugin

This Obsidian plugin fetches daily metrics from the Ultrahuman API and appends an auto-managed dashboard block to today's daily note. Each dashboard entry is rendered as a responsive SVG line chart so you can review glucose, Hive, sleep, or any other Ultrahuman metrics you track.

## Installation

1. Download the latest contents of this repository (or clone it) and copy the `ultrahumanxobsidian/` folder into your vault's `.obsidian/plugins/` directory.
2. Ensure the folder name stays `ultrahumanxobsidian` (it must match the plugin ID in `manifest.json`).
3. Reload Obsidian and enable **Ultrahuman × Obsidian** from the community plugins tab.
4. Open the plugin settings to paste your Ultrahuman API key, tweak the metrics list, and confirm whether the dashboard should refresh on startup.

The plugin does not require a build step — the committed `main.js` file is ready to use as-is.

### Installing with BRAT

If you prefer to use the [Beta Reviewer's Auto-update Tester](https://github.com/TfTHacker/obsidian42-brat), point BRAT at `ultrapolar/ultrahumanxobsidian` and select the `work` branch. The published plugin files live inside the `ultrahumanxobsidian/` folder, so BRAT will sync them directly into your vault under the correct plugin ID.

## How it works

- When Obsidian opens your daily note, the plugin requests Ultrahuman metrics for that date and writes them into a fenced code block tagged with `ultrahuman`, wrapped between HTML markers. The block is replaced on every refresh so your note stays tidy.
- A markdown post processor reads the stored JSON and renders each metric as a smooth SVG line chart with summary statistics (latest value, average, and range) displayed above the visualization.
- You can trigger a manual refresh at any time via the **Refresh Ultrahuman metrics** command palette action.

## Troubleshooting

- Make sure the Daily notes core plugin is enabled; the Ultrahuman dashboard needs it to locate or create today's note.
- If you see an "add your API key" notice, open the settings tab and paste a valid Ultrahuman personal access token.
- Network or authentication failures are reported in Obsidian's developer console (`Ctrl/Cmd + Shift + I`).
