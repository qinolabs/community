import { useState } from "react";

interface CollapsibleSectionProps {
  label: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
  /** Horizontal padding class applied to both header and content (e.g. "px-8"). */
  inset?: string;
}

function CollapsibleSection({
  label,
  count,
  defaultOpen = false,
  children,
  inset,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const insetClass = inset ?? "";

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`flex w-full items-center gap-2 py-2 text-left transition-colors hover:bg-stone-100/60 dark:hover:bg-stone-800/40 ${insetClass}`}
      >
        <span
          className={`text-[9px] text-stone-400 dark:text-stone-600 transition-transform ${isOpen ? "rotate-90" : ""}`}
        >
          ▶
        </span>
        <span className="font-mono text-[11px] text-stone-500 dark:text-stone-400">
          {label}
        </span>
        {count != null && (
          <span className="text-[10px] text-stone-400 dark:text-stone-600">
            {count}
          </span>
        )}
      </button>
      {isOpen && (
        <div className={`pb-3 pt-1 ${insetClass}`}>
          {children}
        </div>
      )}
    </div>
  );
}

export { CollapsibleSection };
