interface StatusStyle {
  border: string;
  label: string;
  indicator: string;
}

const knownStatusStyles: Record<string, StatusStyle> = {
  completed: {
    border: "border-stone-300/60 dark:border-stone-600/40 border-solid",
    label: "text-stone-700 dark:text-stone-300",
    indicator: "bg-emerald-500 dark:bg-emerald-400",
  },
  active: {
    border: "border-stone-300/60 dark:border-stone-600/40 border-solid",
    label: "text-stone-700 dark:text-stone-300",
    indicator: "hidden",
  },
  proposed: {
    border: "border-stone-300/30 dark:border-stone-600/20 border-dashed",
    label: "text-stone-500 dark:text-stone-400",
    indicator: "bg-neutral-400 dark:bg-neutral-500",
  },
  dormant: {
    border: "border-stone-300/20 dark:border-stone-700/15 border-dotted",
    label: "text-stone-400 dark:text-stone-600",
    indicator: "bg-neutral-300 dark:bg-neutral-600",
  },
};

const defaultStyle: StatusStyle = {
  border: "border-stone-300/40 dark:border-stone-700/30 border-solid",
  label: "text-muted-foreground",
  indicator: "hidden",
};

function getStatusStyle(status: string | undefined): StatusStyle {
  if (!status) return defaultStyle;
  return knownStatusStyles[status] ?? defaultStyle;
}

function getStatusLabel(status: string | undefined): string {
  return status ?? "unknown";
}

export { getStatusStyle, getStatusLabel, knownStatusStyles, defaultStyle };
export type { StatusStyle };
