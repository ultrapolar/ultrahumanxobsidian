const {
  Plugin,
  Notice,
  moment,
  normalizePath,
  requestUrl,
  PluginSettingTab,
  Setting,
  TFile
} = require("obsidian");

const DEFAULT_SETTINGS = {
  apiKey: "",
  baseUrl: "https://api.ultrahuman.com/v1",
  metrics: ["glucose", "hive", "sleep"],
  refreshOnStartup: true
};

const PLUGIN_DISPLAY_NAME = "Ultrahuman × Obsidian";
const START_MARKER = "<!-- ultrahuman-dashboard:start -->";
const END_MARKER = "<!-- ultrahuman-dashboard:end -->";
const SVG_NS = "http://www.w3.org/2000/svg";

function getDailyNotesPlugin(app) {
  if (app?.internalPlugins?.getPluginById) {
    return app.internalPlugins.getPluginById("daily-notes");
  }
  return app?.internalPlugins?.plugins?.["daily-notes"] ?? null;
}

function getDailyNoteSettings(app) {
  const dailyNotesPlugin = getDailyNotesPlugin(app);
  const options = dailyNotesPlugin?.instance?.options ?? {};
  return {
    enabled: dailyNotesPlugin?.enabled ?? false,
    folder: (options.folder ?? "").trim(),
    format: options.format || "YYYY-MM-DD",
    template: (options.template ?? "").trim()
  };
}

function getAllDailyNotes(app) {
  const notes = {};
  const settings = getDailyNoteSettings(app);
  const folder = settings.folder ? normalizePath(settings.folder) : "";
  const format = settings.format || "YYYY-MM-DD";
  const files = app.vault.getMarkdownFiles();

  files.forEach((file) => {
    if (folder) {
      const folderWithSlash = folder.endsWith("/") ? folder : `${folder}/`;
      if (file.path !== folder && !file.path.startsWith(folderWithSlash)) {
        return;
      }
    }

    const fileDate = moment(file.basename, format, true);
    if (!fileDate.isValid()) {
      return;
    }

    notes[fileDate.format("YYYY-MM-DD")] = file;
  });

  return notes;
}

function getDailyNoteForDate(app, date, dailyNotes) {
  const key = date.format("YYYY-MM-DD");
  if (dailyNotes?.[key] instanceof TFile) {
    return dailyNotes[key];
  }
  const settings = getDailyNoteSettings(app);
  const folder = settings.folder ? normalizePath(settings.folder) : "";
  const format = settings.format || "YYYY-MM-DD";
  const filename = date.format(format);
  const path = folder ? `${folder}/${filename}.md` : `${filename}.md`;
  const existing = app.vault.getAbstractFileByPath(path);
  return existing instanceof TFile ? existing : null;
}

async function createDailyNote(app, date) {
  const settings = getDailyNoteSettings(app);
  const folder = settings.folder ? normalizePath(settings.folder) : "";
  const format = settings.format || "YYYY-MM-DD";
  const filename = date.format(format);
  const path = folder ? `${folder}/${filename}.md` : `${filename}.md`;

  const existing = app.vault.getAbstractFileByPath(path);
  if (existing instanceof TFile) {
    return existing;
  }

  if (folder) {
    await ensureFolder(app, folder);
  }

  const templateContents = await loadTemplate(app, settings.template);
  const file = await app.vault.create(path, templateContents || "");
  return file;
}

async function ensureFolder(app, folderPath) {
  if (!folderPath) {
    return;
  }

  const segments = folderPath.split("/").filter(Boolean);
  let current = "";
  for (const segment of segments) {
    current = current ? `${current}/${segment}` : segment;
    const abstract = app.vault.getAbstractFileByPath(current);
    if (!abstract) {
      try {
        await app.vault.createFolder(current);
      } catch (error) {
        // Folder already exists or cannot be created; ignore.
      }
    }
  }
}

async function loadTemplate(app, templatePath) {
  if (!templatePath) {
    return "";
  }

  const normalized = normalizePath(templatePath);
  let templateFile = app.vault.getAbstractFileByPath(normalized);

  if (!templateFile && normalized.endsWith(".md")) {
    const withoutExt = normalized.replace(/\.md$/i, "");
    templateFile = app.metadataCache?.getFirstLinkpathDest?.(withoutExt, "") ?? null;
  }

  if (templateFile instanceof TFile) {
    try {
      return await app.vault.read(templateFile);
    } catch (error) {
      console.error(`${PLUGIN_DISPLAY_NAME}: failed to read daily note template`, error);
    }
  }

  return "";
}

class UltrahumanSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: PLUGIN_DISPLAY_NAME });

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
          .setPlaceholder(DEFAULT_SETTINGS.baseUrl)
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
            } else if (typeof window !== "undefined" && typeof window.open === "function") {
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

function createSvgElement(tag, attributes = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  Object.entries(attributes).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    el.setAttribute(key, String(value));
  });
  return el;
}

function renderLineChart(container, metric, { formatTime }) {
  const points = Array.isArray(metric?.points) ? metric.points : [];
  if (!points.length) {
    return;
  }

  const width = 720;
  const height = 260;
  const margin = { top: 24, right: 28, bottom: 40, left: 56 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const numericPoints = points
    .map((point) => ({
      timestamp: point?.timestamp,
      value: Number(point?.value)
    }))
    .filter((point) => Number.isFinite(point.value));

  if (!numericPoints.length) {
    return;
  }

  const minValue = Math.min(...numericPoints.map((point) => point.value));
  const maxValue = Math.max(...numericPoints.map((point) => point.value));
  const valueRange = maxValue - minValue || 1;

  const svg = createSvgElement("svg", {
    viewBox: `0 0 ${width} ${height}`,
    preserveAspectRatio: "none",
    class: "ultrahuman-dashboard__svg"
  });
  container.appendChild(svg);

  const gridGroup = createSvgElement("g", { class: "ultrahuman-dashboard__grid" });
  svg.appendChild(gridGroup);

  const gridLines = 4;
  for (let i = 0; i <= gridLines; i++) {
    const y = margin.top + (innerHeight / gridLines) * i;
    const line = createSvgElement("line", {
      x1: margin.left,
      x2: width - margin.right,
      y1: y,
      y2: y
    });
    gridGroup.appendChild(line);
  }

  const getX = (index) => {
    if (numericPoints.length === 1) {
      return margin.left + innerWidth / 2;
    }
    return margin.left + (innerWidth * index) / (numericPoints.length - 1);
  };

  const getY = (value) => {
    const normalized = (value - minValue) / valueRange;
    return margin.top + (1 - normalized) * innerHeight;
  };

  const areaPathParts = [];
  const linePathParts = [];

  numericPoints.forEach((point, index) => {
    const x = getX(index);
    const y = getY(point.value);
    linePathParts.push(`${index === 0 ? "M" : "L"} ${x} ${y}`);
    areaPathParts.push(`${index === 0 ? "M" : "L"} ${x} ${y}`);
  });

  areaPathParts.push(
    `L ${getX(numericPoints.length - 1)} ${margin.top + innerHeight}`,
    `L ${getX(0)} ${margin.top + innerHeight}`,
    "Z"
  );

  const areaPath = createSvgElement("path", {
    d: areaPathParts.join(" "),
    class: "ultrahuman-dashboard__area"
  });
  svg.appendChild(areaPath);

  const linePath = createSvgElement("path", {
    d: linePathParts.join(" "),
    class: "ultrahuman-dashboard__line"
  });
  svg.appendChild(linePath);

  const pointsGroup = createSvgElement("g", { class: "ultrahuman-dashboard__points" });
  svg.appendChild(pointsGroup);

  numericPoints.forEach((point, index) => {
    const x = getX(index);
    const y = getY(point.value);
    const circle = createSvgElement("circle", {
      cx: x,
      cy: y,
      r: 4
    });
    pointsGroup.appendChild(circle);
  });

  const axesGroup = createSvgElement("g", { class: "ultrahuman-dashboard__axes" });
  svg.appendChild(axesGroup);

  const minLabel = createSvgElement("text", {
    x: margin.left - 12,
    y: margin.top + innerHeight,
    "text-anchor": "end",
    dy: "0.35em"
  });
  minLabel.textContent = formatNumber(minValue, metric?.unit);
  axesGroup.appendChild(minLabel);

  const maxLabel = createSvgElement("text", {
    x: margin.left - 12,
    y: margin.top,
    "text-anchor": "end",
    dy: "0.35em"
  });
  maxLabel.textContent = formatNumber(maxValue, metric?.unit);
  axesGroup.appendChild(maxLabel);

  const labelIndices = new Set([0, Math.floor((numericPoints.length - 1) / 2), numericPoints.length - 1]);
  labelIndices.forEach((index) => {
    const point = numericPoints[index];
    if (!point) return;
    const x = getX(index);
    const label = createSvgElement("text", {
      x,
      y: height - margin.bottom / 2,
      "text-anchor": index === numericPoints.length - 1 ? "end" : index === 0 ? "start" : "middle"
    });
    label.textContent = formatTime(point.timestamp);
    axesGroup.appendChild(label);
  });
}

function formatNumber(value, unit) {
  if (!Number.isFinite(value)) {
    return "";
  }
  const rounded = Math.round(value * 100) / 100;
  return unit ? `${rounded} ${unit}` : String(rounded);
}

module.exports = class UltrahumanObsidianPlugin extends Plugin {
  async onload() {
    await this.loadSettings();

    this.registerMarkdownCodeBlockProcessor(
      "ultrahuman",
      this.renderUltrahumanBlock.bind(this)
    );

    this.addSettingTab(new UltrahumanSettingTab(this.app, this));

    this.addCommand({
      id: "refresh-ultrahuman-dashboard",
      name: "Refresh Ultrahuman metrics",
      callback: () => {
        void this.refreshDailyNote();
      }
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

  onunload() {}

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async getTodayNote(createIfMissing = true) {
    try {
      const settings = getDailyNoteSettings(this.app);
      if (!settings.enabled) {
        throw new Error("Daily notes plugin is disabled");
      }

      const dailyNotes = getAllDailyNotes(this.app);
      const today = moment().startOf("day");
      let note = getDailyNoteForDate(this.app, today, dailyNotes);

      if (!note && createIfMissing) {
        note = await createDailyNote(this.app, today);
      }

      return note ?? null;
    } catch (error) {
      console.error(`${PLUGIN_DISPLAY_NAME}: failed to resolve daily note`, error);
      new Notice(
        `${PLUGIN_DISPLAY_NAME}: enable the Daily notes core plugin to write metrics.`,
        8000
      );
      return null;
    }
  }

  async refreshDailyNote() {
    const note = await this.getTodayNote();
    if (!note) {
      return;
    }

    const settings = getDailyNoteSettings(this.app);
    const format = settings.format || "YYYY-MM-DD";
    const parsedDate = moment(note.basename, format, true);
    const dateISO = parsedDate.isValid() ? parsedDate.format("YYYY-MM-DD") : moment().format("YYYY-MM-DD");

    const data = await this.fetchUltrahumanData(dateISO);
    if (!data) {
      return;
    }

    await this.writeDashboardToNote(note, data);
  }

  async fetchUltrahumanData(dateISO) {
    if (!this.settings.apiKey) {
      new Notice(`${PLUGIN_DISPLAY_NAME}: add your API key in the settings panel.`, 8000);
      return null;
    }

    const trimmedBase = this.settings.baseUrl.replace(/\/$/, "");
    const url = new URL(`${trimmedBase}/metrics/daily`);
    url.searchParams.set("date", dateISO);
    if (Array.isArray(this.settings.metrics) && this.settings.metrics.length) {
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

      if (!response?.json) {
        throw new Error("Empty response from Ultrahuman API");
      }

      return this.normalizeApiResponse(response.json, dateISO);
    } catch (error) {
      console.error(`${PLUGIN_DISPLAY_NAME}: fetch failed`, error);
      new Notice(
        `${PLUGIN_DISPLAY_NAME}: unable to fetch data from Ultrahuman. Check the console for details.`,
        8000
      );
      return null;
    }
  }

  normalizeApiResponse(payload, fallbackDate) {
    const metrics = {};
    if (Array.isArray(payload?.metrics)) {
      payload.metrics.forEach((metric) => {
        if (!metric || !metric.name) return;
        metrics[metric.name] = {
          unit: metric.unit,
          points: Array.isArray(metric.points) ? metric.points : []
        };
      });
    } else if (payload?.metrics && typeof payload.metrics === "object") {
      Object.entries(payload.metrics).forEach(([name, metric]) => {
        if (!metric) return;
        metrics[name] = {
          unit: metric.unit,
          points: Array.isArray(metric.points) ? metric.points : []
        };
      });
    }

    let filtered = metrics;
    if (Array.isArray(this.settings.metrics) && this.settings.metrics.length) {
      filtered = Object.fromEntries(
        Object.entries(metrics).filter(([name]) => this.settings.metrics.includes(name))
      );
    }

    return {
      date: payload?.date ?? fallbackDate,
      metrics: filtered
    };
  }

  async writeDashboardToNote(note, data) {
    const current = await this.app.vault.read(note);
    const block = this.serializeDashboard(data);

    const startIndex = current.indexOf(START_MARKER);
    const endIndex = current.indexOf(END_MARKER);

    let updated;
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

  serializeDashboard(data) {
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

  renderUltrahumanBlock(source, el) {
    let parsed = null;
    try {
      parsed = JSON.parse(source);
    } catch (error) {
      console.error(`${PLUGIN_DISPLAY_NAME}: failed to parse block`, error);
    }

    if (!parsed || typeof parsed !== "object" || !parsed.metrics) {
      el.createEl("p", { text: "Ultrahuman dashboard data is missing or invalid." });
      return;
    }

    const entries = Object.entries(parsed.metrics).filter(([, metric]) => {
      return metric && Array.isArray(metric.points) && metric.points.length > 0;
    });

    if (!entries.length) {
      el.createEl("p", { text: "Ultrahuman dashboard data is missing or invalid." });
      return;
    }

    const wrapper = el.createDiv({ cls: "ultrahuman-dashboard" });

    entries.forEach(([name, metric]) => {
      const chartContainer = wrapper.createDiv({ cls: "ultrahuman-dashboard__chart" });
      const heading = chartContainer.createEl("h3", { text: this.toTitleCase(name) });
      if (metric?.unit) {
        heading.setAttribute("data-label", metric.unit);
      }

      const summary = this.createMetricSummary(metric);
      if (summary) {
        chartContainer.createDiv({ cls: "ultrahuman-dashboard__summary", text: summary });
      }

      renderLineChart(chartContainer, metric, {
        formatTime: (value) => this.formatTime(value)
      });
    });
  }

  createMetricSummary(metric) {
    if (!metric || !Array.isArray(metric.points) || metric.points.length === 0) {
      return "";
    }
    const numericPoints = metric.points
      .map((point) => Number(point?.value))
      .filter((value) => Number.isFinite(value));
    if (!numericPoints.length) {
      return "";
    }
    const latest = metric.points[metric.points.length - 1];
    const minValue = Math.min(...numericPoints);
    const maxValue = Math.max(...numericPoints);
    const avgValue = numericPoints.reduce((total, value) => total + value, 0) / numericPoints.length;

    const formattedLatest = formatNumber(Number(latest?.value), metric.unit);
    const formattedMin = formatNumber(minValue, metric.unit);
    const formattedMax = formatNumber(maxValue, metric.unit);
    const formattedAvg = formatNumber(avgValue, metric.unit);

    const parts = [];
    if (formattedLatest) {
      parts.push(`Latest ${formattedLatest}`);
    }
    if (formattedAvg) {
      parts.push(`Avg ${formattedAvg}`);
    }
    const range = [formattedMin, formattedMax].filter(Boolean).join(" – ");
    if (range) {
      parts.push(`Range ${range}`);
    }

    return parts.join(" • ");
  }

  toTitleCase(value) {
    return String(value || "")
      .split(/[\s_-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  formatTime(iso) {
    const time = moment(iso);
    if (!time.isValid()) {
      return iso || "";
    }
    return time.format("HH:mm");
  }
};
