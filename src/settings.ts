import { App, PluginSettingTab, Setting } from "obsidian";
import type UltrahumanDashboardPlugin from "./main";

export interface UltrahumanPluginSettings {
  apiKey: string;
  baseUrl: string;
  metrics: string[];
  refreshOnStartup: boolean;
}

export const DEFAULT_SETTINGS: UltrahumanPluginSettings = {
  apiKey: "",
  baseUrl: "https://api.ultrahuman.com/v1",
  metrics: ["glucose", "hive", "sleep"],
  refreshOnStartup: true
};

export class UltrahumanSettingTab extends PluginSettingTab {
  plugin: UltrahumanDashboardPlugin;

  constructor(app: App, plugin: UltrahumanDashboardPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Ultrahuman Daily Dashboard" });

    new Setting(containerEl)
      .setName("API Key")
      .setDesc(
        "Personal access token for the Ultrahuman API. Stored locally inside the plugin data folder."
      )
      .addText((text) =>
        text
          .setPlaceholder("Enter your Ultrahuman API key")
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("API Base URL")
      .setDesc("Adjust only if you use a custom Ultrahuman environment.")
      .addText((text) =>
        text
          .setPlaceholder("https://api.ultrahuman.com/v1")
          .setValue(this.plugin.settings.baseUrl)
          .onChange(async (value) => {
            this.plugin.settings.baseUrl = value.trim() || DEFAULT_SETTINGS.baseUrl;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Ultrahuman Login")
      .setDesc("Open the Ultrahuman dashboard to sign in and generate an API key.")
      .addButton((button) =>
        button
          .setButtonText("Open login page")
          .setCta()
          .onClick(() => {
            const loginUrl = "https://app.ultrahuman.com/login";
            if (typeof this.app.openWithDefaultApp === "function") {
              this.app.openWithDefaultApp(loginUrl);
            } else {
              window.open(loginUrl, "_blank", "noopener");
            }
          })
      );

    new Setting(containerEl)
      .setName("Metrics")
      .setDesc("Comma-separated list of metrics to render as charts.")
      .addText((text) =>
        text
          .setPlaceholder("glucose, hive, sleep")
          .setValue(this.plugin.settings.metrics.join(", "))
          .onChange(async (value) => {
            this.plugin.settings.metrics = value
              .split(",")
              .map((metric) => metric.trim())
              .filter(Boolean);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Refresh on startup")
      .setDesc("Automatically fetch the latest metrics when Obsidian starts.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.refreshOnStartup)
          .onChange(async (value) => {
            this.plugin.settings.refreshOnStartup = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
