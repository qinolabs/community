import { useState } from "react";
import { FolderOpen, SquareTerminal } from "lucide-react";

import { Button } from "@qinolabs/ui-core/components/button";

import {
  revealInExplorer,
  openInEditor,
} from "~/ui/api-client";

interface ShellActionButtonsProps {
  graphPath?: string;
  nodeId?: string;
}

/**
 * Reveal in Finder + Open in Editor icon buttons.
 *
 * Placed in node detail headers and graph view headers.
 * Both are fire-and-forget — no loading state needed, but we briefly
 * show a checkmark on success for feedback.
 */
function ShellActionButtons({ graphPath, nodeId }: ShellActionButtonsProps) {
  const [revealFeedback, setRevealFeedback] = useState(false);
  const [openFeedback, setOpenFeedback] = useState(false);

  function handleReveal() {
    revealInExplorer({ graphPath, nodeId }).then(
      () => {
        setRevealFeedback(true);
        setTimeout(() => setRevealFeedback(false), 1200);
      },
      (err) => {
        console.error("[shell-actions] Reveal failed:", err);
      },
    );
  }

  function handleOpen() {
    openInEditor({ graphPath, nodeId }).then(
      () => {
        setOpenFeedback(true);
        setTimeout(() => setOpenFeedback(false), 1200);
      },
      (err) => {
        console.error("[shell-actions] Open failed:", err);
      },
    );
  }

  return (
    <div className="flex items-center gap-0.5">
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={handleReveal}
        title="Reveal in Finder"
      >
        {revealFeedback ? (
          <span className="text-emerald-500 text-[10px] font-bold">OK</span>
        ) : (
          <FolderOpen className="size-3.5 text-stone-400 dark:text-stone-500" />
        )}
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={handleOpen}
        title="Open in Editor"
      >
        {openFeedback ? (
          <span className="text-emerald-500 text-[10px] font-bold">OK</span>
        ) : (
          <SquareTerminal className="size-3.5 text-stone-400 dark:text-stone-500" />
        )}
      </Button>
    </div>
  );
}

export { ShellActionButtons };
