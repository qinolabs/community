/**
 * Git Operations Tests
 *
 * Tests git-related operations by mocking `node:child_process` execFile.
 * No real git commands are executed — all child_process calls are intercepted
 * via vi.mock.
 *
 * Functions tested:
 * - resolveGitRoot
 * - checkpointJournal
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock child_process before importing the module under test.
// We mock execFile as a function that calls its callback.
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

import { execFile } from "node:child_process";
import {
  resolveGitRoot,
  checkpointJournal,
} from "../src/server/protocol-reader.js";

// Type the mock for cleaner usage
const execFileMock = vi.mocked(execFile);

// Helper to make execFile resolve with stdout/stderr
function mockExecFileSuccess(stdout: string, stderr = "") {
  execFileMock.mockImplementationOnce(
    (_cmd: string, _args: unknown, _opts: unknown, ...rest: unknown[]) => {
      // execFile signature: (file, args, options, callback)
      // With promisify, the callback is the last argument
      const callback =
        typeof rest[0] === "function"
          ? (rest[0] as (err: Error | null, result: { stdout: string; stderr: string }) => void)
          : undefined;
      if (callback) {
        callback(null, { stdout, stderr });
      }
      return undefined as never;
    },
  );
}

function mockExecFileError(message: string) {
  execFileMock.mockImplementationOnce(
    (_cmd: string, _args: unknown, _opts: unknown, ...rest: unknown[]) => {
      const callback =
        typeof rest[0] === "function"
          ? (rest[0] as (err: Error | null) => void)
          : undefined;
      if (callback) {
        callback(new Error(message));
      }
      return undefined as never;
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// resolveGitRoot
// =============================================================================

describe("resolveGitRoot", () => {
  it("should return trimmed stdout on success", async () => {
    mockExecFileSuccess("/home/user/repo\n");

    const result = await resolveGitRoot("/home/user/repo/subdir");

    expect(result).toBe("/home/user/repo");
    expect(execFileMock).toHaveBeenCalledWith(
      "git",
      ["rev-parse", "--show-toplevel"],
      { cwd: "/home/user/repo/subdir" },
      expect.any(Function),
    );
  });

  it("should return null when exec throws", async () => {
    mockExecFileError("not a git repository");

    const result = await resolveGitRoot("/tmp/not-a-repo");
    expect(result).toBeNull();
  });

  it("should return null for empty stdout", async () => {
    mockExecFileSuccess("");

    const result = await resolveGitRoot("/some/dir");
    expect(result).toBeNull();
  });
});

// =============================================================================
// checkpointJournal
// =============================================================================

describe("checkpointJournal", () => {
  it("should commit when git status shows changes", async () => {
    // 1. git add
    mockExecFileSuccess("");
    // 2. git status --porcelain (has changes)
    mockExecFileSuccess("M  workspace/journal.md\n");
    // 3. git commit
    mockExecFileSuccess("committed");

    const result = await checkpointJournal(
      "/repo/workspace",
      "/repo",
    );

    expect(result).toEqual({ success: true, committed: true });
    expect(execFileMock).toHaveBeenCalledTimes(3);

    // Verify git add was called with correct relative path
    const addCall = execFileMock.mock.calls[0]!;
    expect(addCall[0]).toBe("git");
    expect(addCall[1]).toContain("add");
    expect(addCall[1]).toContain("workspace/journal.md");
  });

  it("should skip commit when git status is empty", async () => {
    // 1. git add
    mockExecFileSuccess("");
    // 2. git status --porcelain (no changes)
    mockExecFileSuccess("");

    const result = await checkpointJournal(
      "/repo/workspace",
      "/repo",
    );

    expect(result).toEqual({ success: true, committed: false });
    // Should NOT call git commit (only add + status)
    expect(execFileMock).toHaveBeenCalledTimes(2);
  });
});
