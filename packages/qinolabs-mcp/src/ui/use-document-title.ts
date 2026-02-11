import { useEffect } from "react";

const BASE_TITLE = "qino-lab";

/**
 * Set the document title reactively.
 * Resets to base title when component unmounts.
 */
export function useDocumentTitle(title: string | null) {
  useEffect(() => {
    if (title) {
      document.title = `${title} — ${BASE_TITLE}`;
    } else {
      document.title = BASE_TITLE;
    }
    return () => {
      document.title = BASE_TITLE;
    };
  }, [title]);
}
