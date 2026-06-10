import { MetricEntry } from "./api";

export interface RenderedMetrics {
  /** Markdown body describing the day's metrics. */
  markdown: string;
  /** Flat scalar values suitable for note frontmatter. */
  frontmatter: Record<string, string | number>;
}

const TYPE_TITLES: Record<string, string> = {
  hr: "Heart Rate",
  hrv: "HRV",
  temp: "Skin Temperature",
  steps: "Steps",
  sleep: "Sleep",
  night_rhr: "Night Resting Heart Rate",
  sleep_rhr: "Sleep Resting Heart Rate",
  avg_sleep_hrv: "Average Sleep HRV",
  recovery_index: "Recovery Index",
  movement_index: "Movement Index",
  metabolic_score: "Metabolic Score",
  vo2_max: "VO2 Max",
  glucose: "Glucose",
  average_glucose: "Average Glucose",
  glucose_variability: "Glucose Variability",
  time_in_target: "Time in Target",
  hba1c: "HbA1c",
};

/** Frontmatter key per metric type for the headline value. */
const FRONTMATTER_KEYS: Record<string, string> = {
  hr: "uh_avg_hr",
  hrv: "uh_avg_hrv",
  temp: "uh_avg_temp",
  steps: "uh_steps",
  sleep: "uh_sleep_score",
  night_rhr: "uh_night_rhr",
  sleep_rhr: "uh_sleep_rhr",
  avg_sleep_hrv: "uh_sleep_hrv",
  recovery_index: "uh_recovery_index",
  movement_index: "uh_movement_index",
  metabolic_score: "uh_metabolic_score",
  vo2_max: "uh_vo2_max",
  average_glucose: "uh_avg_glucose",
  glucose_variability: "uh_glucose_variability",
  time_in_target: "uh_time_in_target",
  hba1c: "uh_hba1c",
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatTimestamp(ts: number): string {
  // Ultrahuman timestamps are unix seconds.
  const date = new Date(ts * 1000);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

interface SeriesStats {
  avg: number;
  min: number;
  max: number;
  last: number;
  count: number;
}

function seriesStats(values: any[]): SeriesStats | null {
  const numbers = values
    .map((entry) => (isFiniteNumber(entry) ? entry : entry?.value))
    .filter(isFiniteNumber);
  if (numbers.length === 0) return null;
  return {
    avg: round(numbers.reduce((sum, n) => sum + n, 0) / numbers.length),
    min: round(Math.min(...numbers)),
    max: round(Math.max(...numbers)),
    last: round(numbers[numbers.length - 1]),
    count: numbers.length,
  };
}

interface MetricSummary {
  title: string;
  /** Headline scalar for frontmatter, if one exists. */
  headline?: number | string;
  unit?: string;
  lines: string[];
}

/**
 * Summarize one metric entry. Works generically across the shapes the
 * Partner API returns: time series ({values: [{value, timestamp}]}),
 * plain scalars ({value}), and richer objects (sleep).
 */
function summarizeMetric(entry: MetricEntry): MetricSummary | null {
  const obj = entry.object;
  if (obj == null || typeof obj !== "object") return null;

  const title: string =
    obj.title ?? TYPE_TITLES[entry.type] ?? entry.type.replace(/_/g, " ");
  const unit: string | undefined =
    typeof obj.unit === "string" && obj.unit.length > 0 ? obj.unit : undefined;
  const lines: string[] = [];
  let headline: number | string | undefined;

  if (entry.type === "sleep") {
    return summarizeSleep(title, obj);
  }

  // Time-series metrics: values: [{value, timestamp}, ...]
  if (Array.isArray(obj.values)) {
    const stats = seriesStats(obj.values);
    if (stats) {
      const u = unit ? ` ${unit}` : "";
      if (entry.type === "steps") {
        // Step series are cumulative-ish samples; the day total is what matters.
        const total = isFiniteNumber(obj.total)
          ? obj.total
          : isFiniteNumber(obj.total_steps)
            ? obj.total_steps
            : stats.last >= stats.max
              ? stats.last
              : stats.max;
        headline = total;
        lines.push(`Total: **${total}**`);
      } else {
        headline = isFiniteNumber(obj.avg) ? round(obj.avg) : stats.avg;
        lines.push(`Average: **${headline}${u}**`);
        lines.push(`Range: ${stats.min}–${stats.max}${u}`);
        lines.push(`Last reading: ${stats.last}${u}`);
      }
      lines.push(`Samples: ${stats.count}`);
    }
  }

  // Scalar metrics: {value: 87} (recovery_index, movement_index, vo2_max...)
  if (headline === undefined && isFiniteNumber(obj.value)) {
    headline = round(obj.value);
    lines.push(`Value: **${headline}${unit ? ` ${unit}` : ""}**`);
  }
  if (headline === undefined && isFiniteNumber(obj.score)) {
    headline = round(obj.score);
    lines.push(`Score: **${headline}**`);
  }
  if (headline === undefined && isFiniteNumber(obj.avg)) {
    headline = round(obj.avg);
    lines.push(`Average: **${headline}${unit ? ` ${unit}` : ""}**`);
  }

  // Extra context fields some metrics carry.
  if (typeof obj.subtitle === "string" && obj.subtitle.length > 0) {
    lines.push(obj.subtitle);
  }
  if (typeof obj.trend_title === "string" && obj.trend_title.length > 0) {
    lines.push(obj.trend_title);
  }

  if (lines.length === 0) return null;
  return { title, headline, unit, lines };
}

function summarizeSleep(title: string, obj: any): MetricSummary | null {
  const lines: string[] = [];
  let headline: number | undefined;

  const score = obj.score ?? obj.sleep_score ?? obj.index;
  if (isFiniteNumber(score)) {
    headline = round(score);
    lines.push(`Sleep score: **${headline}**`);
  }

  const start = obj.bedtime_start ?? obj.sleep_start ?? obj.start_time;
  const end = obj.bedtime_end ?? obj.sleep_end ?? obj.end_time;
  if (isFiniteNumber(start) && isFiniteNumber(end)) {
    lines.push(
      `Bedtime: ${formatTimestamp(start)} → ${formatTimestamp(end)} (${formatDuration(end - start)})`
    );
  }

  // quick_metrics: [{title, value/display_value}, ...] when present.
  const quickMetrics = obj.quick_metrics ?? obj.summary;
  if (Array.isArray(quickMetrics)) {
    for (const qm of quickMetrics) {
      if (qm == null || typeof qm !== "object") continue;
      const qmTitle = qm.title ?? qm.type;
      const qmValue = qm.display_value ?? qm.value ?? qm.score;
      if (qmTitle == null || qmValue == null) continue;
      if (typeof qmValue === "object") continue;
      lines.push(`${qmTitle}: ${qmValue}`);
    }
  }

  // Stage durations when reported as {deep_sleep: seconds, ...} style fields.
  for (const [field, label] of [
    ["deep_sleep_duration", "Deep sleep"],
    ["rem_sleep_duration", "REM sleep"],
    ["light_sleep_duration", "Light sleep"],
    ["awake_duration", "Awake"],
    ["total_sleep_duration", "Total sleep"],
  ] as const) {
    if (isFiniteNumber(obj[field])) {
      lines.push(`${label}: ${formatDuration(obj[field])}`);
    }
  }

  if (lines.length === 0) return null;
  return { title, headline, lines };
}

/** Render a day's metric entries to markdown plus frontmatter scalars. */
export function renderMetrics(
  metrics: MetricEntry[],
  date: string
): RenderedMetrics {
  const frontmatter: Record<string, string | number> = { uh_date: date };
  const sections: string[] = [];

  for (const entry of metrics) {
    let summary: MetricSummary | null = null;
    try {
      summary = summarizeMetric(entry);
    } catch {
      // Never let one malformed metric break the whole sync.
    }
    if (!summary) continue;

    if (summary.headline !== undefined) {
      const key = FRONTMATTER_KEYS[entry.type];
      if (key && !(key in frontmatter)) {
        frontmatter[key] = summary.headline;
      }
    }

    sections.push(
      [`### ${summary.title}`, "", ...summary.lines.map((l) => `- ${l}`)].join("\n")
    );
  }

  const markdown =
    sections.length > 0
      ? sections.join("\n\n")
      : "_No metric data available for this day yet._";

  return { markdown, frontmatter };
}
