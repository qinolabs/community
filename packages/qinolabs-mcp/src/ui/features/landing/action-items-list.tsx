import type { ActionItem } from "~/server/types";
import { CollapsibleSection } from "~/ui/features/_shared/collapsible-section";
import { ActionItemTile } from "./action-item-tile";

interface ActionItemsListProps {
  items: ActionItem[];
}

function ActionItemsList({ items }: ActionItemsListProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section>
      <CollapsibleSection
        label="Needs Attention"
        count={items.length}
        defaultOpen
      >
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
      </CollapsibleSection>
    </section>
  );
}

export { ActionItemsList };
