import { Tabs, TabsList, TabsTab } from "@qinolabs/ui-core/components/tabs";
import { cn } from "@qinolabs/ui-core/lib/utils";

const compactTabClassName = "h-auto sm:h-auto grow-0 px-2.5 py-0.5 text-xs!";

/**
 * Compact tab — consistent reduced-height tab used across all tab bars.
 * Wraps TabsTab with standardized compact sizing.
 */
function CompactTab({
  className,
  ...props
}: React.ComponentProps<typeof TabsTab>) {
  return (
    <TabsTab className={cn(compactTabClassName, className)} {...props} />
  );
}

/**
 * Compact tabs list — transparent background, consistent with app chrome.
 * Wraps TabsList with bg-transparent default.
 */
function CompactTabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsList>) {
  return (
    <TabsList className={cn("bg-transparent", className)} {...props} />
  );
}

export { Tabs, CompactTab, CompactTabsList };
