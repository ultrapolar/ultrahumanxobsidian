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
}

export const DEFAULT_SETTINGS: UltrahumanSyncSettings = {
  apiKey: "",
  email: "",
  folder: "Ultrahuman",
  syncOnStartup: false,
  syncDaysBack: 1,
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
  }
}
