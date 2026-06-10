import { App, Modal, Notice, Plugin, Setting, TFile, normalizePath } from "obsidian";
import { fetchMetrics, UltrahumanApiError } from "./api";
import { renderMetrics, RenderedMetrics } from "./render";
import {
  DEFAULT_SETTINGS,
  UltrahumanSettingTab,
  UltrahumanSyncSettings,
} from "./settings";

const SECTION_START = "%% ultrahuman:start %%";
const SECTION_END = "%% ultrahuman:end %%";

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00`);
  return !Number.isNaN(parsed.getTime()) && toIsoDate(parsed) === value;
}

export default class UltrahumanSyncPlugin extends Plugin {
  settings: UltrahumanSyncSettings = DEFAULT_SETTINGS;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new UltrahumanSettingTab(this.app, this));

    this.addRibbonIcon("heart-pulse", "Sync Ultrahuman data", () => {
      void this.syncRecent();
    });

    this.addCommand({
      id: "sync-recent",
      name: "Sync recent days",
      callback: () => void this.syncRecent(),
    });

    this.addCommand({
      id: "sync-today",
      name: "Sync today",
      callback: () => void this.syncDates([toIsoDate(new Date())]),
    });

    this.addCommand({
      id: "sync-yesterday",
      name: "Sync yesterday",
      callback: () => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        void this.syncDates([toIsoDate(yesterday)]);
      },
    });

    this.addCommand({
      id: "sync-date",
      name: "Sync a specific date…",
      callback: () => {
        new SyncDateModal(this.app, (date) => void this.syncDates([date])).open();
      },
    });

    if (this.settings.syncOnStartup) {
      this.app.workspace.onLayoutReady(() => void this.syncRecent({ quiet: true }));
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  private checkConfigured(): boolean {
    if (!this.settings.apiKey || !this.settings.email) {
      new Notice(
        "Ultrahuman Sync: set your Partner API key and account email in the plugin settings first."
      );
      return false;
    }
    return true;
  }

  async syncRecent(options: { quiet?: boolean } = {}) {
    const dates: string[] = [];
    for (let i = 0; i < this.settings.syncDaysBack; i++) {
      const day = new Date();
      day.setDate(day.getDate() - i);
      dates.push(toIsoDate(day));
    }
    await this.syncDates(dates, options);
  }

  async syncDates(dates: string[], options: { quiet?: boolean } = {}) {
    if (!this.checkConfigured()) return;

    let synced = 0;
    for (const date of dates) {
      try {
        const metrics = await fetchMetrics(
          this.settings.apiKey,
          this.settings.email,
          date
        );
        const rendered = renderMetrics(metrics, date);
        await this.writeNote(date, rendered);
        synced++;
      } catch (error) {
        console.error(`Ultrahuman Sync: failed to sync ${date}`, error);
        const message =
          error instanceof UltrahumanApiError
            ? error.message
            : `Ultrahuman Sync: failed to sync ${date}. See the developer console for details.`;
        new Notice(message);
        if (error instanceof UltrahumanApiError && (error.status === 401 || error.status === 403)) {
          return; // No point retrying other dates with bad credentials.
        }
      }
    }

    if (synced > 0 && !options.quiet) {
      new Notice(
        synced === 1
          ? `Ultrahuman Sync: synced ${dates[0]}.`
          : `Ultrahuman Sync: synced ${synced} day(s).`
      );
    }
  }

  /**
   * Write a day's metrics to `<folder>/<date>.md`. New files get
   * frontmatter plus a managed section; existing files only have the
   * managed section replaced, so user notes around it are preserved.
   */
  private async writeNote(date: string, rendered: RenderedMetrics) {
    const folder = this.settings.folder || "Ultrahuman";
    const path = normalizePath(`${folder}/${date}.md`);

    if (!this.app.vault.getAbstractFileByPath(normalizePath(folder))) {
      await this.app.vault.createFolder(normalizePath(folder)).catch(() => {
        // Folder may have been created concurrently; creation failure
        // surfaces below when the file write fails.
      });
    }

    const section = [
      SECTION_START,
      `## Ultrahuman — ${date}`,
      "",
      rendered.markdown,
      "",
      `*Synced ${new Date().toLocaleString()}*`,
      SECTION_END,
    ].join("\n");

    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      await this.app.vault.process(existing, (content) => {
        const startIdx = content.indexOf(SECTION_START);
        const endIdx = content.indexOf(SECTION_END);
        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
          return (
            content.slice(0, startIdx) +
            section +
            content.slice(endIdx + SECTION_END.length)
          );
        }
        return `${content.trimEnd()}\n\n${section}\n`;
      });
      await this.updateFrontmatter(existing, rendered.frontmatter);
    } else {
      const frontmatterLines = Object.entries(rendered.frontmatter).map(
        ([key, value]) =>
          typeof value === "number" ? `${key}: ${value}` : `${key}: "${value}"`
      );
      const content = ["---", ...frontmatterLines, "---", "", section, ""].join("\n");
      const file = await this.app.vault.create(path, content);
      if (!(file instanceof TFile)) {
        throw new Error(`Could not create note at ${path}`);
      }
    }
  }

  private async updateFrontmatter(
    file: TFile,
    values: Record<string, string | number>
  ) {
    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      for (const [key, value] of Object.entries(values)) {
        frontmatter[key] = value;
      }
    });
  }
}

class SyncDateModal extends Modal {
  private onSubmit: (date: string) => void;
  private value = toIsoDate(new Date());

  constructor(app: App, onSubmit: (date: string) => void) {
    super(app);
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "Sync Ultrahuman data for a date" });

    new Setting(contentEl).setName("Date").addText((text) => {
      text.setValue(this.value).onChange((value) => {
        this.value = value.trim();
      });
      text.inputEl.type = "date";
      text.inputEl.max = toIsoDate(new Date());
    });

    new Setting(contentEl).addButton((button) =>
      button
        .setButtonText("Sync")
        .setCta()
        .onClick(() => {
          if (!isValidIsoDate(this.value)) {
            new Notice("Enter a valid date in YYYY-MM-DD format.");
            return;
          }
          this.close();
          this.onSubmit(this.value);
        })
    );
  }

  onClose() {
    this.contentEl.empty();
  }
}
