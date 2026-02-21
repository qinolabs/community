/**
 * shell-actions.ts — Platform-aware shell-out utilities for revealing
 * files/directories in the native file explorer and opening them in an editor.
 *
 * Security: All target paths are validated against the workspace root before
 * any shell command is executed. Path traversal outside the workspace is rejected.
 */

import { exec } from "node:child_process";
import path from "node:path";

// ---------------------------------------------------------------------------
// Security
// ---------------------------------------------------------------------------

/**
 * Validate that a resolved path is within the workspace root.
 * Prevents path traversal attacks (e.g., "../../etc/passwd").
 *
 * @throws Error if the path escapes the workspace boundary.
 */
export function assertWithinWorkspace(
  targetPath: string,
  workspaceRoot: string,
): void {
  const resolved = path.resolve(targetPath);
  const root = path.resolve(workspaceRoot);

  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error(
      `Path "${resolved}" is outside the workspace root "${root}"`,
    );
  }
}

// ---------------------------------------------------------------------------
// Editor resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the editor command to use. Precedence:
 * 1. QINO_EDITOR environment variable
 * 2. `editor` field in workspace config (passed in)
 * 3. Default: "code" (VS Code)
 */
export function resolveEditorCommand(configEditor?: string): string {
  return process.env["QINO_EDITOR"] ?? configEditor ?? "code";
}

// ---------------------------------------------------------------------------
// Shell actions
// ---------------------------------------------------------------------------

const platform = process.platform;

/**
 * Reveal a directory or file in the native file explorer.
 *
 * - macOS: `open` (directory) or `open -R` (reveal file in Finder)
 * - Windows: `explorer` (directory) or `explorer /select,"file"` (reveal file)
 * - Linux: `xdg-open` (directory only — no file-select equivalent)
 */
export function revealInExplorer(targetPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let cmd: string;

    if (platform === "darwin") {
      // open -R reveals and selects the file in Finder; open opens the directory
      cmd = `open -R ${quote(targetPath)}`;
    } else if (platform === "win32") {
      cmd = `explorer /select,${quote(targetPath)}`;
    } else {
      // Linux: xdg-open works on directories; for files, open the parent
      cmd = `xdg-open ${quote(targetPath)}`;
    }

    exec(cmd, (err) => {
      if (err) {
        reject(new Error(`Failed to reveal path: ${err.message}`));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Open a file or directory in the configured editor.
 *
 * When a `line` is provided and the target is a file, uses `--goto file:line`
 * syntax (supported by VS Code, Cursor, Zed).
 */
export function openInEditor(
  targetPath: string,
  editor: string,
  line?: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const target =
      line != null ? `${quote(targetPath)}:${line}` : quote(targetPath);

    // --goto enables file:line syntax in VS Code / Cursor / Zed
    const gotoFlag = line != null ? " --goto" : "";
    const cmd = `${editor}${gotoFlag} ${target}`;

    exec(cmd, (err) => {
      if (err) {
        reject(new Error(`Failed to open in editor: ${err.message}`));
      } else {
        resolve();
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Quote a path for shell execution. */
function quote(p: string): string {
  // Double-quote and escape any existing double quotes
  return `"${p.replace(/"/g, '\\"')}"`;
}
