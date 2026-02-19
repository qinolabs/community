import { useEffect, useState } from "react";

import type { DataFileEntry, JsonValue, NodeDetail } from "~/server/types";
import { getDataFile } from "~/ui/api-client";
import { DataVisualizer, hasViewHints } from "~/ui/features/node/data-visualizer";

interface DataVisualizationViewProps {
  node: NodeDetail;
  graphPath?: string;
}

interface LoadedFile {
  filename: string;
  data: JsonValue;
}

/**
 * Dedicated visualization view — renders charts for all data files with x-view schema hints.
 *
 * Loading strategy:
 *   1. Fetch schema.json eagerly to discover x-view hints
 *   2. If hints exist, fetch all non-schema data files in parallel
 *   3. Render DataVisualizer for each file
 */
function DataVisualizationView({ node, graphPath }: DataVisualizationViewProps) {
  const [schema, setSchema] = useState<JsonValue | null>(null);
  const [schemaTitle, setSchemaTitle] = useState<string | null>(null);
  const [files, setFiles] = useState<LoadedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const dataFiles = node.dataFiles;
  const hasSchema = dataFiles.some((f) => f.filename === "schema.json");
  const nonSchemaFiles = dataFiles.filter((f) => f.filename !== "schema.json");

  useEffect(() => {
    if (!hasSchema) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        // Phase 1: Fetch schema
        const schemaResult = await getDataFile(node.id, "schema.json", graphPath);
        const schemaContent = schemaResult.dataFiles[0]?.content ?? "";
        const parsed = JSON.parse(schemaContent) as JsonValue;

        if (cancelled) return;

        setSchema(parsed);

        // Extract title from schema
        if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
          const title = (parsed as Record<string, JsonValue>)["title"];
          if (typeof title === "string") setSchemaTitle(title);
        }

        // Phase 2: Fetch all data files in parallel
        if (hasViewHints(parsed) && nonSchemaFiles.length > 0) {
          const results = await Promise.allSettled(
            nonSchemaFiles.map(async (entry: DataFileEntry) => {
              const result = await getDataFile(node.id, entry.filename, graphPath);
              const content = result.dataFiles[0]?.content ?? "";
              return {
                filename: entry.filename,
                data: JSON.parse(content) as JsonValue,
              };
            }),
          );

          if (cancelled) return;

          const loaded: LoadedFile[] = [];
          for (const result of results) {
            if (result.status === "fulfilled") {
              loaded.push(result.value);
            }
          }
          setFiles(loaded);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load data");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [node.id, graphPath, hasSchema]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="animate-pulse text-sm text-stone-400">
          Loading visualizations...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-red-500 dark:text-red-400">{error}</div>
      </div>
    );
  }

  if (!schema || !hasViewHints(schema) || files.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-stone-400">No visualizations available</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-8">
      {/* Context header */}
      {schemaTitle && (
        <div className="text-[12px] font-medium text-stone-500 dark:text-stone-400">
          {schemaTitle}
        </div>
      )}

      {/* Charts — one per data file */}
      {files.map((file) => (
        <div key={file.filename} className="space-y-2">
          <div className="text-[11px] font-mono text-stone-400 dark:text-stone-500">
            {file.filename}
          </div>
          <DataVisualizer data={file.data} schema={schema} />
        </div>
      ))}
    </div>
  );
}

export { DataVisualizationView };
