import type { AgentSignal } from "~/server/types";

interface SignalStyle {
  color: string;
  bg: string;
  text: string;
  label: string;
  priority: number;
}

const signalStyles: Record<AgentSignal, SignalStyle> = {
  reading: {
    color: "bg-emerald-400 dark:bg-emerald-500",
    bg: "bg-emerald-50/60 dark:bg-emerald-950/30",
    text: "text-emerald-600 dark:text-emerald-400",
    label: "reading",
    priority: 1,
  },
  connection: {
    color: "bg-blue-400 dark:bg-blue-500",
    bg: "bg-blue-50/60 dark:bg-blue-950/30",
    text: "text-blue-600 dark:text-blue-400",
    label: "connection",
    priority: 2,
  },
  tension: {
    color: "bg-amber-400 dark:bg-amber-500",
    bg: "bg-amber-50/60 dark:bg-amber-950/30",
    text: "text-amber-600 dark:text-amber-400",
    label: "tension",
    priority: 3,
  },
  proposal: {
    color: "bg-purple-400 dark:bg-purple-500",
    bg: "bg-purple-50/60 dark:bg-purple-950/30",
    text: "text-purple-600 dark:text-purple-400",
    label: "proposal",
    priority: 4,
  },
};

/** Sort signals by priority (highest first). */
function sortSignals(signals: AgentSignal[]): AgentSignal[] {
  return [...signals].sort(
    (a, b) => signalStyles[b].priority - signalStyles[a].priority,
  );
}

export { signalStyles, sortSignals };
export type { SignalStyle };
