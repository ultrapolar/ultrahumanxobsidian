import { App, PluginSettingTab, Setting } from "obsidian";
import type UltrahumanSyncPlugin from "./main";

export interface UltrahumanSyncSettings {
  apiKey: string;
  email: string;
  /** Vault folder where Ultrahuman notes are created. */
  folder: string;
  /** Sync automatically when Obsidian starts. */
  syncOnStartup: boolean;
  /** How many past days (including today) a full sync covers. */
  syncDaysBack: number;
  /** Days before today that every recent sync re-syncs so partial days heal. */
  refreshTrailingDays: number;
  /** How many past days the missed-day scan checks for absent notes. */
  gapLookbackDays: number;
  /** Minutes between automatic background syncs; 0 disables interval syncing. */
  autoSyncIntervalMinutes: number;
}

export const DEFAULT_SETTINGS: UltrahumanSyncSettings = {
  apiKey: "",
  email: "",
  folder: "Ultrahuman",
  syncOnStartup: false,
  syncDaysBack: 1,
  refreshTrailingDays: 2,
  gapLookbackDays: 14,
  autoSyncIntervalMinutes: 0,
};

export class UltrahumanSettingTab extends PluginSettingTab {
  plugin: UltrahumanSyncPlugin;

  constructor(app: App, plugin: UltrahumanSyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Partner API key")
      .setDesc(
        "Your Ultrahuman Partner API key. Request one in the Ultrahuman app (Profile → Partner API) or from Ultrahuman support."
      )
      .addText((text) => {
        text
          .setPlaceholder("API key")
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value.trim();
            await this.plugin.saveSettings();
          });
        text.inputEl.type = "password";
      });

    new Setting(containerEl)
      .setName("Account email")
      .setDesc("Email address of the Ultrahuman account to sync.")
      .addText((text) =>
        text
          .setPlaceholder("you@example.com")
          .setValue(this.plugin.settings.email)
          .onChange(async (value) => {
            this.plugin.settings.email = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Notes folder")
      .setDesc("Vault folder where daily Ultrahuman notes are created.")
      .addText((text) =>
        text
          .setPlaceholder("Ultrahuman")
          .setValue(this.plugin.settings.folder)
          .onChange(async (value) => {
            this.plugin.settings.folder = value.trim().replace(/^\/+|\/+$/g, "");
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Sync on startup")
      .setDesc("Automatically sync recent days when Obsidian starts.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.syncOnStartup)
          .onChange(async (value) => {
            this.plugin.settings.syncOnStartup = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Days to sync")
      .setDesc(
        "How many past days (including today) the sync commands cover. Useful for backfilling late-arriving data."
      )
      .addSlider((slider) =>
        slider
          .setLimits(1, 14, 1)
          .setValue(this.plugin.settings.syncDaysBack)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.syncDaysBack = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Refresh trailing days")
      .setDesc(
        "How many days before today every recent sync re-syncs (today is always included). Notes written before a day's data had fully arrived heal themselves on the next sync."
      )
      .addSlider((slider) =>
        slider
          .setLimits(0, 7, 1)
          .setValue(this.plugin.settings.refreshTrailingDays)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.refreshTrailingDays = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Missed-day lookback")
      .setDesc(
        "How many past days the startup sync and the 'Sync missed days' command scan for dates that have no note yet."
      )
      .addSlider((slider) =>
        slider
          .setLimits(1, 60, 1)
          .setValue(this.plugin.settings.gapLookbackDays)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.gapLookbackDays = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Auto-sync interval")
      .setDesc(
        "Automatically re-sync recent days every N minutes while Obsidian is open. Set to 0 to turn interval syncing off."
      )
      .addSlider((slider) =>
        slider
          .setLimits(0, 240, 5)
          .setValue(this.plugin.settings.autoSyncIntervalMinutes)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.autoSyncIntervalMinutes = value;
            await this.plugin.saveSettings();
            this.plugin.restartAutoSync();
          })
      );
  }
}
