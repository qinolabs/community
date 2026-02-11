import { Link, type LinkProps } from "@tanstack/react-router";
import { Home } from "lucide-react";

import { Button } from "@qinolabs/ui-core/components/button";
import { cn } from "@qinolabs/ui-core/lib/utils";

import { ROOT_WORKSPACE } from "~/ui/lib/graph-path";

interface BreadcrumbsProps {
  /** Workspace identifier from URL path (e.g., "qinolabs-repo"). */
  workspace: string;
  /** Human-readable workspace name (e.g., "qinolabs" instead of "_root"). */
  displayName?: string;
  /** Optional sub-path within the workspace (from `at` query param). */
  subPath?: string;
  /** Whether we're viewing a sub-graph (enables link to node detail). */
  isSubGraph?: boolean;
  className?: string;
}

/**
 * Breadcrumbs for qino-lab navigation.
 *
 * Examples:
 * - Workspace root: Home / qinolabs-repo
 * - Sub-graph: Home / qinolabs-repo / implementations / sound-lab
 * - Node routes: Home / qinolabs-repo (simplified — tab navigation handles hierarchy)
 */
function Breadcrumbs({ workspace, displayName, subPath, isSubGraph, className }: BreadcrumbsProps) {
  const isRoot = workspace === ROOT_WORKSPACE;

  // Sub-path segments (e.g., "implementations/sound-lab" -> ["implementations", "sound-lab"])
  const subSegments = subPath?.split("/").filter(Boolean) ?? [];

  // Build breadcrumb items — discriminated union for type safety
  type BreadcrumbItem =
    | { label: string; isLink: false }
    | { label: string; isLink: true; to: LinkProps["to"]; params: LinkProps["params"]; search?: LinkProps["search"] };

  const items: BreadcrumbItem[] = [];

  // Workspace (first segment) — for root, link back to landing; otherwise to workspace index
  items.push(
    isRoot
      ? { label: displayName ?? workspace, isLink: true, to: "/" as LinkProps["to"], params: {} }
      : { label: displayName ?? workspace, isLink: true, to: "/$workspace", params: { workspace } },
  );

  // Sub-path segments — link to /:workspace/graph?at=...
  subSegments.forEach((segment, index) => {
    const isLast = index === subSegments.length - 1;
    const subPathUpToHere = subSegments.slice(0, index + 1).join("/");

    if (isLast && !isSubGraph) {
      // Last segment, not a sub-graph — not a link
      items.push({ label: segment, isLink: false });
    } else if (isLast && isSubGraph) {
      // Last segment IS a sub-graph — link to node detail view
      // Note: We don't include `at` because the node ID lookup happens in the root graph
      // TODO: For deeply nested sub-graphs, this may need refinement
      items.push({
        label: segment,
        isLink: true,
        to: "/$workspace/node/$nodeId",
        params: { workspace, nodeId: segment },
      });
    } else {
      items.push({
        label: segment,
        isLink: true,
        to: "/$workspace/graph",
        params: { workspace },
        search: { at: subPathUpToHere },
      });
    }
  });

  return (
    <nav className={cn("flex items-center gap-1.5 font-mono text-[11px]", className)}>
      {/* Home icon - links to landing */}
      <Button
        variant="ghost"
        size="icon-xs"
        render={(props) => (
          <Link {...props} to="/" title="Home">
            <Home className="size-3.5" />
          </Link>
        )}
      />

      {/* Path segments */}
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`} className="flex items-center gap-1.5">
          <span className="text-stone-300 dark:text-stone-600">/</span>
          {item.isLink ? (
            <Link
              to={item.to}
              params={item.params}
              search={item.search ?? {}}
              className="text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200 transition-colors"
            >
              {item.label}
            </Link>
          ) : (
            <span className="text-stone-700 dark:text-stone-300">
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}

export { Breadcrumbs };
