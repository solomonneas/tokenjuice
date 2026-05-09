import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  inspectCodexHooksFeatureFlag,
  installCodexHook,
  parseCodexFeatureFlag,
} from "../../src/hosts/codex/index.js";

async function withTempCodexHome<T>(
  fn: (paths: { hooksPath: string; configPath: string }) => Promise<T>,
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "tj-codex-"));
  try {
    await mkdir(dir, { recursive: true });
    return await fn({
      hooksPath: join(dir, "hooks.json"),
      configPath: join(dir, "config.toml"),
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("parseCodexFeatureFlag", () => {
  it("returns keyPresent=false when file has no features section", () => {
    expect(parseCodexFeatureFlag("[other]\nfoo = 1\n", "hooks")).toEqual({
      keyPresent: false,
      value: null,
    });
  });

  it("parses a scoped [features] section", () => {
    const source = "[features]\nhooks = true\n";
    expect(parseCodexFeatureFlag(source, "hooks")).toEqual({
      keyPresent: true,
      value: true,
    });
  });

  it("parses explicit false", () => {
    const source = "[features]\nhooks = false\n";
    expect(parseCodexFeatureFlag(source, "hooks")).toEqual({
      keyPresent: true,
      value: false,
    });
  });

  it("parses dotted features.hooks at top level", () => {
    const source = "features.hooks = true\n[other]\nfoo = 1\n";
    expect(parseCodexFeatureFlag(source, "hooks")).toEqual({
      keyPresent: true,
      value: true,
    });
  });

  it("ignores the key when outside [features]", () => {
    const source = "[other]\nhooks = true\n";
    expect(parseCodexFeatureFlag(source, "hooks")).toEqual({
      keyPresent: false,
      value: null,
    });
  });

  it("ignores commented-out assignments", () => {
    const source = "[features]\n# hooks = true\n";
    expect(parseCodexFeatureFlag(source, "hooks")).toEqual({
      keyPresent: false,
      value: null,
    });
  });

  it("ignores dotted assignments inside a non-root table", () => {
    const source = "[profiles.default]\nfeatures.hooks = true\n";
    expect(parseCodexFeatureFlag(source, "hooks")).toEqual({
      keyPresent: false,
      value: null,
    });
  });
});

describe("inspectCodexHooksFeatureFlag", () => {
  it("reports configExists=false when the config is missing", async () => {
    await withTempCodexHome(async ({ configPath }) => {
      const status = await inspectCodexHooksFeatureFlag(configPath);
      expect(status.configExists).toBe(false);
      expect(status.keyPresent).toBe(false);
      expect(status.value).toBe(null);
      expect(status.enabled).toBe(false);
      expect(status.fixHint).toContain("hooks");
    });
  });

  it("reports enabled=true when [features] hooks = true", async () => {
    await withTempCodexHome(async ({ configPath }) => {
      await writeFile(configPath, "[features]\nhooks = true\n", "utf8");
      const status = await inspectCodexHooksFeatureFlag(configPath);
      expect(status.configExists).toBe(true);
      expect(status.keyPresent).toBe(true);
      expect(status.value).toBe(true);
      expect(status.enabled).toBe(true);
      expect(status.fixHint).toBe("");
    });
  });

  it("reports enabled=false when hooks is explicitly disabled", async () => {
    await withTempCodexHome(async ({ configPath }) => {
      await writeFile(configPath, "[features]\nhooks = false\n", "utf8");
      const status = await inspectCodexHooksFeatureFlag(configPath);
      expect(status.configExists).toBe(true);
      expect(status.keyPresent).toBe(true);
      expect(status.value).toBe(false);
      expect(status.enabled).toBe(false);
      expect(status.fixHint).toContain("hooks");
    });
  });


  it("accepts legacy codex_hooks but marks it deprecated", async () => {
    await withTempCodexHome(async ({ configPath }) => {
      await writeFile(configPath, "[features]\ncodex_hooks = true\n", "utf8");
      const status = await inspectCodexHooksFeatureFlag(configPath);
      expect(status.enabled).toBe(true);
      expect(status.keyName).toBe("codex_hooks");
      expect(status.deprecatedKeyUsed).toBe(true);
    });
  });

  it("treats unreadable config as not enabled instead of throwing", async () => {
    if (process.platform === "win32") {
      return;
    }
    if (typeof process.getuid === "function" && process.getuid() === 0) {
      // root can read files regardless of mode bits; unreadable chmod tests are not meaningful.
      return;
    }

    await withTempCodexHome(async ({ configPath }) => {
      await writeFile(configPath, "[features]\nhooks = true\n", "utf8");
      try {
        await chmod(configPath, 0o000);
        const status = await inspectCodexHooksFeatureFlag(configPath);
        expect(status.configExists).toBe(true);
        expect(status.keyPresent).toBe(false);
        expect(status.value).toBe(null);
        expect(status.enabled).toBe(false);
      } finally {
        await chmod(configPath, 0o644);
      }
    });
  });
});

describe("installCodexHook feature-flag surface", () => {
  it("returns featureFlag.enabled=false when config.toml is missing", async () => {
    await withTempCodexHome(async ({ hooksPath }) => {
      const previousCodexHome = process.env.CODEX_HOME;
      process.env.CODEX_HOME = join(hooksPath, "..");
      try {
        const result = await installCodexHook(hooksPath);
        expect(result.featureFlag.enabled).toBe(false);
        expect(result.featureFlag.configExists).toBe(false);
        expect(result.featureFlag.fixHint).toContain("hooks");
        // sanity: hooks.json was still written as usual
        const hooks = JSON.parse(await readFile(hooksPath, "utf8"));
        expect(hooks.hooks.PostToolUse).toBeDefined();
      } finally {
        process.env.CODEX_HOME = previousCodexHome;
      }
    });
  });
});
