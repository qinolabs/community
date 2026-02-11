/**
 * Typed fetch wrappers for the qino-lab HTTP API.
 *
 * In dev mode, requests are proxied by Vite to localhost:4020.
 * In production, the same origin serves both SPA and API.
 */

import type {
  AgentSignal,
  AnnotationMeta,
  GraphWithJournal,
  JournalSection,
  LandingData,
  NodeDetail,
  WorkspaceConfig,
} from "~/server/types";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

export function getConfig(workspace?: string) {
  const url = workspace
    ? `/api/config?path=${encodeURIComponent(workspace)}`
    : "/api/config";
  return fetchJson<WorkspaceConfig>(url);
}

export function getLanding() {
  return fetchJson<LandingData>("/api/landing");
}

export function getGraph(graphPath?: string) {
  const url = graphPath
    ? `/api/graph?path=${encodeURIComponent(graphPath)}`
    : "/api/graph";
  return fetchJson<GraphWithJournal>(url);
}

export function getJournal(graphPath?: string) {
  const url = graphPath
    ? `/api/journal?path=${encodeURIComponent(graphPath)}`
    : "/api/journal";
  return fetchJson<{ sections: JournalSection[] }>(url);
}

export function getNode(nodeId: string, graphPath?: string) {
  const base = `/api/nodes/${encodeURIComponent(nodeId)}`;
  const url = graphPath
    ? `${base}?path=${encodeURIComponent(graphPath)}`
    : base;
  return fetchJson<NodeDetail>(url);
}

export async function addAnnotation(
  nodeId: string,
  signal: AgentSignal,
  body: string,
  target?: string,
  graphPath?: string,
): Promise<{ success: true; filename: string }> {
  const base = `/api/nodes/${encodeURIComponent(nodeId)}/annotations`;
  const url = graphPath
    ? `${base}?path=${encodeURIComponent(graphPath)}`
    : base;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signal, body, target }),
  });
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<{ success: true; filename: string }>;
}

export async function resolveAnnotation(
  nodeId: string,
  filename: string,
  status: "accepted" | "resolved" | "dismissed",
  graphPath?: string,
): Promise<{ success: true; meta: AnnotationMeta }> {
  const base = `/api/nodes/${encodeURIComponent(nodeId)}/annotations/${encodeURIComponent(filename)}`;
  const url = graphPath
    ? `${base}?path=${encodeURIComponent(graphPath)}`
    : base;

  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<{ success: true; meta: AnnotationMeta }>;
}

export async function saveJournal(
  sections: JournalSection[],
  graphPath?: string,
): Promise<{ success: true }> {
  const url = graphPath
    ? `/api/journal?path=${encodeURIComponent(graphPath)}`
    : "/api/journal";

  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sections }),
  });
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<{ success: true }>;
}

export async function checkpointJournal(
  graphPath?: string,
): Promise<{ success: true; committed: boolean }> {
  const url = graphPath
    ? `/api/journal/checkpoint?path=${encodeURIComponent(graphPath)}`
    : "/api/journal/checkpoint";

  const res = await fetch(url, { method: "POST" });
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<{ success: true; committed: boolean }>;
}

export async function createNode(
  opts: {
    id: string;
    dir: string;
    title: string;
    type?: string;
    status?: string;
    story: string;
    edges?: Array<{ target: string; type?: string; context?: string }>;
    view?: { focal: string; includes: string[] };
  },
  graphPath?: string,
): Promise<{ success: true; nodeId: string }> {
  const url = graphPath
    ? `/api/nodes?path=${encodeURIComponent(graphPath)}`
    : "/api/nodes";

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<{ success: true; nodeId: string }>;
}

export async function updateView(
  nodeId: string,
  opts: { focal: string; includes: string[] },
  graphPath?: string,
): Promise<{ success: true }> {
  const base = `/api/nodes/${encodeURIComponent(nodeId)}/view`;
  const url = graphPath
    ? `${base}?path=${encodeURIComponent(graphPath)}`
    : base;

  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<{ success: true }>;
}

export async function writeJournalEntry(
  opts: { context: string; body: string; nodeId?: string },
  graphPath?: string,
): Promise<{ success: true }> {
  const url = graphPath
    ? `/api/journal/entry?path=${encodeURIComponent(graphPath)}`
    : "/api/journal/entry";

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<{ success: true }>;
}
