import { afterEach, describe, expect, it, vi } from "vitest";

describe("getClaudeHome", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function loadGetClaudeHome() {
    const mod = await import("@/lib/claude/path");
    return mod.getClaudeHome;
  }

  it("prefers CLAUDE_CONFIG_DIR over CLAUDE_HOME", async () => {
    vi.stubEnv("CLAUDE_CONFIG_DIR", "/custom/config");
    vi.stubEnv("CLAUDE_HOME", "/legacy/home");

    const getClaudeHome = await loadGetClaudeHome();
    expect(getClaudeHome()).toBe("/custom/config");
  });

  it("falls back to CLAUDE_HOME when CLAUDE_CONFIG_DIR is unset", async () => {
    vi.stubEnv("CLAUDE_HOME", "/legacy/home");

    const getClaudeHome = await loadGetClaudeHome();
    expect(getClaudeHome()).toBe("/legacy/home");
  });
});
