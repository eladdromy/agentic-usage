import { describe, expect, it } from "vitest";

import { extractBubbleContentParts } from "./content";

describe("extractBubbleContentParts", () => {
  it("reads thinking text from a Cursor { text, signature } object", () => {
    const parts = extractBubbleContentParts({
      type: 2,
      text: "",
      thinking: { text: "Planning the next step.", signature: "abc" },
    });
    expect(parts).toEqual([
      { kind: "thinking", value: { text: "Planning the next step.", signature: "abc" } },
    ]);
  });

  it("keeps a signature when thinking text is missing", () => {
    const parts = extractBubbleContentParts({
      thinking: { text: "", signature: "sig-only" },
    });
    expect(parts).toEqual([
      { kind: "thinking", value: { encrypted: true, signature: "sig-only" } },
    ]);
  });

  it("keeps plain-string thinking", () => {
    const parts = extractBubbleContentParts({
      thinking: "plain",
    });
    expect(parts).toEqual([{ kind: "thinking", value: "plain" }]);
  });
});
