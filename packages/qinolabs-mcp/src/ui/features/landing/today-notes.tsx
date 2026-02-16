import { useState } from "react";

import type { ActionItem, AgentSignal } from "~/server/types";
import { FilterPill } from "~/ui/features/_shared/filter-pill";
import { signalStyles } from "~/ui/features/_shared/signal-config";
import { ActionItemTile } from "./action-item-tile";

const ALL_SIGNALS: AgentSignal[] = ["reading", "connection", "tension", "proposal"];

interface TodayNotesProps {
  items: ActionItem[];
  /** Horizontal padding for full-bleed hover on mobile. */
  inset?: string;
}

function TodayNotes({ items, inset }: TodayNotesProps) {
  // Don't render at all if there are no items for today
  if (items.length === 0) return null;

  // Count per signal type
  const countBySignal: Record<string, number> = {};
  for (const item of items) {
    if (item.signal !== "proposed") {
      countBySignal[item.signal] = (countBySignal[item.signal] ?? 0) + 1;
    }
  }

  const [activeSignal, setActiveSignal] = useState<AgentSignal | null>(null);

  const filtered =
    activeSignal === null
      ? []
      : items.filter((item) => item.signal !== "proposed" && item.signal === activeSignal);

  return (
    <section>
      {/* Header row: title + filter pills */}
      <div className={`mb-3 flex items-center gap-3 ${inset ?? ""}`}>
        <h2 className="shrink-0 text-[10px] font-mono uppercase tracking-widest text-stone-500 dark:text-stone-500">
          Today&apos;s agent notes
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {ALL_SIGNALS.map((signal) => {
            const style = signalStyles[signal];
            const count = countBySignal[signal] ?? 0;

            return (
              <FilterPill
                key={signal}
                label={signal}
                isActive={activeSignal === signal}
                onClick={() => setActiveSignal(activeSignal === signal ? null : signal)}
                colorClass={style.text}
                count={count}
                disabled={count === 0}
              />
            );
          })}
        </div>
      </div>

      {/* Annotation cards */}
      {filtered.length > 0 && (
        <div className={`space-y-1 ${inset ?? ""}`}>
          {filtered.map((item) => (
            <ActionItemTile
              key={
                item.annotationFilename
                  ? `${item.graphPath ?? ""}/${item.nodeId}/${item.annotationFilename}`
                  : `${item.graphPath ?? ""}/${item.nodeId}/status`
              }
              item={item}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export { TodayNotes };
