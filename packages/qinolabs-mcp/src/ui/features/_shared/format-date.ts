/**
 * Format an annotation date string for display.
 * Today's dates show relative time (e.g., "3h ago", "15m ago").
 * Older dates show short date (e.g., "Feb 7").
 */
export function formatAnnotationDate(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);

  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    if (dateStr.includes("T")) {
      const diffMs = now.getTime() - date.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 1) return "just now";
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHr = Math.floor(diffMin / 60);
      return `${diffHr}h ago`;
    }
    return "today";
  }

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
