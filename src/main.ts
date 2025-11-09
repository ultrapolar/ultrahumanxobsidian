import Chart from "chart.js/auto";
import {
  MarkdownPostProcessorContext,
  MarkdownRenderChild,
  Notice,
  Plugin,
  TFile,
  moment,
  requestUrl
} from "obsidian";
import {
  createDailyNote,
  getAllDailyNotes,
  getDailyNote,
  getDailyNoteSettings
} from "obsidian-daily-notes-interface";
import {
  DEFAULT_SETTINGS,
  UltrahumanPluginSettings,
  UltrahumanSettingTab
} from "./settings";

interface UltrahumanApiPoint {
  timestamp: string;
  value: number;
}

interface UltrahumanApiMetric {
  name: string;
  unit?: string;
  points: UltrahumanApiPoint[];
}

interface UltrahumanApiResponse {
  date: string;
  metrics: UltrahumanApiMetric[] | Record<string, UltrahumanApiMetric>;
}

interface UltrahumanChartSeries {
  unit?: string;
  points: UltrahumanApiPoint[];
}

interface UltrahumanDashboardData {
  date: string;
  metrics: Record<string, UltrahumanChartSeries>;
}

const START_MARKER = "<!-- ultrahuman-dashboard:start -->";
const END_MARKER = "<!-- ultrahuman-dashboard:end -->";

class ChartCollection extends MarkdownRenderChild {
  private charts: Chart[] = [];

  constructor(containerEl: HTMLElement) {
    super(containerEl);
  }

  register(chart: Chart) {
    this.charts.push(chart);
  }

  onunload(): void {
    this.charts.forEach((chart) => chart.destroy());
    this.charts.length = 0;
  }
}

export default class UltrahumanDashboardPlugin extends Plugin {
  settings: UltrahumanPluginSettings;

  async onload() {
    await this.loadSettings();

    this.registerMarkdownCodeBlockProcessor(
      "ultrahuman",
      this.renderUltrahumanBlock.bind(this)
    );

    this.addSettingTab(new UltrahumanSettingTab(this.app, this));

    this.addCommand({
      id: "refresh-ultrahuman-dashboard",
      name: "Refresh Ultrahuman dashboard",
      callback: () => this.refreshDailyNote()
    });

    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        if (!file) return;
        void this.getTodayNote(false).then((today) => {
          if (today && file.path === today.path) {
            void this.refreshDailyNote();
          }
        });
      })
    );

    this.app.workspace.onLayoutReady(async () => {
      if (this.settings.refreshOnStartup) {
        await this.refreshDailyNote();
      }
    });
  }

  onunload(): void {}

  private async getTodayNote(createIfMissing = true): Promise<TFile | null> {
    try {
      const dailyNotes = getAllDailyNotes();
      const dailyNoteSettings = getDailyNoteSettings();
      const today = moment().startOf("day");
      let note = getDailyNote(today, dailyNotes);
      if (!note && dailyNoteSettings && createIfMissing) {
        note = await createDailyNote(today);
      }
      return note ?? null;
    } catch (error) {
      console.error("Ultrahuman Dashboard: failed to resolve daily note", error);
      new Notice(
        "Ultrahuman Dashboard: enable the Daily notes core plugin to write metrics.",
        8000
      );
      return null;
    }
  }

  private async refreshDailyNote(): Promise<void> {
    const note = await this.getTodayNote();
    if (!note) {
      return;
    }

    const dateISO = moment(note.basename, "YYYY-MM-DD", true).isValid()
      ? moment(note.basename, "YYYY-MM-DD", true).format("YYYY-MM-DD")
      : moment().format("YYYY-MM-DD");

    const data = await this.fetchUltrahumanData(dateISO);
    if (!data) {
      return;
    }

    await this.writeDashboardToNote(note, data);
  }

  private async fetchUltrahumanData(dateISO: string): Promise<UltrahumanDashboardData | null> {
    if (!this.settings.apiKey) {
      new Notice("Ultrahuman Dashboard: add your API key in the settings panel.", 8000);
      return null;
    }

    const trimmedBase = this.settings.baseUrl.replace(/\/$/, "");
    const url = new URL(`${trimmedBase}/metrics/daily`);
    url.searchParams.set("date", dateISO);
    if (this.settings.metrics.length) {
      url.searchParams.set("metrics", this.settings.metrics.join(","));
    }

    try {
      const response = await requestUrl({
        url: url.toString(),
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.settings.apiKey}`
        }
      });

      if (!response.json) {
        throw new Error("Empty response from Ultrahuman API");
      }

      const normalized = this.normalizeApiResponse(response.json as UltrahumanApiResponse, dateISO);
      return normalized;
    } catch (error) {
      console.error("Ultrahuman Dashboard: fetch failed", error);
      new Notice(
        "Ultrahuman Dashboard: unable to fetch data from Ultrahuman. Check the console for details.",
        8000
      );
      return null;
    }
  }

  private normalizeApiResponse(
    payload: UltrahumanApiResponse,
    fallbackDate: string
  ): UltrahumanDashboardData {
    const metrics: Record<string, UltrahumanChartSeries> = {};

    if (Array.isArray(payload.metrics)) {
      payload.metrics.forEach((metric) => {
        if (!metric || !metric.name) return;
        metrics[metric.name] = {
          unit: metric.unit,
          points: Array.isArray(metric.points) ? metric.points : []
        };
      });
    } else if (payload.metrics && typeof payload.metrics === "object") {
      Object.entries(payload.metrics).forEach(([name, metric]) => {
        if (!metric) return;
        metrics[name] = {
          unit: metric.unit,
          points: Array.isArray(metric.points) ? metric.points : []
        };
      });
    }

    const filteredMetrics = this.settings.metrics.length
      ? Object.fromEntries(
          Object.entries(metrics).filter(([name]) =>
            this.settings.metrics.includes(name)
          )
        )
      : metrics;

    return {
      date: payload?.date ?? fallbackDate,
      metrics: filteredMetrics
    };
  }

  private async writeDashboardToNote(note: TFile, data: UltrahumanDashboardData) {
    const current = await this.app.vault.read(note);
    const block = this.serializeDashboard(data);

    let updated: string;
    const startIndex = current.indexOf(START_MARKER);
    const endIndex = current.indexOf(END_MARKER);

    if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
      const existing = current.slice(startIndex, endIndex + END_MARKER.length);
      if (existing === block) {
        return;
      }
      updated =
        current.slice(0, startIndex) + block + current.slice(endIndex + END_MARKER.length);
    } else {
      const prefix = current.endsWith("\n") ? "" : "\n";
      updated = `${current}${prefix}\n${block}`;
    }

    await this.app.vault.modify(note, updated);
  }

  private serializeDashboard(data: UltrahumanDashboardData): string {
    return [
      START_MARKER,
      "",
      "```ultrahuman",
      JSON.stringify(data, null, 2),
      "```",
      "",
      END_MARKER
    ].join("\n");
  }

  private async renderUltrahumanBlock(
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext
  ): Promise<void> {
    let parsed: UltrahumanDashboardData | null = null;

    try {
      parsed = JSON.parse(source) as UltrahumanDashboardData;
    } catch (error) {
      console.error("Ultrahuman Dashboard: failed to parse block", error);
    }

    if (!parsed || !parsed.metrics || Object.keys(parsed.metrics).length === 0) {
      el.createEl("p", {
        text: "Ultrahuman dashboard data is missing or invalid."
      });
      return;
    }

    const wrapper = el.createDiv({ cls: "ultrahuman-dashboard" });
    const chartComponent = new ChartCollection(wrapper);
    ctx.addChild(chartComponent);

    Object.entries(parsed.metrics).forEach(([name, metric]) => {
      if (!metric || !Array.isArray(metric.points) || metric.points.length === 0) {
        return;
      }

      const chartContainer = wrapper.createDiv({ cls: "ultrahuman-dashboard__chart" });
      chartContainer.createEl("h3", { text: this.toTitleCase(name) });
      const canvas = chartContainer.createEl("canvas");

      const labels = metric.points.map((point) => this.formatTime(point.timestamp));
      const values = metric.points.map((point) => point.value);

      const chart = new Chart(canvas.getContext("2d")!, {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: metric.unit ? `${this.toTitleCase(name)} (${metric.unit})` : this.toTitleCase(name),
              data: values,
              borderColor: "#6f9df1",
              backgroundColor: "rgba(111, 157, 241, 0.2)",
              tension: 0.35
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              ticks: {
                autoSkip: true,
                maxTicksLimit: 6
              }
            },
            y: {
              beginAtZero: false
            }
          },
          plugins: {
            legend: {
              display: false
            },
            tooltip: {
              callbacks: {
                label: (context) => {
                  const value = context.formattedValue;
                  return metric.unit ? `${value} ${metric.unit}` : value;
                }
              }
            }
          }
        }
      });

      chartComponent.register(chart);
    });
  }

  private toTitleCase(value: string): string {
    return value
      .split(/[\s_-]+/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  private formatTime(iso: string): string {
    const time = moment(iso);
    if (!time.isValid()) {
      return iso;
    }
    return time.format("HH:mm");
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
