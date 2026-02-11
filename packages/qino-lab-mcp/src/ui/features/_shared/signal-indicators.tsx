import type { AgentSignal } from "~/server/types";
import { signalStyles, sortSignals } from "~/ui/features/_shared/signal-config";

interface SignalIndicatorsProps {
  signals: AgentSignal[];
}

/**
 * Compact signal dots — one per unique signal type, sorted by priority.
 * Designed to sit inline within a graph node card, not overflow it.
 */
function SignalIndicators({ signals }: SignalIndicatorsProps) {
  if (signals.length === 0) return null;

  // Deduplicate to unique signal types, sorted by priority (highest first)
  const uniqueSignals = sortSignals([...new Set(signals)]);

  return (
    <div className="flex items-center gap-0.5">
      {uniqueSignals.map((signal) => (
        <div
          key={signal}
          className={`h-1.5 w-1.5 rounded-full ${signalStyles[signal].color}`}
          title={signalStyles[signal].label}
        />
      ))}
    </div>
  );
}

export { SignalIndicators };
