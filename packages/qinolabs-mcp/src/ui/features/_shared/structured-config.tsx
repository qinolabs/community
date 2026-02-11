import type { JsonRecord } from "~/server/types";

function StructuredConfig({ config }: { config: JsonRecord }) {
  // Extract known fields for structured display
  const figure = config["figure"];
  const lenses = config["lenses"];
  const depth = config["depth"];
  const depths = config["depths"];
  const substrateSource = config["substrate_source"];

  const hasKnownFields = figure ?? lenses ?? depth ?? depths ?? substrateSource;

  if (!hasKnownFields) {
    // No known fields -- display as formatted JSON
    return (
      <pre className="overflow-x-auto rounded-lg border border-neutral-200/60 dark:border-neutral-800/60 bg-neutral-50/80 dark:bg-neutral-800/30 p-4 text-[11px] text-neutral-700 dark:text-neutral-300">
        {JSON.stringify(config, null, 2)}
      </pre>
    );
  }

  return (
    <div className="rounded-lg border border-neutral-200/60 dark:border-neutral-800/60 bg-neutral-50/80 dark:bg-neutral-800/30 p-4 space-y-2.5">
      {typeof figure === "string" && (
        <ConfigRow label="figure" value={figure} />
      )}
      {Array.isArray(lenses) && (
        <ConfigRow label="lenses">
          <div className="flex gap-1.5">
            {lenses.map((lens) => (
              <span
                key={String(lens)}
                className="rounded bg-purple-100/60 dark:bg-purple-900/30 px-1.5 py-0.5 text-[10px] text-purple-700 dark:text-purple-400"
              >
                {String(lens)}
              </span>
            ))}
          </div>
        </ConfigRow>
      )}
      {depth != null && (
        <ConfigRow label="depth" value={String(depth)} />
      )}
      {Array.isArray(depths) && (
        <ConfigRow label="depths" value={depths.map(String).join(", ")} />
      )}
      {typeof substrateSource === "string" && (
        <ConfigRow label="substrate" value={substrateSource} />
      )}
    </div>
  );
}

function ConfigRow({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 text-[11px]">
      <span className="shrink-0 w-16 text-neutral-500 dark:text-neutral-400">{label}</span>
      {children ?? (
        <span className="text-neutral-700 dark:text-neutral-300">{value}</span>
      )}
    </div>
  );
}

export { StructuredConfig, ConfigRow };
