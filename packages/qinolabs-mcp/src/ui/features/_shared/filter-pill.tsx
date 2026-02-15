import { cn } from "@qinolabs/ui-core/lib/utils";

interface FilterPillProps {
  label: string;
  isActive: boolean;
  onClick: () => void;
  /** Tailwind text color class applied to the pill (e.g., "text-emerald-600"). */
  colorClass: string;
  /** Optional count displayed after the label. */
  count?: number;
  /** When true, pill appears muted and is not clickable. */
  disabled?: boolean;
}

function FilterPill({ label, isActive, onClick, colorClass, count, disabled }: FilterPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-full border px-2.5 py-0.5 font-mono text-[10px] transition-colors",
        disabled
          ? "border-transparent text-stone-300 dark:text-stone-700"
          : colorClass,
        !disabled && isActive && "border-current/80 bg-current/80",
        !disabled && !isActive && "border-stone-300/40 hover:border-current/40",
      )}
    >
      <span className={isActive && !disabled ? "text-white dark:text-black" : undefined}>
        {label}
        {count != null && count > 0 && ` ${count}`}
      </span>
    </button>
  );
}

export { FilterPill };
