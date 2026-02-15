import type { LinkProps } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";

import { buttonVariants } from "@qinolabs/ui-core/components/button";
import { cn } from "@qinolabs/ui-core/lib/utils";

import { defaultStyle } from "~/ui/features/_shared/status-config";

interface IndexTileProps {
  /** Primary display text */
  title: string;
  /** Optional count displayed on the right */
  count?: number;
  /** Subtitle content (string or styled ReactNode) */
  subtitle?: React.ReactNode;
  /** Link destination */
  to: LinkProps["to"];
  /** Route params (for dynamic routes like /node/$nodeId) */
  params?: LinkProps["params"];
  /** Search params (e.g., { at: "sub/path" }) */
  search?: LinkProps["search"];
  /** Border class overrides (color + style per status) */
  borderClassName?: string;
  /** Title class overrides */
  titleClassName?: string;
  /** Opacity class (e.g., "opacity-50" for dormant) */
  opacityClassName?: string;
  /** Additional class names on the outer link element */
  className?: string;
}

function IndexTile({
  title,
  count,
  subtitle,
  to,
  params,
  search,
  borderClassName = defaultStyle.border,
  titleClassName = "text-stone-700 dark:text-stone-300",
  opacityClassName,
  className,
}: IndexTileProps) {
  return (
    <Link
      to={to}
      params={params ?? {}}
      search={search ?? {}}
      className={cn(
        buttonVariants({
          variant: "outline",
          size: "sm",
          className: "h-auto! block py-3 px-4",
        }),
        borderClassName,
        opacityClassName,
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            "text-[11px] leading-tight font-semibold",
            titleClassName,
          )}
        >
          {title}
        </span>
        {count != null && (
          <span className="shrink-0 text-[10px] text-stone-400 dark:text-stone-500">
            {count}
          </span>
        )}
      </div>
      {subtitle && (
        <div className="mt-1 text-[10px] text-stone-500 dark:text-stone-400">
          {subtitle}
        </div>
      )}
    </Link>
  );
}

export { IndexTile };
export type { IndexTileProps };
