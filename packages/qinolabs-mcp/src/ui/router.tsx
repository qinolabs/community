import {
  createRouter,
  createRootRouteWithContext,
  createRoute,
  stripSearchParams,
  redirect,
  Link,
} from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { RootLayout } from "./app";
import { WorkspaceLayout, WorkspaceLoadingSkeleton } from "./routes/workspace-layout";
import { LandingView } from "./routes/landing-route";
import { WorkspaceIndexView } from "./routes/workspace-index-route";
import { GraphView } from "./routes/graph-route";
import { NodeView } from "./routes/node-route";
import {
  graphQueryOptions,
  configQueryOptions,
  landingQueryOptions,
  nodeQueryOptions,
} from "./query-options";
import { computeGraphPath, resolveWorkspace } from "~/ui/lib/graph-path";

// ── Query client ─────────────────────────────────────────────────

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000 },
  },
});

// ── Route context ────────────────────────────────────────────────

interface RouterContext {
  queryClient: QueryClient;
}

// ── Search schemas ──────────────────────────────────────────────

const workspaceLayoutSearchSchema = z.object({
  journal: z.boolean().optional(),
  journalTab: z.string().optional(),
});

const graphSearchSchema = z.object({
  highlight: z.string().optional(),
  focus: z.string().optional(),
  view: z.string().optional(),
  at: z.string().optional(), // sub-graph path (renamed from 'path')
});

const nodeSearchSchema = z.object({
  section: z.string().optional(),
  at: z.string().optional(), // sub-graph context (renamed from 'path')
  view: z.enum(["details", "graph", "view", "viz"]).optional(), // active tab
});

// ── Route tree ───────────────────────────────────────────────────

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

// Landing route — cross-workspace home at "/"
const landingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: LandingView,
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(landingQueryOptions());
  },
});

// Error component for workspace not found
function WorkspaceNotFoundError({ error }: { error: Error }) {
  // Try to parse available workspaces from error message
  let availableWorkspaces: string[] = [];
  try {
    const errorData = JSON.parse(error.message.replace(/^API error \d+: /, ""));
    availableWorkspaces = errorData.availableWorkspaces ?? [];
  } catch {
    // Error message wasn't JSON, show generic message
  }

  return (
    <div className="flex h-full items-center justify-center">
      <div className="max-w-md space-y-4 rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/50 p-6">
        <div className="space-y-1">
          <h2 className="font-mono text-sm text-stone-700 dark:text-stone-300">
            Workspace not found
          </h2>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            {error.message}
          </p>
        </div>
        {availableWorkspaces.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-mono uppercase tracking-widest text-stone-400">
              Available workspaces
            </p>
            <div className="flex flex-wrap gap-2">
              {availableWorkspaces.map((ws) => (
                <Link
                  key={ws}
                  to="/$workspace"
                  params={{ workspace: ws }}
                  className="rounded border border-stone-300 dark:border-stone-700 px-2 py-1 text-xs font-mono text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                >
                  {ws}
                </Link>
              ))}
            </div>
          </div>
        )}
        <Link
          to="/"
          className="block text-center text-xs text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200 transition-colors"
        >
          Return to home
        </Link>
      </div>
    </div>
  );
}

// Workspace layout route — captures workspace from URL path
const workspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/$workspace",
  component: WorkspaceLayout,
  pendingComponent: WorkspaceLoadingSkeleton,
  errorComponent: WorkspaceNotFoundError,
  loader: async ({ params, context }) => {
    const workspace = params.workspace;
    const apiWorkspace = resolveWorkspace(workspace);
    const [graph, config] = await Promise.all([
      context.queryClient.ensureQueryData(graphQueryOptions(apiWorkspace)),
      context.queryClient.ensureQueryData(configQueryOptions(apiWorkspace)),
      // Prefetch workspace list for workspace switcher tabs
      context.queryClient.ensureQueryData(landingQueryOptions()),
    ]);
    return { workspace, graph, config };
  },
  validateSearch: workspaceLayoutSearchSchema,
  search: {
    middlewares: [stripSearchParams({ journal: false, journalTab: undefined })],
  },
});

// Workspace index — at /:workspace (shows workspace overview)
const workspaceIndexRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: "/",
  component: WorkspaceIndexView,
});

// Graph route — at /:workspace/graph
const graphRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: "/graph",
  component: GraphView,
  validateSearch: graphSearchSchema,
  loaderDeps: ({ search }) => ({ at: search.at }),
  loader: async ({ params, context, deps }) => {
    // If navigating to a sub-graph, prefetch it
    if (deps.at) {
      const subGraphPath = computeGraphPath(params.workspace, deps.at);
      await context.queryClient.ensureQueryData(graphQueryOptions(subGraphPath));
    }
  },
});

// Node route — at /:workspace/node/:nodeId
const nodeRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: "/node/$nodeId",
  component: NodeView,
  validateSearch: nodeSearchSchema,
  loaderDeps: ({ search }) => ({ at: search.at }),
  loader: async ({ params, context, deps }) => {
    const graphPath = computeGraphPath(params.workspace, deps.at);
    await context.queryClient.ensureQueryData(
      nodeQueryOptions(params.nodeId, graphPath),
    );
  },
});

// ── Legacy redirects ────────────────────────────────────────────
// Redirect old URL format (/graph?path=workspace/sub/path) to new format (/:workspace/graph?at=sub/path)

function parseLegacyPath(path: string | undefined) {
  if (!path) return null;
  const [workspace = "", ...rest] = path.split("/");
  if (!workspace) return null;
  return { workspace, subPath: rest.join("/") || undefined };
}

const legacyGraphRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/graph",
  validateSearch: z.object({
    path: z.string().optional(),
    view: z.string().optional(),
    highlight: z.string().optional(),
    focus: z.string().optional(),
  }),
  beforeLoad: ({ search }) => {
    const parsed = parseLegacyPath(search.path);
    if (!parsed) throw redirect({ to: "/" });
    throw redirect({
      to: "/$workspace/graph",
      params: { workspace: parsed.workspace },
      search: { at: parsed.subPath, view: search.view, highlight: search.highlight, focus: search.focus },
    });
  },
  component: () => null,
});

const legacyNodeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/node/$nodeId",
  validateSearch: z.object({
    path: z.string().optional(),
    section: z.string().optional(),
  }),
  beforeLoad: ({ params, search }) => {
    const parsed = parseLegacyPath(search.path);
    if (!parsed) throw redirect({ to: "/" });
    throw redirect({
      to: "/$workspace/node/$nodeId",
      params: { workspace: parsed.workspace, nodeId: params.nodeId },
      search: { at: parsed.subPath, section: search.section },
    });
  },
  component: () => null,
});

const routeTree = rootRoute.addChildren([
  landingRoute,
  legacyGraphRoute,
  legacyNodeRoute,
  workspaceRoute.addChildren([workspaceIndexRoute, graphRoute, nodeRoute]),
]);

// ── Router ───────────────────────────────────────────────────────

export const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
