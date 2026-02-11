import { MarkdownContent } from "~/ui/features/_shared/markdown-content";
import { signalStyles } from "~/ui/features/_shared/signal-config";
import type { Annotation } from "~/server/types";

interface AgentAnnotationProps {
  annotation: Annotation;
}

function AgentAnnotation({ annotation }: AgentAnnotationProps) {
  const style = signalStyles[annotation.meta.signal];

  return (
    <div className="rounded-lg border border-dashed border-neutral-200/60 dark:border-neutral-800/60 bg-neutral-50/60 dark:bg-neutral-800/20 p-4">
      <div className="mb-2 flex items-center gap-2 text-[11px] text-neutral-500 dark:text-neutral-400">
        <span className="text-neutral-400 dark:text-neutral-600">agent</span>
        <span
          className={`rounded px-1.5 py-0.5 ${style.bg} ${style.text}`}
        >
          {style.label}
        </span>
        {annotation.meta.target && (
          <>
            <span className="text-neutral-300 dark:text-neutral-700">
              {"->"}
            </span>
            <span className="font-mono">{annotation.meta.target}</span>
          </>
        )}
        {annotation.meta.created && (
          <span className="ml-auto">{annotation.meta.created}</span>
        )}
      </div>
      <MarkdownContent>{annotation.content}</MarkdownContent>
    </div>
  );
}

export { AgentAnnotation };
