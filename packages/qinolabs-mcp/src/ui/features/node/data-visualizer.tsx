/**
 * Data Visualizer
 *
 * Renders Observable Plot charts driven by x-view hints in JSON Schema.
 * Falls back gracefully when no hints are present (caller shows JsonViewer).
 *
 * View vocabulary (closed set):
 *   bar      — Plot.barX / Plot.barY for summaries and comparisons
 *   heatmap  — Plot.cell for matrix data (turns x dimensions)
 *   line     — Plot.line + Plot.dot for trends across a sequence
 *   dot      — Plot.dot for scatter / distributions
 *
 * The component walks schema properties looking for x-view annotations,
 * extracts the corresponding data, and produces charts.
 */

import { useEffect, useRef } from "react";
import * as Plot from "@observablehq/plot";

import type { JsonValue } from "~/server/types";

// ---------------------------------------------------------------------------
// x-view hint types
// ---------------------------------------------------------------------------

interface XViewBar {
  type: "bar";
  range?: [number, number];
  orientation?: "horizontal" | "vertical";
}

interface XViewHeatmap {
  type: "heatmap";
  x: string;
  y: string;
  fill: string;
  range?: [number, number];
}

interface XViewLine {
  type: "line";
  x: string;
  y: string;
  range?: [number, number];
}

interface XViewDot {
  type: "dot";
  x: string;
  y: string;
  fill?: string;
  range?: [number, number];
}

type XViewHint = XViewBar | XViewHeatmap | XViewLine | XViewDot;

interface SchemaProperty {
  type?: string;
  "x-view"?: XViewHint;
  properties?: Record<string, SchemaProperty>;
  items?: SchemaProperty;
  description?: string;
}

interface SchemaRoot {
  properties?: Record<string, SchemaProperty>;
  "x-view"?: XViewHint;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Schema walking — find all x-view hints with their data paths
// ---------------------------------------------------------------------------

interface ViewSpec {
  key: string;
  hint: XViewHint;
  label: string;
}

function collectViewSpecs(schema: SchemaRoot): ViewSpec[] {
  const specs: ViewSpec[] = [];

  if (!schema.properties) return specs;

  for (const [key, prop] of Object.entries(schema.properties)) {
    const hint = prop["x-view"];
    if (hint) {
      const label = prop.description ?? key.charAt(0).toUpperCase() + key.slice(1);
      specs.push({ key, hint, label });
    }
  }

  return specs;
}

// ---------------------------------------------------------------------------
// Data extraction helpers
// ---------------------------------------------------------------------------

function getNestedValue(obj: Record<string, JsonValue>, path: string): JsonValue {
  const parts = path.split(".");
  let current: JsonValue = obj;
  for (const part of parts) {
    if (part === "*") return current;
    if (typeof current !== "object" || current === null || Array.isArray(current)) {
      return null;
    }
    current = (current as Record<string, JsonValue>)[part] ?? null;
  }
  return current;
}

// ---------------------------------------------------------------------------
// Chart colors — dark-mode compatible, stone palette
// ---------------------------------------------------------------------------

const CHART_COLORS = {
  text: "#a8a29e", // stone-400
  gridStroke: "#44403c", // stone-700
  /** Divergent pink↔green scheme — low scores pink, mid yellow, high green */
  scheme: "PiYG" as const,
};

// ---------------------------------------------------------------------------
// Bar chart renderer
// ---------------------------------------------------------------------------

interface BarChartProps {
  data: Record<string, JsonValue>;
  hint: XViewBar;
  label: string;
}

function BarChart({ data, hint, label }: BarChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Convert object to array of {key, value} entries
    const entries = Object.entries(data)
      .filter(([, v]) => typeof v === "number")
      .map(([key, value]) => ({
        dimension: key.charAt(0).toUpperCase() + key.slice(1),
        value: value as number,
      }));

    if (entries.length === 0) return;

    const isHorizontal = hint.orientation !== "vertical";

    const domain = hint.range ?? [0, Math.max(...entries.map((e) => e.value)) * 1.1];

    const plot = Plot.plot({
      width: containerRef.current.clientWidth,
      height: Math.max(entries.length * 32 + 40, 120),
      marginLeft: isHorizontal ? 100 : 40,
      marginBottom: isHorizontal ? 24 : 40,
      marginTop: 8,
      marginRight: 40,
      style: {
        background: "transparent",
        color: CHART_COLORS.text,
        fontSize: "11px",
      },
      x: isHorizontal
        ? { label: null, domain, grid: true }
        : { label: null, type: "band" as const, padding: 0.3 },
      y: isHorizontal
        ? { label: null, type: "band" as const, padding: 0.3 }
        : { label: null, domain, grid: true },
      color: {
        type: "diverging",
        domain,
        pivot: domain[0] + (domain[1] - domain[0]) / 2,
        scheme: CHART_COLORS.scheme,
      },
      marks: [
        // Grid rule at domain start
        ...(hint.range
          ? [Plot.ruleX(isHorizontal ? [hint.range[0]] : [], { stroke: CHART_COLORS.gridStroke, strokeDasharray: "2,3" })]
          : []),
        isHorizontal
          ? Plot.barX(entries, {
              x: "value",
              y: "dimension",
              fill: "value",
              sort: { y: "-x" },
              tip: true,
            })
          : Plot.barY(entries, {
              x: "dimension",
              y: "value",
              fill: "value",
              tip: true,
            }),
        // Value labels
        isHorizontal
          ? Plot.text(entries, {
              x: "value",
              y: "dimension",
              text: (d: { value: number }) => d.value.toFixed(2),
              dx: 6,
              textAnchor: "start",
              fill: CHART_COLORS.text,
              fontSize: 10,
              sort: { y: "-x" },
            })
          : Plot.text(entries, {
              x: "dimension",
              y: "value",
              text: (d: { value: number }) => d.value.toFixed(2),
              dy: -8,
              fill: CHART_COLORS.text,
              fontSize: 10,
            }),
      ],
    });

    containerRef.current.innerHTML = "";
    containerRef.current.appendChild(plot);

    return () => {
      plot.remove();
    };
  }, [data, hint, label]);

  return (
    <div className="space-y-1">
      <div className="text-[10px] font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
        {label}
      </div>
      <div ref={containerRef} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Heatmap renderer
// ---------------------------------------------------------------------------

interface HeatmapProps {
  data: JsonValue[];
  hint: XViewHeatmap;
  label: string;
}

function Heatmap({ data, hint, label }: HeatmapProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // The y field uses "rubricScores.*" pattern — expand to individual dimensions
    const yField = hint.y;
    const isWildcard = yField.endsWith(".*");
    const yPrefix = isWildcard ? yField.slice(0, -2) : yField;

    // Flatten array items into cells: {x, y, value}
    const cells: Array<{ x: string | number; y: string; value: number }> = [];

    for (const item of data) {
      if (typeof item !== "object" || item === null || Array.isArray(item)) continue;
      const record = item as Record<string, JsonValue>;

      const xVal = getNestedValue(record, hint.x);
      const xLabel = typeof xVal === "number" ? `Turn ${xVal}` : String(xVal);

      if (isWildcard) {
        // Expand wildcard: get the nested object and iterate its keys
        const nestedObj = getNestedValue(record, yPrefix);
        if (typeof nestedObj === "object" && nestedObj !== null && !Array.isArray(nestedObj)) {
          for (const [dimKey, dimVal] of Object.entries(nestedObj as Record<string, JsonValue>)) {
            let score: number | null = null;
            if (typeof dimVal === "number") {
              score = dimVal;
            } else if (typeof dimVal === "object" && dimVal !== null && !Array.isArray(dimVal)) {
              const fillVal = (dimVal as Record<string, JsonValue>)[hint.fill];
              if (typeof fillVal === "number") score = fillVal;
            }
            if (score !== null) {
              cells.push({
                x: xLabel,
                y: dimKey.charAt(0).toUpperCase() + dimKey.slice(1),
                value: score,
              });
            }
          }
        }
      } else {
        const yVal = getNestedValue(record, yField);
        const fillVal = getNestedValue(record, hint.fill);
        if (typeof fillVal === "number") {
          cells.push({
            x: xLabel,
            y: String(yVal),
            value: fillVal,
          });
        }
      }
    }

    if (cells.length === 0) return;

    // Get unique y dimensions (preserve order from first occurrence)
    const yDims: string[] = [];
    const seen = new Set<string>();
    for (const cell of cells) {
      if (!seen.has(cell.y)) {
        seen.add(cell.y);
        yDims.push(cell.y);
      }
    }

    const plot = Plot.plot({
      width: containerRef.current.clientWidth,
      height: Math.max(yDims.length * 28 + 60, 140),
      marginLeft: 80,
      marginBottom: 36,
      marginTop: 8,
      marginRight: 16,
      padding: 0,
      style: {
        background: "transparent",
        color: CHART_COLORS.text,
        fontSize: "11px",
      },
      x: {
        label: null,
        padding: 0.05,
        tickRotate: -30,
      },
      y: {
        label: null,
        padding: 0.05,
        domain: yDims,
      },
      color: {
        type: "diverging",
        scheme: CHART_COLORS.scheme,
        domain: hint.range ?? [1, 5],
        pivot: (() => {
          const r = hint.range ?? [1, 5];
          return r[0] + (r[1] - r[0]) / 2;
        })(),
        label: "Score",
        legend: true,
      },
      marks: [
        Plot.cell(cells, {
          x: "x",
          y: "y",
          fill: "value",
          inset: 1,
          tip: true,
        }),
        // Score labels in each cell
        Plot.text(cells, {
          x: "x",
          y: "y",
          text: (d: { value: number }) => String(d.value),
          fill: (d: { value: number }) => {
            const range = hint.range ?? [1, 5];
            const ratio = (d.value - range[0]) / (range[1] - range[0]);
            // PiYG: low=dark pink (light text), mid=pale yellow (dark text), high=dark green (light text)
            return ratio <= 0.25 || ratio >= 0.75 ? "#fef2f2" : "#1c1917";
          },
          fontSize: 10,
          fontWeight: "bold",
        }),
      ],
    });

    containerRef.current.innerHTML = "";
    containerRef.current.appendChild(plot);

    return () => {
      plot.remove();
    };
  }, [data, hint, label]);

  return (
    <div className="space-y-1">
      <div className="text-[10px] font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
        {label}
      </div>
      <div ref={containerRef} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check whether a parsed schema contains any x-view hints.
 */
function hasViewHints(schema: JsonValue): boolean {
  if (typeof schema !== "object" || schema === null || Array.isArray(schema)) return false;
  return collectViewSpecs(schema as SchemaRoot).length > 0;
}

interface DataVisualizerProps {
  /** Parsed JSON data to visualize */
  data: JsonValue;
  /** Parsed schema.json with x-view hints */
  schema: JsonValue;
}

/**
 * Renders Observable Plot charts driven by x-view hints in a JSON Schema.
 *
 * Each top-level schema property with an x-view hint becomes a separate chart.
 * Unsupported view types are silently skipped.
 */
function DataVisualizer({ data, schema }: DataVisualizerProps) {
  if (typeof schema !== "object" || schema === null || Array.isArray(schema)) return null;
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;

  const specs = collectViewSpecs(schema as SchemaRoot);
  if (specs.length === 0) return null;

  const dataRecord = data as Record<string, JsonValue>;

  return (
    <div className="space-y-6">
      {specs.map((spec) => {
        const sectionData = dataRecord[spec.key];
        if (sectionData === undefined || sectionData === null) return null;

        switch (spec.hint.type) {
          case "bar": {
            if (typeof sectionData !== "object" || Array.isArray(sectionData)) return null;
            return (
              <BarChart
                key={spec.key}
                data={sectionData as Record<string, JsonValue>}
                hint={spec.hint}
                label={spec.label}
              />
            );
          }
          case "heatmap": {
            if (!Array.isArray(sectionData)) return null;
            return (
              <Heatmap
                key={spec.key}
                data={sectionData}
                hint={spec.hint}
                label={spec.label}
              />
            );
          }
          // line and dot types can be added here when needed
          default:
            return null;
        }
      })}
    </div>
  );
}

export { DataVisualizer, hasViewHints };
