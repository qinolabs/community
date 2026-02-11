import type { ActionItem } from "~/server/types";
import { ActionItemTile } from "./action-item-tile";

interface ActionItemsListProps {
  items: ActionItem[];
}

function ActionItemsList({ items }: ActionItemsListProps) {
  return (
    <section>
      <div className="mb-3">
        <h2 className="text-[10px] font-mono uppercase tracking-widest text-stone-500 dark:text-stone-500">
          Needs Attention
        </h2>
      </div>
      {items.length > 0 ? (
        <div className="space-y-2">
          {items.map((item) => (
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
      ) : (
        <div className="py-6 text-center font-mono text-[10px] text-stone-400 dark:text-stone-600">
          nothing flagged
        </div>
      )}
    </section>
  );
}

export { ActionItemsList };
