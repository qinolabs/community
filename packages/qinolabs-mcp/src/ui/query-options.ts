import { queryOptions } from "@tanstack/react-query";
import { getGraph, getConfig, getJournal, getLanding, getNode } from "./api-client";

export function graphQueryOptions(path?: string) {
  return queryOptions({
    queryKey: path ? ["graph", path] : ["graph"],
    queryFn: () => getGraph(path),
  });
}

export function configQueryOptions(workspace?: string) {
  return queryOptions({
    queryKey: workspace ? ["config", workspace] : ["config"],
    queryFn: () => getConfig(workspace),
  });
}

export function landingQueryOptions() {
  return queryOptions({
    queryKey: ["landing"],
    queryFn: getLanding,
  });
}

export function journalQueryOptions(graphPath: string | null) {
  return queryOptions({
    queryKey: ["journal", graphPath],
    queryFn: () => getJournal(graphPath!),
    enabled: !!graphPath,
  });
}

export function nodeQueryOptions(nodeId: string, graphPath?: string) {
  return queryOptions({
    queryKey: graphPath ? ["node", nodeId, graphPath] : ["node", nodeId],
    queryFn: () => getNode(nodeId, graphPath),
  });
}
