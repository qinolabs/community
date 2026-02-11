import type { ContentFile, JsonRecord, JsonValue } from "~/server/types";
import { MarkdownContent } from "~/ui/features/_shared/markdown-content";

// ---------------------------------------------------------------------------
// Content file rendering (protocol-level)
// ---------------------------------------------------------------------------

/**
 * Render a content file based on its extension.
 * - .md files render as markdown
 * - .json files try structured renderers, fall back to formatted JSON
 * - Other files render as preformatted text
 */
function renderContentFile(file: ContentFile) {
  const ext = file.filename.split(".").pop()?.toLowerCase();

  if (ext === "md") {
    return <MarkdownContent>{file.content}</MarkdownContent>;
  }

  if (ext === "json") {
    try {
      const parsed = JSON.parse(file.content) as JsonRecord;
      return renderJsonResult(parsed);
    } catch {
      // Fall through to plain text
    }
  }

  // Plain text fallback
  return (
    <pre className="overflow-x-auto rounded-lg border border-neutral-200/60 dark:border-neutral-800/60 bg-neutral-50/80 dark:bg-neutral-800/30 p-4 text-[11px] text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap">
      {file.content}
    </pre>
  );
}

// ---------------------------------------------------------------------------
// JSON result renderers (kept from research iteration for backward compat)
// ---------------------------------------------------------------------------

interface ResultRendererProps {
  result: JsonRecord;
}

interface ResultRenderer {
  match: (result: JsonRecord) => boolean;
  component: React.ComponentType<ResultRendererProps>;
}

// Voicing results: { voicings: [{ lens, excerpt, quality_signal, ... }] }

interface VoicingEntry {
  lens: string;
  depth?: number;
  output_length?: number;
  quality_signal?: string;
  excerpt: string;
}

function isVoicingEntry(v: JsonValue): v is { [key: string]: JsonValue } & VoicingEntry {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const obj = v as Record<string, JsonValue>;
  return typeof obj["lens"] === "string" && typeof obj["excerpt"] === "string";
}

function signalColor(signal: string): string {
  switch (signal) {
    case "strong":
      return "text-emerald-600 dark:text-emerald-400";
    case "moderate":
      return "text-amber-600 dark:text-amber-400";
    case "weak":
      return "text-red-600 dark:text-red-400";
    default:
      return "text-neutral-500 dark:text-neutral-400";
  }
}

function VoicingResult({ result }: ResultRendererProps) {
  const voicings = result["voicings"];
  if (!Array.isArray(voicings)) return <JsonFallback result={result} />;

  const observations = result["observations"];

  return (
    <div className="space-y-3">
      {voicings.filter(isVoicingEntry).map((v, i) => (
        <div
          key={i}
          className="rounded-lg border border-neutral-200/60 dark:border-neutral-800/60 bg-neutral-50/80 dark:bg-neutral-800/30 p-3"
        >
          <div className="mb-2 flex items-center gap-3 text-[11px]">
            <span className="font-medium text-neutral-700 dark:text-neutral-300">
              {v.lens}
            </span>
            {v.depth != null && (
              <span className="text-neutral-500 dark:text-neutral-400">depth {v.depth}</span>
            )}
            {v.quality_signal && (
              <span className={signalColor(v.quality_signal)}>
                {v.quality_signal}
              </span>
            )}
            {v.output_length != null && (
              <span className="ml-auto text-neutral-400 dark:text-neutral-600">
                {v.output_length} chars
              </span>
            )}
          </div>
          <p className="text-[13px] leading-relaxed text-neutral-600 dark:text-neutral-400 italic">
            &ldquo;{v.excerpt}&rdquo;
          </p>
        </div>
      ))}

      {observations && typeof observations === "object" && !Array.isArray(observations) && (
        <div className="mt-2 rounded-lg border border-neutral-200/40 dark:border-neutral-800/40 bg-neutral-50/60 dark:bg-neutral-800/20 p-3">
          <div className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 mb-1.5">
            observations
          </div>
          <ObservationsDisplay data={observations as Record<string, JsonValue>} />
        </div>
      )}
    </div>
  );
}

function ObservationsDisplay({ data }: { data: Record<string, JsonValue> }) {
  return (
    <div className="space-y-1 text-xs text-neutral-600 dark:text-neutral-400">
      {Object.entries(data).map(([key, value]) => (
        <div key={key} className="flex gap-2">
          <span className="shrink-0 text-neutral-500 dark:text-neutral-400">{key}:</span>
          <span>{String(value)}</span>
        </div>
      ))}
    </div>
  );
}

// Facet results: { lens, content }

function FacetResult({ result }: ResultRendererProps) {
  const lens = result["lens"];
  const content = result["content"];

  return (
    <div className="rounded-lg border border-neutral-200/60 dark:border-neutral-800/60 bg-neutral-50/80 dark:bg-neutral-800/30 p-3">
      {typeof lens === "string" && (
        <div className="mb-2 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
          {lens}
        </div>
      )}
      {typeof content === "string" && (
        <p className="text-[13px] leading-relaxed text-neutral-700 dark:text-neutral-300">
          {content}
        </p>
      )}
    </div>
  );
}

// JSON fallback

function JsonFallback({ result }: ResultRendererProps) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-neutral-200/60 dark:border-neutral-800/60 bg-neutral-50/80 dark:bg-neutral-800/30 p-4 text-[11px] text-neutral-700 dark:text-neutral-300">
      {JSON.stringify(result, null, 2)}
    </pre>
  );
}

// Registry

const renderers: ResultRenderer[] = [
  { match: (r) => "voicings" in r, component: VoicingResult },
  { match: (r) => "lens" in r && "content" in r, component: FacetResult },
];

function renderJsonResult(result: JsonRecord) {
  const renderer = renderers.find((r) => r.match(result));
  if (renderer) {
    return <renderer.component result={result} />;
  }
  return <JsonFallback result={result} />;
}

export { renderContentFile, renderJsonResult };
