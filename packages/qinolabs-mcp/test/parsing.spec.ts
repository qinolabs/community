/**
 * Pure Parsing Tests
 *
 * Tests the internal parsing functions that convert between
 * raw markdown text and structured data. No filesystem access —
 * all inputs are inline string fixtures.
 *
 * Functions tested:
 * - parseJournalSections: journal.md → structured sections
 * - sectionsToMarkdown: structured sections → markdown (inverse)
 * - parseAnnotation: raw annotation file → parsed meta + content
 */

import { describe, it, expect } from "vitest";

import {
  parseJournalSections,
  sectionsToMarkdown,
  parseAnnotation,
} from "../src/server/protocol-reader.js";

// =============================================================================
// parseJournalSections
// =============================================================================

describe("parseJournalSections", () => {
  describe("basic splitting", () => {
    it("should return empty array for empty string", () => {
      expect(parseJournalSections("")).toEqual([]);
    });

    it("should return single 'opening' section for text with no context headers", () => {
      const raw = "Some journal notes.\n\nMore notes here.";
      const result = parseJournalSections(raw);

      expect(result).toHaveLength(1);
      expect(result[0]!.context).toBe("opening");
      expect(result[0]!.body).toBe(raw.trim());
    });

    it("should split on a single context header", () => {
      const raw = `Opening notes here.

<!-- context: session/2026-02-01 -->

Session observations.`;

      const result = parseJournalSections(raw);

      expect(result).toHaveLength(2);
      expect(result[0]!.context).toBe("opening");
      expect(result[0]!.body).toBe("Opening notes here.");
      expect(result[1]!.context).toBe("session/2026-02-01");
      expect(result[1]!.body).toBe("Session observations.");
    });

    it("should split on multiple context headers", () => {
      const raw = `Opening.

<!-- context: session/2026-01-31 -->

First session notes.

<!-- context: session/2026-02-01 -->

Second session notes.`;

      const result = parseJournalSections(raw);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ context: "opening", body: "Opening." });
      expect(result[1]).toEqual({ context: "session/2026-01-31", body: "First session notes." });
      expect(result[2]).toEqual({
        context: "session/2026-02-01",
        body: "Second session notes.",
      });
    });
  });

  describe("edge cases", () => {
    it("should skip empty body between headers", () => {
      const raw = `<!-- context: first -->

<!-- context: second -->

Content here.`;

      const result = parseJournalSections(raw);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ context: "second", body: "Content here." });
    });

    it("should trim whitespace from section bodies", () => {
      const raw = `
  Opening with whitespace.

<!-- context: detail -->

  Detail with whitespace.
`;

      const result = parseJournalSections(raw);

      expect(result).toHaveLength(2);
      expect(result[0]!.body).toBe("Opening with whitespace.");
      expect(result[1]!.body).toBe("Detail with whitespace.");
    });

    it("should handle context header at very start of string", () => {
      const raw = `<!-- context: session/2026-02-01 -->

Session-only content.`;

      const result = parseJournalSections(raw);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        context: "session/2026-02-01",
        body: "Session-only content.",
      });
    });
  });
});

// =============================================================================
// sectionsToMarkdown
// =============================================================================

describe("sectionsToMarkdown", () => {
  it("should produce no header for 'opening' context", () => {
    const result = sectionsToMarkdown([
      { context: "opening", body: "Opening text." },
    ]);

    expect(result).toBe("Opening text.\n");
    expect(result).not.toContain("<!-- context:");
  });

  it("should produce context header for non-opening sections", () => {
    const result = sectionsToMarkdown([
      { context: "session/2026-02-01", body: "Session observations." },
    ]);

    expect(result).toBe("<!-- context: session/2026-02-01 -->\n\nSession observations.\n");
  });

  it("should skip sections with empty body", () => {
    const result = sectionsToMarkdown([
      { context: "opening", body: "Keep this." },
      { context: "session/2026-01-31", body: "  " },
      { context: "session/2026-02-01", body: "Keep this too." },
    ]);

    expect(result).not.toContain("2026-01-31");
    expect(result).toContain("Keep this.");
    expect(result).toContain("Keep this too.");
  });

  it("should end with trailing newline", () => {
    const result = sectionsToMarkdown([
      { context: "opening", body: "Text." },
    ]);

    expect(result.endsWith("\n")).toBe(true);
  });

  describe("round-trip", () => {
    it("should approximately round-trip through parse and serialize", () => {
      const original = `Opening notes.

<!-- context: session/2026-01-31 -->

First session content.

<!-- context: session/2026-02-01 -->

Second session content.
`;

      const sections = parseJournalSections(original);
      const roundTripped = sectionsToMarkdown(sections);

      // Re-parse to compare structurally (whitespace may differ slightly)
      const reparsed = parseJournalSections(roundTripped);

      expect(reparsed).toHaveLength(sections.length);
      for (let i = 0; i < sections.length; i++) {
        expect(reparsed[i]!.context).toBe(sections[i]!.context);
        expect(reparsed[i]!.body).toBe(sections[i]!.body);
      }
    });
  });
});

// =============================================================================
// parseAnnotation
// =============================================================================

describe("parseAnnotation", () => {
  it("should parse valid front matter with all fields", () => {
    const raw = `---
author: agent
signal: connection
target: concept.md
created: 2025-06-15
---
This is the annotation body.`;

    const result = parseAnnotation(raw);

    expect(result).not.toBeNull();
    expect(result!.meta).toEqual({
      author: "agent",
      signal: "connection",
      target: "concept.md",
      created: "2025-06-15",
    });
    expect(result!.content).toBe("This is the annotation body.");
  });

  it("should default signal to 'reading' when missing", () => {
    const raw = `---
author: agent
created: 2025-06-15
---
Body text.`;

    const result = parseAnnotation(raw);

    expect(result).not.toBeNull();
    expect(result!.meta.signal).toBe("reading");
  });

  it("should always set author to 'agent'", () => {
    const raw = `---
signal: tension
created: 2025-06-15
---
Body text.`;

    const result = parseAnnotation(raw);

    expect(result).not.toBeNull();
    expect(result!.meta.author).toBe("agent");
  });

  it("should default invalid signal to 'reading'", () => {
    const raw = `---
author: agent
signal: unknown-value
created: 2025-06-15
---
Body text.`;

    const result = parseAnnotation(raw);

    expect(result).not.toBeNull();
    expect(result!.meta.signal).toBe("reading");
  });

  it("should set target to undefined when missing", () => {
    const raw = `---
author: agent
signal: reading
created: 2025-06-15
---
Body text.`;

    const result = parseAnnotation(raw);

    expect(result).not.toBeNull();
    expect(result!.meta.target).toBeUndefined();
  });

  it("should return null when no front matter delimiters", () => {
    const raw = "Just plain text without any front matter.";
    expect(parseAnnotation(raw)).toBeNull();
  });

  it("should return null for malformed front matter (missing closing ---)", () => {
    const raw = `---
author: agent
signal: reading
This is not properly closed.`;

    expect(parseAnnotation(raw)).toBeNull();
  });

  it("should preserve multi-line content", () => {
    const raw = `---
author: agent
signal: reading
created: 2025-06-15
---
First paragraph.

Second paragraph with **markdown**.

- List item 1
- List item 2`;

    const result = parseAnnotation(raw);

    expect(result).not.toBeNull();
    expect(result!.content).toContain("First paragraph.");
    expect(result!.content).toContain("Second paragraph with **markdown**.");
    expect(result!.content).toContain("- List item 1");
  });

  describe("status lifecycle fields", () => {
    it("should parse status from front matter", () => {
      const raw = `---
author: agent
signal: proposal
created: 2025-06-15
status: accepted
---
A proposal.`;

      const result = parseAnnotation(raw);

      expect(result).not.toBeNull();
      expect(result!.meta.status).toBe("accepted");
    });

    it("should parse resolvedAt from front matter", () => {
      const raw = `---
author: agent
signal: tension
created: 2025-06-15
status: resolved
resolvedAt: 2025-06-20
---
A resolved tension.`;

      const result = parseAnnotation(raw);

      expect(result).not.toBeNull();
      expect(result!.meta.status).toBe("resolved");
      expect(result!.meta.resolvedAt).toBe("2025-06-20");
    });

    it("should return undefined status when field is missing (backward compat)", () => {
      const raw = `---
author: agent
signal: proposal
created: 2025-06-15
---
Old proposal without status.`;

      const result = parseAnnotation(raw);

      expect(result).not.toBeNull();
      expect(result!.meta.status).toBeUndefined();
      expect(result!.meta.resolvedAt).toBeUndefined();
    });

    it("should ignore invalid status values and return undefined", () => {
      const raw = `---
author: agent
signal: reading
created: 2025-06-15
status: invalid-value
---
Body.`;

      const result = parseAnnotation(raw);

      expect(result).not.toBeNull();
      expect(result!.meta.status).toBeUndefined();
    });

    it("should parse all four valid status values", () => {
      const statuses = ["open", "accepted", "resolved", "dismissed"] as const;

      for (const status of statuses) {
        const raw = `---
author: agent
signal: reading
created: 2025-06-15
status: ${status}
---
Body.`;

        const result = parseAnnotation(raw);
        expect(result).not.toBeNull();
        expect(result!.meta.status).toBe(status);
      }
    });
  });
});
