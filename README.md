# Ultrahuman Sync for Obsidian

Sync your [Ultrahuman](https://www.ultrahuman.com/) Ring metrics — sleep, recovery, HRV, heart rate, steps, temperature and more — into your Obsidian vault as daily notes.

## How it works

The plugin calls the [Ultrahuman Partner API](https://blog.ultrahuman.com/blog/accessing-your-ultrahuman-ring-data-through-apis/) (`partner.ultrahuman.com/api/v1/metrics`) for each day and writes a note per day at `<folder>/<YYYY-MM-DD>.md` (default folder: `Ultrahuman`).

Each note gets:

- **Frontmatter** with flat scalar values (`uh_sleep_score`, `uh_recovery_index`, `uh_avg_hrv`, `uh_steps`, …) so you can query them with Dataview, Bases, or graphs.
- A **managed section** between `%% ultrahuman:start %%` and `%% ultrahuman:end %%` markers containing a readable summary of every metric. Re-syncing replaces only that section — anything you write elsewhere in the note is preserved.

## Setup

1. **Get a Partner API key** from Ultrahuman: in the Ultrahuman app go to **Profile → Partner API**, or email support to have the API enabled for your account.
2. Install the plugin (see below) and enable it in **Settings → Community plugins**.
3. In **Settings → Ultrahuman Sync**, enter your **API key** and the **email** of your Ultrahuman account.

## Usage

Use the ribbon heart icon or the command palette:

| Command | What it does |
| --- | --- |
| `Ultrahuman Sync: Sync recent days` | Syncs the last *N* days (configurable, default 1) — always at least today plus the trailing refresh window |
| `Ultrahuman Sync: Sync today` | Syncs today only |
| `Ultrahuman Sync: Sync yesterday` | Syncs yesterday only |
| `Ultrahuman Sync: Sync a specific date…` | Pick any past date to backfill |
| `Ultrahuman Sync: Sync missed days` | Backfills dates in the lookback window (default 14 days) that have no note yet, oldest first |

### Keeping data fresh

- **Sync on startup** refreshes data whenever Obsidian launches — and backfills any days you missed while Obsidian was closed, scanning the last *N* days (**Missed-day lookback**, default 14) for dates without a note.
- **Refresh trailing days** (default 2) makes every recent sync re-sync today plus the previous days, so notes written before a day's data had fully arrived heal themselves on the next sync.
- **Auto-sync interval** (default off) quietly re-syncs recent days every *N* minutes while Obsidian is open.

Re-syncs only ever rewrite the managed section of a note, and if the Partner API rate-limits a request (HTTP 429) the plugin backs off and retries up to 3 times before giving up.

### Example Dataview query

```dataview
TABLE uh_sleep_score AS "Sleep", uh_recovery_index AS "Recovery", uh_steps AS "Steps"
FROM "Ultrahuman"
SORT file.name DESC
LIMIT 14
```

## Installing

### Manual install

1. Run a build (see below) or download `main.js` and `manifest.json` from a release.
2. Copy `main.js` and `manifest.json` into `<your vault>/.obsidian/plugins/ultrahuman-sync/`.
3. Reload Obsidian and enable **Ultrahuman Sync** under Community plugins.

### Building from source

```bash
npm install
npm run build   # type-checks and produces main.js
npm run dev     # watch mode for development
```

## Notes & limitations

- The Partner API is rate-limited and data for the current day arrives as your ring syncs with the Ultrahuman app, so today's note may be partial until the evening — the trailing-day refresh (see above) exists to heal exactly that.
- Glucose metrics (M1) appear automatically when your account has them.
- Your API key is stored in the plugin's local `data.json` inside your vault; treat that file as sensitive.

## License

MIT
