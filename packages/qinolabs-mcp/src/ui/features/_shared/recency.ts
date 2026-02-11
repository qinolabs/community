interface TimeSection<T> {
  key: string;
  label: string;
  nodes: T[];
}

function groupByRecency<T extends { modified?: number }>(
  nodes: T[],
): TimeSection<T>[] {
  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayCutoff = startOfToday.getTime();
  const weekCutoff = now - 7 * 24 * 60 * 60 * 1000;
  const monthCutoff = now - 30 * 24 * 60 * 60 * 1000;

  const today: T[] = [];
  const thisWeek: T[] = [];
  const thisMonth: T[] = [];
  const earlier: T[] = [];

  for (const node of nodes) {
    const m = node.modified ?? 0;
    if (m >= todayCutoff) {
      today.push(node);
    } else if (m >= weekCutoff) {
      thisWeek.push(node);
    } else if (m >= monthCutoff) {
      thisMonth.push(node);
    } else {
      earlier.push(node);
    }
  }

  const sections: TimeSection<T>[] = [];
  if (today.length > 0)
    sections.push({ key: "today", label: "Today", nodes: today });
  if (thisWeek.length > 0)
    sections.push({ key: "week", label: "This week", nodes: thisWeek });
  if (thisMonth.length > 0)
    sections.push({ key: "month", label: "This month", nodes: thisMonth });
  if (earlier.length > 0)
    sections.push({ key: "earlier", label: "Earlier", nodes: earlier });
  return sections;
}

export { groupByRecency };
export type { TimeSection };
