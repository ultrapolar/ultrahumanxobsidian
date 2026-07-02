import { describe, expect, it } from "vitest";
import { MetricEntry } from "../src/api";
import { renderMetrics } from "../src/render";

const DATE = "2026-07-01";

function render(entries: MetricEntry[]) {
  return renderMetrics(entries, DATE);
}

function series(values: number[]) {
  return values.map((value, i) => ({ value, timestamp: 1_750_000_000 + i * 300 }));
}

describe("renderMetrics", () => {
  it("always includes uh_date in frontmatter", () => {
    const { frontmatter } = render([]);
    expect(frontmatter).toEqual({ uh_date: DATE });
  });

  it("renders a placeholder when there are no usable metrics", () => {
    const { markdown } = render([]);
    expect(markdown).toBe("_No metric data available for this day yet._");
  });

  it("skips entries whose object is missing or not an object", () => {
    const { markdown } = render([
      { type: "hr", object: null },
      { type: "hrv", object: 42 as any },
      { type: "temp", object: "nope" as any },
    ]);
    expect(markdown).toBe("_No metric data available for this day yet._");
  });

  it("never lets one malformed metric break the whole render", () => {
    const evil: any = {};
    Object.defineProperty(evil, "values", {
      get() {
        throw new Error("boom");
      },
    });
    const { markdown, frontmatter } = render([
      { type: "hr", object: evil },
      { type: "recovery_index", object: { value: 81 } },
    ]);
    expect(markdown).toContain("### Recovery Index");
    expect(frontmatter.uh_recovery_index).toBe(81);
  });

  describe("time-series metrics", () => {
    it("computes average, range, last reading and sample count", () => {
      const { markdown, frontmatter } = render([
        { type: "hr", object: { values: series([60, 70, 80]), unit: "bpm" } },
      ]);
      expect(markdown).toContain("### Heart Rate");
      expect(markdown).toContain("- Average: **70 bpm**");
      expect(markdown).toContain("- Range: 60–80 bpm");
      expect(markdown).toContain("- Last reading: 80 bpm");
      expect(markdown).toContain("- Samples: 3");
      expect(frontmatter.uh_avg_hr).toBe(70);
    });

    it("prefers an explicit avg from the API over the computed one", () => {
      const { frontmatter } = render([
        { type: "hrv", object: { values: series([10, 20]), avg: 42.128 } },
      ]);
      expect(frontmatter.uh_avg_hrv).toBe(42.13);
    });

    it("accepts plain numbers in the series and ignores junk entries", () => {
      const { markdown } = render([
        {
          type: "temp",
          object: { values: [36.5, { value: 37.5 }, null, "x", NaN, Infinity, {}] },
        },
      ]);
      expect(markdown).toContain("- Average: **37**");
      expect(markdown).toContain("- Samples: 2");
    });

    it("rounds computed stats to two decimals", () => {
      const { markdown } = render([
        { type: "hr", object: { values: series([1, 2]) } },
      ]);
      // avg of 1 and 2
      expect(markdown).toContain("- Average: **1.5**");
    });

    it("produces no section for a series with no numeric values", () => {
      const { markdown } = render([
        { type: "hr", object: { values: [null, "x", {}] } },
      ]);
      expect(markdown).toBe("_No metric data available for this day yet._");
    });
  });

  describe("steps", () => {
    it("uses the explicit total when present", () => {
      const { markdown, frontmatter } = render([
        { type: "steps", object: { values: series([100, 200]), total: 9876 } },
      ]);
      expect(markdown).toContain("- Total: **9876**");
      expect(frontmatter.uh_steps).toBe(9876);
    });

    it("falls back to total_steps", () => {
      const { frontmatter } = render([
        { type: "steps", object: { values: series([100, 200]), total_steps: 5000 } },
      ]);
      expect(frontmatter.uh_steps).toBe(5000);
    });

    it("falls back to the last sample of a non-decreasing series", () => {
      const { frontmatter } = render([
        { type: "steps", object: { values: series([100, 200, 300]) } },
      ]);
      expect(frontmatter.uh_steps).toBe(300);
    });

    it("falls back to the max sample when the series dips at the end", () => {
      const { frontmatter } = render([
        { type: "steps", object: { values: series([100, 500, 300]) } },
      ]);
      expect(frontmatter.uh_steps).toBe(500);
    });
  });

  describe("scalar metrics", () => {
    it("uses value with its unit", () => {
      const { markdown, frontmatter } = render([
        { type: "vo2_max", object: { value: 48.257, unit: "ml/kg/min" } },
      ]);
      expect(markdown).toContain("### VO2 Max");
      expect(markdown).toContain("- Value: **48.26 ml/kg/min**");
      expect(frontmatter.uh_vo2_max).toBe(48.26);
    });

    it("falls back from value to score to avg", () => {
      const { frontmatter, markdown } = render([
        { type: "recovery_index", object: { score: 88 } },
        { type: "average_glucose", object: { avg: 101.5, unit: "mg/dL" } },
      ]);
      expect(markdown).toContain("- Score: **88**");
      expect(markdown).toContain("- Average: **101.5 mg/dL**");
      expect(frontmatter.uh_recovery_index).toBe(88);
      expect(frontmatter.uh_avg_glucose).toBe(101.5);
    });

    it("appends subtitle and trend_title context lines", () => {
      const { markdown } = render([
        {
          type: "movement_index",
          object: { value: 72, subtitle: "Good day", trend_title: "Up 5% vs last week" },
        },
      ]);
      expect(markdown).toContain("- Good day");
      expect(markdown).toContain("- Up 5% vs last week");
    });

    it("ignores empty-string unit, subtitle and trend_title", () => {
      const { markdown } = render([
        { type: "vo2_max", object: { value: 48, unit: "", subtitle: "", trend_title: "" } },
      ]);
      expect(markdown).toContain("- Value: **48**");
      expect(markdown).not.toContain("- \n");
    });
  });

  describe("titles", () => {
    it("prefers the object's own title", () => {
      const { markdown } = render([
        { type: "hr", object: { title: "Custom Title", value: 60 } },
      ]);
      expect(markdown).toContain("### Custom Title");
    });

    it("humanizes unknown types by replacing underscores", () => {
      const { markdown } = render([
        { type: "some_new_metric", object: { value: 1 } },
      ]);
      expect(markdown).toContain("### some new metric");
    });

    it("does not write frontmatter for types without a frontmatter key", () => {
      const { frontmatter } = render([
        { type: "some_new_metric", object: { value: 1 } },
      ]);
      expect(frontmatter).toEqual({ uh_date: DATE });
    });
  });

  describe("sleep", () => {
    it("summarizes score, bedtime and stage durations", () => {
      const start = 1_750_000_000;
      const end = start + 7 * 3600 + 30 * 60;
      const { markdown, frontmatter } = render([
        {
          type: "sleep",
          object: {
            score: 84.6,
            bedtime_start: start,
            bedtime_end: end,
            deep_sleep_duration: 3600,
            rem_sleep_duration: 90 * 60,
            light_sleep_duration: 45 * 60,
            awake_duration: 10 * 60,
            total_sleep_duration: 7 * 3600,
          },
        },
      ]);
      expect(markdown).toContain("### Sleep");
      expect(markdown).toContain("- Sleep score: **84.6**");
      expect(markdown).toContain("(7h 30m)");
      expect(markdown).toContain("- Deep sleep: 1h 0m");
      expect(markdown).toContain("- REM sleep: 1h 30m");
      expect(markdown).toContain("- Light sleep: 45m");
      expect(markdown).toContain("- Awake: 10m");
      expect(markdown).toContain("- Total sleep: 7h 0m");
      expect(frontmatter.uh_sleep_score).toBe(84.6);
    });

    it("falls back through sleep_score and index for the score", () => {
      const bySleepScore = render([{ type: "sleep", object: { sleep_score: 70 } }]);
      expect(bySleepScore.frontmatter.uh_sleep_score).toBe(70);

      const byIndex = render([{ type: "sleep", object: { index: 65 } }]);
      expect(byIndex.frontmatter.uh_sleep_score).toBe(65);
    });

    it("renders quick_metrics and skips unusable entries", () => {
      const { markdown } = render([
        {
          type: "sleep",
          object: {
            score: 80,
            quick_metrics: [
              { title: "Efficiency", display_value: "92%" },
              { type: "restfulness", value: 7 },
              { title: "Broken", value: { nested: true } },
              { title: "No value" },
              null,
              "junk",
            ],
          },
        },
      ]);
      expect(markdown).toContain("- Efficiency: 92%");
      expect(markdown).toContain("- restfulness: 7");
      expect(markdown).not.toContain("Broken");
      expect(markdown).not.toContain("No value");
    });

    it("produces no section when the sleep object has nothing usable", () => {
      const { markdown } = render([{ type: "sleep", object: {} }]);
      expect(markdown).toBe("_No metric data available for this day yet._");
    });
  });

  describe("frontmatter collisions", () => {
    it("keeps the first headline when a type appears twice", () => {
      const { frontmatter } = render([
        { type: "recovery_index", object: { value: 81 } },
        { type: "recovery_index", object: { value: 12 } },
      ]);
      expect(frontmatter.uh_recovery_index).toBe(81);
    });
  });

  it("joins multiple sections with blank lines", () => {
    const { markdown } = render([
      { type: "recovery_index", object: { value: 81 } },
      { type: "movement_index", object: { value: 60 } },
    ]);
    expect(markdown).toBe(
      [
        "### Recovery Index",
        "",
        "- Value: **81**",
        "",
        "### Movement Index",
        "",
        "- Value: **60**",
      ].join("\n")
    );
  });
});
