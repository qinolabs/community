import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";

import { cn } from "@qinolabs/ui-core/lib/utils";

import type { AgentSignal } from "~/server/types";
import { SignalIndicators } from "~/ui/features/_shared/signal-indicators";
import { StatusIndicator } from "~/ui/features/_shared/status-indicator";
import { getStatusStyle, getStatusLabel } from "~/ui/features/_shared/status-config";

interface GraphNodeData extends Record<string, unknown> {
  label: string;
  status: string | undefined;
  nodeId: string;
  dir: string;
  agentSignals: AgentSignal[];
  hasSubGraph?: boolean;
  hasView?: boolean;
  hasJournal?: boolean;
}

function GraphNode({ data }: NodeProps) {
  const nodeData = data as unknown as GraphNodeData;
  const style = getStatusStyle(nodeData.status);
  return (
    <div
      className={cn(
        "relative rounded-lg border-2 bg-background px-4 py-3",
        "min-w-[180px] max-w-[240px]",
        "font-mono text-xs",
        "transition-all duration-200 hover:shadow-md",
        style.border,
        nodeData.status === "dormant" && "opacity-50",
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!size-1.5 !border-0 !bg-neutral-300 !opacity-50 dark:!bg-neutral-700"
      />

      <div className="flex items-start gap-2">
        <StatusIndicator status={nodeData.status} />
        <div className="min-w-0 flex-1">
          <div className={cn("text-[11px] leading-tight font-semibold", style.label)}>
            {nodeData.label}
          </div>
          <div className="mt-1 flex items-center gap-1 text-[10px] text-neutral-500 dark:text-neutral-400">
            <span>{getStatusLabel(nodeData.status)}</span>
            {nodeData.hasSubGraph && (
              <span title="Contains sub-graph">&oplus;</span>
            )}
            {nodeData.hasView && (
              <span title="Has view">&cir;</span>
            )}
            {nodeData.hasJournal && (
              <span title="Has journal">✎</span>
            )}
            <span className="ml-auto">
              <SignalIndicators signals={nodeData.agentSignals ?? []} />
            </span>
          </div>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!size-1.5 !border-0 !bg-neutral-300 !opacity-50 dark:!bg-neutral-700"
      />
    </div>
  );
}

export { GraphNode };
export type { GraphNodeData };
