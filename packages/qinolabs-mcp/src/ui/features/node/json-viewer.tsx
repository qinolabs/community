import { useState } from "react";

import type { JsonValue } from "~/server/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCount(value: JsonValue): string {
  if (Array.isArray(value)) return `(${value.length})`;
  if (typeof value === "object" && value !== null) return `{${Object.keys(value).length}}`;
  return "";
}

/** Type-tinted value color classes. */
function valueColorClass(value: JsonValue): string {
  if (value === null) return "text-stone-400 dark:text-stone-600";
  if (typeof value === "string") return "text-emerald-600 dark:text-emerald-400";
  if (typeof value === "number") return "text-blue-600 dark:text-blue-400";
  if (typeof value === "boolean") return "text-amber-600 dark:text-amber-400";
  return "text-stone-600 dark:text-stone-400";
}

function isCollapsible(value: JsonValue): boolean {
  if (Array.isArray(value)) return true;
  if (typeof value === "object" && value !== null) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Primitive value renderer
// ---------------------------------------------------------------------------

const STRING_TRUNCATE_LENGTH = 100;

function PrimitiveValue({ value }: { value: JsonValue }) {
  const [expanded, setExpanded] = useState(false);

  if (value === null) {
    return <span className={valueColorClass(value)}>null</span>;
  }

  if (typeof value === "boolean") {
    return <span className={valueColorClass(value)}>{String(value)}</span>;
  }

  if (typeof value === "number") {
    return <span className={valueColorClass(value)}>{value}</span>;
  }

  if (typeof value === "string") {
    const needsTruncation = value.length > STRING_TRUNCATE_LENGTH;

    if (!needsTruncation || expanded) {
      return (
        <span className={valueColorClass(value)}>
          &quot;{value}&quot;
          {needsTruncation && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="ml-1.5 text-[10px] text-stone-400 hover:text-stone-300 dark:text-stone-500 dark:hover:text-stone-400"
            >
              collapse
            </button>
          )}
        </span>
      );
    }

    return (
      <span className={valueColorClass(value)}>
        &quot;{value.slice(0, STRING_TRUNCATE_LENGTH)}&hellip;&quot;
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="ml-1.5 text-[10px] text-stone-400 hover:text-stone-300 dark:text-stone-500 dark:hover:text-stone-400"
        >
          +{value.length - STRING_TRUNCATE_LENGTH}
        </button>
      </span>
    );
  }

  // Should not reach here for non-primitives but guard anyway
  return <span className="text-stone-500">{String(value)}</span>;
}

// ---------------------------------------------------------------------------
// Tree node renderer
// ---------------------------------------------------------------------------

interface JsonNodeProps {
  keyName: string | null;
  value: JsonValue;
  defaultOpen: boolean;
  depth: number;
}

function JsonNode({ keyName, value, defaultOpen, depth }: JsonNodeProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  if (!isCollapsible(value)) {
    return (
      <div className="flex items-baseline gap-1.5 py-px" style={{ paddingLeft: depth * 16 }}>
        {keyName !== null && (
          <span className="shrink-0 text-stone-500 dark:text-stone-400">
            {keyName}:
          </span>
        )}
        <PrimitiveValue value={value} />
      </div>
    );
  }

  const entries = Array.isArray(value)
    ? value.map((v, i) => [String(i), v] as const)
    : Object.entries(value as Record<string, JsonValue>);

  const count = formatCount(value);
  const label = keyName ?? (Array.isArray(value) ? "array" : "object");

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full items-baseline gap-1.5 py-px text-left hover:bg-stone-100/40 dark:hover:bg-stone-800/20 rounded-sm"
        style={{ paddingLeft: depth * 16 }}
      >
        <span
          className={`inline-block text-[8px] text-stone-400 dark:text-stone-600 transition-transform ${isOpen ? "rotate-90" : ""}`}
        >
          &#9654;
        </span>
        <span className="text-stone-500 dark:text-stone-400">{label}</span>
        <span className="text-[10px] text-stone-400 dark:text-stone-600">{count}</span>
      </button>
      {isOpen && (
        <div>
          {entries.map(([key, val]) => (
            <JsonNode
              key={key}
              keyName={key}
              value={val}
              defaultOpen={false}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

interface JsonViewerProps {
  data: JsonValue;
}

function JsonViewer({ data }: JsonViewerProps) {
  // Top-level: if object or array, render children expanded
  if (typeof data === "object" && data !== null) {
    const entries = Array.isArray(data)
      ? data.map((v, i) => [String(i), v] as const)
      : Object.entries(data as Record<string, JsonValue>);

    return (
      <div className="font-mono text-[11px] leading-relaxed">
        {entries.map(([key, val]) => (
          <JsonNode
            key={key}
            keyName={key}
            value={val}
            defaultOpen={isCollapsible(val)}
            depth={0}
          />
        ))}
      </div>
    );
  }

  // Primitive at top level — just render value
  return (
    <div className="font-mono text-[11px] leading-relaxed">
      <PrimitiveValue value={data} />
    </div>
  );
}

export { JsonViewer };
