/**
 * React hook that connects to the SSE /api/events endpoint and
 * invalidates TanStack Query caches when file changes are detected.
 *
 * Runs once on mount, cleans up EventSource on unmount.
 * Reconnection is handled automatically by the EventSource API.
 */

import { useEffect, useRef } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";

interface FileChangeEvent {
  type: "graph" | "node" | "journal" | "config" | "annotation";
  nodeId?: string;
  graphPath?: string;
}

function invalidateForEvent(qc: QueryClient, event: FileChangeEvent) {
  switch (event.type) {
    case "graph": {
      const graphKey = event.graphPath
        ? ["graph", event.graphPath]
        : ["graph"];
      qc.invalidateQueries({ queryKey: graphKey });
      qc.invalidateQueries({ queryKey: ["landing"] });
      break;
    }
    case "journal": {
      const graphKey = event.graphPath
        ? ["graph", event.graphPath]
        : ["graph"];
      const journalKey = event.graphPath
        ? ["journal", event.graphPath]
        : ["journal"];
      qc.invalidateQueries({ queryKey: graphKey });
      qc.invalidateQueries({ queryKey: journalKey });
      break;
    }
    case "node": {
      const nodeKey = event.nodeId ? ["node", event.nodeId] : ["node"];
      const graphKey = event.graphPath
        ? ["graph", event.graphPath]
        : ["graph"];
      qc.invalidateQueries({ queryKey: nodeKey });
      qc.invalidateQueries({ queryKey: graphKey });
      break;
    }
    case "annotation": {
      const nodeKey = event.nodeId ? ["node", event.nodeId] : ["node"];
      qc.invalidateQueries({ queryKey: nodeKey });
      qc.invalidateQueries({ queryKey: ["landing"] });
      break;
    }
    case "config": {
      qc.invalidateQueries({ queryKey: ["config"] });
      break;
    }
  }
}

export function useWorkspaceEvents() {
  const queryClient = useQueryClient();
  const qcRef = useRef(queryClient);
  qcRef.current = queryClient;

  useEffect(() => {
    const es = new EventSource("/api/events");

    es.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data) as FileChangeEvent;
        invalidateForEvent(qcRef.current, event);
      } catch {
        // Ignore malformed messages
      }
    };

    return () => {
      es.close();
    };
  }, []);
}
