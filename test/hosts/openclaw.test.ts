import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorInstalledHooks,
  doctorOpenClawExtension,
  installOpenClawExtension,
  uninstallOpenClawExtension,
} from "../../src/index.js";
import {
  commandRequestsTokenjuiceRawBypass,
  createTokenjuiceOpenClawExtension,
} from "../../src/hosts/openclaw/extension/runtime.js";

type FakePluginApi = {
  pluginConfig: Record<string, unknown>;
  logger: {
    debug?: (message: string) => void;
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
  };
  handlers: Map<string, (event: unknown, ctx: unknown) => unknown>;
  infoLog: string[];
  warnLog: string[];
  errorLog: string[];
  on: (hookName: string, handler: (event: unknown, ctx: unknown) => unknown) => void;
};

function createFakePluginApi(config: Record<string, unknown> = {}): FakePluginApi {
  const infoLog: string[] = [];
  const warnLog: string[] = [];
  const errorLog: string[] = [];
  const handlers = new Map<string, (event: unknown, ctx: unknown) => unknown>();
  return {
    pluginConfig: config,
    logger: {
      info: (message) => infoLog.push(message),
      warn: (message) => warnLog.push(message),
      error: (message) => errorLog.push(message),
    },
    handlers,
    infoLog,
    warnLog,
    errorLog,
    on(hookName, handler) {
      handlers.set(hookName, handler);
    },
  };
}

function buildToolResultMessage(options: {
  text: string;
  aggregated?: string;
  exitCode?: number;
  toolCallId?: string;
}): Record<string, unknown> {
  const { text, aggregated, exitCode, toolCallId } = options;
  const details: Record<string, unknown> = {};
  if (typeof aggregated === "string") {
    details.aggregated = aggregated;
  }
  if (typeof exitCode === "number") {
    details.exitCode = exitCode;
  }
  return {
    role: "toolResult",
    toolName: "exec",
    ...(typeof toolCallId === "string" ? { toolCallId } : {}),
    content: [{ type: "text", text }],
    details,
  };
}

const tempDirs: string[] = [];
const originalOpenClawConfigPath = process.env.OPENCLAW_CONFIG_PATH;
const originalHome = process.env.HOME;

afterEach(async () => {
  if (originalOpenClawConfigPath === undefined) {
    delete process.env.OPENCLAW_CONFIG_PATH;
  } else {
    process.env.OPENCLAW_CONFIG_PATH = originalOpenClawConfigPath;
  }
  if (originalHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalHome;
  }
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createFakeHome(): Promise<{ home: string; configPath: string; workspaceDir: string }> {
  const home = await mkdtemp(join(tmpdir(), "tokenjuice-openclaw-test-"));
  tempDirs.push(home);
  const configPath = join(home, "openclaw.json");
  const workspaceDir = join(home, "workspace");
  process.env.HOME = home;
  process.env.OPENCLAW_CONFIG_PATH = configPath;
  await mkdir(workspaceDir, { recursive: true });
  return { home, configPath, workspaceDir };
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function writeConfig(configPath: string, data: Record<string, unknown>): Promise<void> {
  await writeFile(configPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function extensionDirFor(workspaceDir: string): string {
  return join(workspaceDir, ".openclaw", "extensions", "tokenjuice-openclaw");
}

describe("installOpenClawExtension", () => {
  it("reports disabled when no extension is installed", async () => {
    const { workspaceDir } = await createFakeHome();

    const report = await doctorOpenClawExtension();

    expect(report.status).toBe("disabled");
    expect(report.extensionDir).toBe(extensionDirFor(join(process.env.HOME!, ".openclaw", "workspace")));
    // no config, so workspace defaults to ~/.openclaw/workspace relative to HOME
    expect(report.issues).toEqual([]);
    // the fake workspace we made is unrelated; disabled status should not look at it
    expect(workspaceDir).toBeDefined();
  });

  it("writes the three required files into the workspace extension dir", async () => {
    const { configPath, workspaceDir } = await createFakeHome();
    await writeConfig(configPath, {
      agents: { defaults: { workspace: workspaceDir } },
    });

    const result = await installOpenClawExtension({ local: true });
    const extDir = extensionDirFor(workspaceDir);

    expect(result.extensionDir).toBe(extDir);
    expect(result.configPath).toBe(configPath);
    expect(await pathExists(join(extDir, "index.js"))).toBe(true);
    expect(await pathExists(join(extDir, "package.json"))).toBe(true);
    expect(await pathExists(join(extDir, "openclaw.plugin.json"))).toBe(true);

    const manifest = await readJson(join(extDir, "openclaw.plugin.json")) as Record<string, unknown>;
    expect(manifest.id).toBe("tokenjuice-openclaw");

    const pkg = await readJson(join(extDir, "package.json")) as Record<string, unknown>;
    expect((pkg.openclaw as Record<string, unknown>).extensions).toEqual(["./index.js"]);

    const entry = await readFile(join(extDir, "index.js"), "utf8");
    expect(entry).toContain("createTokenjuiceOpenClawExtension");
    expect(entry).toContain("generated by tokenjuice v");
  });

  it("merges tokenjuice entries into openclaw.json and preserves unrelated fields", async () => {
    const { configPath, workspaceDir } = await createFakeHome();
    await writeConfig(configPath, {
      gateway: { mode: "local", port: 18789 },
      agents: { defaults: { workspace: workspaceDir } },
      plugins: {
        allow: ["discord", "telegram"],
        load: { paths: ["/some/other/path"] },
        entries: { discord: { enabled: true } },
      },
      unrelated: { keep: "me" },
    });

    const result = await installOpenClawExtension({ local: true });
    expect(result.configUpdated).toBe(true);
    expect(result.configBackupPath).toBeDefined();

    const config = await readJson(configPath) as Record<string, unknown>;
    expect((config.unrelated as Record<string, unknown>).keep).toBe("me");
    expect(config.gateway).toEqual({ mode: "local", port: 18789 });

    const plugins = config.plugins as Record<string, unknown>;
    expect(plugins.allow).toEqual(["discord", "telegram", "tokenjuice-openclaw"]);
    expect((plugins.load as Record<string, unknown>).paths).toEqual([
      "/some/other/path",
      extensionDirFor(workspaceDir),
    ]);
    expect((plugins.entries as Record<string, unknown>)["tokenjuice-openclaw"]).toEqual({ enabled: true });
    expect((plugins.entries as Record<string, unknown>).discord).toEqual({ enabled: true });
  });

  it("is idempotent - repeated installs do not duplicate entries", async () => {
    const { configPath, workspaceDir } = await createFakeHome();
    await writeConfig(configPath, {
      agents: { defaults: { workspace: workspaceDir } },
      plugins: { allow: ["tokenjuice-openclaw"] },
    });

    const first = await installOpenClawExtension({ local: true });
    const second = await installOpenClawExtension({ local: true });

    // first install adds load.paths + entries (allow was preset), config changes
    expect(first.configUpdated).toBe(true);
    // second install on a fully-populated config is a no-op for the config
    expect(second.configUpdated).toBe(false);

    const config = await readJson(configPath) as Record<string, unknown>;
    const plugins = config.plugins as Record<string, unknown>;
    const allow = plugins.allow as string[];
    expect(allow.filter((entry) => entry === "tokenjuice-openclaw").length).toBe(1);

    const paths = (plugins.load as Record<string, unknown>).paths as string[];
    expect(paths.filter((path) => path === extensionDirFor(workspaceDir)).length).toBe(1);
  });

  it("leaves plugins.allow alone when the config does not define an allowlist", async () => {
    const { configPath, workspaceDir } = await createFakeHome();
    await writeConfig(configPath, {
      agents: { defaults: { workspace: workspaceDir } },
      plugins: { entries: {} },
    });

    await installOpenClawExtension({ local: true });

    const config = await readJson(configPath) as Record<string, unknown>;
    const plugins = config.plugins as Record<string, unknown>;
    // when no allowlist exists, do not invent one - respect permissive mode
    expect("allow" in plugins).toBe(false);
  });

  it("backs up an existing extension directory", async () => {
    const { configPath, workspaceDir } = await createFakeHome();
    await writeConfig(configPath, {
      agents: { defaults: { workspace: workspaceDir } },
    });
    const extDir = extensionDirFor(workspaceDir);
    await mkdir(extDir, { recursive: true });
    await writeFile(join(extDir, "old-marker.txt"), "old content\n", "utf8");

    const result = await installOpenClawExtension({ local: true });

    expect(result.extensionBackupPath).toBeDefined();
    const backupContents = await readFile(join(result.extensionBackupPath!, "old-marker.txt"), "utf8");
    expect(backupContents).toBe("old content\n");
    // the new install should NOT preserve the old marker - it is a clean install
    expect(await pathExists(join(extDir, "old-marker.txt"))).toBe(false);
  });

  it("reports ok health after a successful install", async () => {
    const { configPath, workspaceDir } = await createFakeHome();
    await writeConfig(configPath, {
      agents: { defaults: { workspace: workspaceDir } },
    });

    await installOpenClawExtension({ local: true });
    const report = await doctorOpenClawExtension();

    expect(report.status).toBe("ok");
    expect(report.issues).toEqual([]);
    expect(report.missingPaths).toEqual([]);
    expect(report.extensionDir).toBe(extensionDirFor(workspaceDir));
  });

  it("reports broken when required files go missing", async () => {
    const { configPath, workspaceDir } = await createFakeHome();
    await writeConfig(configPath, {
      agents: { defaults: { workspace: workspaceDir } },
    });
    await installOpenClawExtension({ local: true });
    await rm(join(extensionDirFor(workspaceDir), "package.json"));

    const report = await doctorOpenClawExtension();

    expect(report.status).toBe("broken");
    expect(report.missingPaths).toContain(join(extensionDirFor(workspaceDir), "package.json"));
  });

  it("reports warn (not disabled) when the extension dir is gone but config still references it", async () => {
    const { configPath, workspaceDir } = await createFakeHome();
    await writeConfig(configPath, {
      agents: { defaults: { workspace: workspaceDir } },
    });
    await installOpenClawExtension({ local: true });

    // user nukes the extension dir manually without running uninstall
    await rm(extensionDirFor(workspaceDir), { recursive: true, force: true });

    const report = await doctorOpenClawExtension();
    expect(report.status).toBe("warn");
    expect(report.issues.join("\n")).toMatch(/still references the plugin in/u);
  });

  it("rejects openclaw.json roots that are not objects", async () => {
    const { configPath } = await createFakeHome();
    await writeFile(configPath, JSON.stringify(["not", "an", "object"]), "utf8");

    await expect(installOpenClawExtension({ local: true })).rejects.toThrow(
      /refusing to modify openclaw config/u,
    );
    await expect(uninstallOpenClawExtension()).rejects.toThrow(
      /refusing to modify openclaw config/u,
    );
    await expect(doctorOpenClawExtension()).rejects.toThrow(
      /refusing to modify openclaw config/u,
    );
  });

  it("reports warn when allowlist excludes tokenjuice-openclaw", async () => {
    const { configPath, workspaceDir } = await createFakeHome();
    await writeConfig(configPath, {
      agents: { defaults: { workspace: workspaceDir } },
    });
    await installOpenClawExtension({ local: true });

    // simulate user manually scrubbing our entry from an allowlist they now enforce
    const config = await readJson(configPath) as Record<string, unknown>;
    (config.plugins as Record<string, unknown>).allow = ["discord"];
    await writeConfig(configPath, config);

    const report = await doctorOpenClawExtension();

    expect(report.status).toBe("warn");
    expect(report.issues.join("\n")).toMatch(/plugins\.allow allowlist that does not include/u);
  });
});

describe("uninstallOpenClawExtension", () => {
  it("also cleans stale tokenjuice-openclaw paths and dirs when the workspace changed between install and uninstall", async () => {
    const { configPath, home } = await createFakeHome();
    const oldWorkspace = join(home, "workspace-old");
    const newWorkspace = join(home, "workspace-new");
    await mkdir(oldWorkspace, { recursive: true });
    await mkdir(newWorkspace, { recursive: true });

    // install under the old workspace
    await writeConfig(configPath, {
      agents: { defaults: { workspace: oldWorkspace } },
    });
    await installOpenClawExtension({ local: true });
    expect(await pathExists(extensionDirFor(oldWorkspace))).toBe(true);

    // user swaps workspace without running uninstall first
    await writeConfig(configPath, {
      agents: { defaults: { workspace: newWorkspace } },
      plugins: {
        allow: ["tokenjuice-openclaw"],
        load: { paths: [extensionDirFor(oldWorkspace)] },
        entries: { "tokenjuice-openclaw": { enabled: true } },
      },
    });

    const result = await uninstallOpenClawExtension();

    // uninstall should have wiped the stale-path extension dir too
    expect(await pathExists(extensionDirFor(oldWorkspace))).toBe(false);
    expect(result.removedConfigEntries).toBeGreaterThan(0);

    const config = await readJson(configPath) as Record<string, unknown>;
    const plugins = config.plugins as Record<string, unknown>;
    expect(plugins.allow).toEqual([]);
    expect((plugins.load as Record<string, unknown>).paths).toEqual([]);
    expect("tokenjuice-openclaw" in (plugins.entries as Record<string, unknown>)).toBe(false);
  });

  it("reports warn when a stale tokenjuice-openclaw load path lingers after a workspace change", async () => {
    const { configPath, home } = await createFakeHome();
    const oldWorkspace = join(home, "workspace-old");
    const newWorkspace = join(home, "workspace-new");
    await mkdir(oldWorkspace, { recursive: true });
    await mkdir(newWorkspace, { recursive: true });

    await writeConfig(configPath, {
      agents: { defaults: { workspace: oldWorkspace } },
    });
    await installOpenClawExtension({ local: true });

    // user changes workspace and manually installs a fresh copy in new workspace,
    // but forgets to clean up the old load path
    await writeConfig(configPath, {
      agents: { defaults: { workspace: newWorkspace } },
    });
    await installOpenClawExtension({ local: true });

    // now surface the stale path back into load.paths to simulate a drift
    const config = await readJson(configPath) as Record<string, unknown>;
    const plugins = config.plugins as Record<string, unknown>;
    const load = plugins.load as Record<string, unknown>;
    load.paths = [...(load.paths as string[]), extensionDirFor(oldWorkspace)];
    await writeConfig(configPath, config);

    const report = await doctorOpenClawExtension();
    expect(report.status).toBe("warn");
    expect(report.issues.join("\n")).toMatch(/stale tokenjuice-openclaw paths in plugins\.load\.paths/u);
  });

  it("removes the extension dir and strips openclaw.json entries", async () => {
    const { configPath, workspaceDir } = await createFakeHome();
    await writeConfig(configPath, {
      agents: { defaults: { workspace: workspaceDir } },
      plugins: {
        allow: ["discord", "tokenjuice-openclaw"],
        load: { paths: ["/other", join(workspaceDir, ".openclaw/extensions/tokenjuice-openclaw")] },
        entries: {
          discord: { enabled: true },
          "tokenjuice-openclaw": { enabled: true },
        },
      },
    });
    await installOpenClawExtension({ local: true });

    const result = await uninstallOpenClawExtension();

    expect(result.removedDir).toBe(true);
    expect(result.removedConfigEntries).toBeGreaterThan(0);
    expect(await pathExists(result.extensionDir)).toBe(false);

    const config = await readJson(configPath) as Record<string, unknown>;
    const plugins = config.plugins as Record<string, unknown>;
    expect(plugins.allow).toEqual(["discord"]);
    expect((plugins.load as Record<string, unknown>).paths).toEqual(["/other"]);
    expect("tokenjuice-openclaw" in (plugins.entries as Record<string, unknown>)).toBe(false);
    expect((plugins.entries as Record<string, unknown>).discord).toEqual({ enabled: true });
  });
});

describe("doctorInstalledHooks aggregate", () => {
  it("includes openclaw in the integrations report and propagates its status", async () => {
    const { configPath, workspaceDir } = await createFakeHome();
    // an ok install for openclaw; the other hosts are disabled because HOME points
    // at a fresh temp dir without any of their config files.
    await writeConfig(configPath, {
      agents: { defaults: { workspace: workspaceDir } },
    });
    await installOpenClawExtension({ local: true });

    const report = await doctorInstalledHooks();

    expect(Object.keys(report.integrations)).toContain("openclaw");
    expect(report.integrations.openclaw.status).toBe("ok");
    // the aggregate status should still be "ok" or "warn" (disabled/ok from other hosts)
    expect(["ok", "warn"]).toContain(report.status);
  });
});

describe("commandRequestsTokenjuiceRawBypass", () => {
  it("detects bare tokenjuice wrap --raw", () => {
    expect(commandRequestsTokenjuiceRawBypass("tokenjuice wrap --raw -- git status")).toBe(true);
    expect(commandRequestsTokenjuiceRawBypass("tokenjuice wrap --full -- git status")).toBe(true);
  });

  it("detects absolute-path tokenjuice invocations", () => {
    expect(commandRequestsTokenjuiceRawBypass("/usr/local/bin/tokenjuice wrap --raw -- git status")).toBe(true);
    expect(commandRequestsTokenjuiceRawBypass("/opt/homebrew/bin/tokenjuice wrap --full -- pnpm test")).toBe(true);
  });

  it("detects node-launched tokenjuice", () => {
    expect(commandRequestsTokenjuiceRawBypass("/usr/bin/node /path/to/tokenjuice/dist/cli/main.js wrap --raw -- git status")).toBe(true);
  });

  it("does not fire on non-tokenjuice commands", () => {
    expect(commandRequestsTokenjuiceRawBypass("git status")).toBe(false);
    expect(commandRequestsTokenjuiceRawBypass("tokenjuice reduce --raw")).toBe(false);
    expect(commandRequestsTokenjuiceRawBypass("my-tokenjuice-wrapper wrap --raw -- git status")).toBe(false);
  });
});

describe("tokenjuice-openclaw runtime hook", () => {
  it("compacts exec tool output when the command matches a reducer", () => {
    const api = createFakePluginApi();
    createTokenjuiceOpenClawExtension()(api);

    const toolCallId = "call_test_1";
    const before = api.handlers.get("before_tool_call")!;
    const persist = api.handlers.get("tool_result_persist")!;

    before({ toolName: "exec", params: { command: "git status" }, toolCallId }, {});

    const message = buildToolResultMessage({
      text: [
        "On branch main",
        "",
        "Changes not staged for commit:",
        "\tmodified:   src/hosts/openclaw/index.ts",
        "",
        "no changes added to commit",
      ].join("\n"),
      exitCode: 0,
      toolCallId,
    });

    const result = persist({ toolName: "exec", toolCallId, message }, {}) as {
      message: { content: Array<{ text: string }> };
    } | undefined;

    expect(result).toBeDefined();
    const text = result!.message.content[0]!.text;
    expect(text).toContain("M: src/hosts/openclaw/index.ts");
    expect(text).toContain("tokenjuice compacted bash output");
  });

  it("passes non-exec tools through unchanged", () => {
    const api = createFakePluginApi();
    createTokenjuiceOpenClawExtension()(api);

    const persist = api.handlers.get("tool_result_persist")!;
    const message = buildToolResultMessage({
      text: "some text",
      toolCallId: "call_read_1",
    });
    const result = persist({ toolName: "read", toolCallId: "call_read_1", message }, {});

    expect(result).toBeUndefined();
  });

  it("passes exec tool calls without a captured command", () => {
    const api = createFakePluginApi();
    createTokenjuiceOpenClawExtension()(api);

    const persist = api.handlers.get("tool_result_persist")!;
    const message = buildToolResultMessage({
      text: "some text",
      toolCallId: "call_exec_1",
    });
    const result = persist({ toolName: "exec", toolCallId: "call_exec_1", message }, {});

    expect(result).toBeUndefined();
  });

  it("honors tokenjuice wrap --raw bypass", () => {
    const api = createFakePluginApi();
    createTokenjuiceOpenClawExtension()(api);

    const before = api.handlers.get("before_tool_call")!;
    const persist = api.handlers.get("tool_result_persist")!;

    before({ toolName: "exec", params: { command: "tokenjuice wrap --raw -- git status" }, toolCallId: "call_bypass_1" }, {});

    const message = buildToolResultMessage({
      text: [
        "On branch main",
        "",
        "Changes not staged for commit:",
        "\tmodified:   src/hosts/openclaw/index.ts",
      ].join("\n"),
      toolCallId: "call_bypass_1",
    });

    const result = persist({ toolName: "exec", toolCallId: "call_bypass_1", message }, {});

    expect(result).toBeUndefined();
  });

  it("skips synthetic tool results", () => {
    const api = createFakePluginApi();
    createTokenjuiceOpenClawExtension()(api);

    const before = api.handlers.get("before_tool_call")!;
    const persist = api.handlers.get("tool_result_persist")!;

    before({ toolName: "exec", params: { command: "git status" }, toolCallId: "call_synthetic_1" }, {});
    const message = buildToolResultMessage({ text: "anything", toolCallId: "call_synthetic_1" });

    const result = persist(
      { toolName: "exec", toolCallId: "call_synthetic_1", message, isSynthetic: true },
      {},
    );

    expect(result).toBeUndefined();
  });

  it("prefers details.aggregated when it extends beyond content[0].text", () => {
    const api = createFakePluginApi();
    createTokenjuiceOpenClawExtension()(api);

    const before = api.handlers.get("before_tool_call")!;
    const persist = api.handlers.get("tool_result_persist")!;

    before({ toolName: "exec", params: { command: "git status" }, toolCallId: "call_aggregated_1" }, {});

    const fullOutput = [
      "On branch main",
      "",
      "Changes not staged for commit:",
      "\tmodified:   src/hosts/openclaw/index.ts",
      "\tmodified:   src/hosts/openclaw/extension/runtime.ts",
      "",
      "no changes added to commit",
    ].join("\n");
    const truncated = fullOutput.slice(0, 40);

    const message = buildToolResultMessage({
      text: truncated,
      aggregated: fullOutput,
      toolCallId: "call_aggregated_1",
    });

    const result = persist({ toolName: "exec", toolCallId: "call_aggregated_1", message }, {}) as {
      message: { content: Array<{ text: string }> };
    };

    expect(result).toBeDefined();
    expect(result.message.content[0]!.text).toContain("M: src/hosts/openclaw/index.ts");
    expect(result.message.content[0]!.text).toContain("M: src/hosts/openclaw/extension/runtime.ts");
  });

  it("does not substitute when the reducer keeps the output (low savings)", () => {
    const api = createFakePluginApi();
    createTokenjuiceOpenClawExtension()(api);

    const before = api.handlers.get("before_tool_call")!;
    const persist = api.handlers.get("tool_result_persist")!;

    before({ toolName: "exec", params: { command: "printf 'hi'" }, toolCallId: "call_keep_1" }, {});
    const message = buildToolResultMessage({ text: "hi", toolCallId: "call_keep_1" });

    const result = persist({ toolName: "exec", toolCallId: "call_keep_1", message }, {});

    expect(result).toBeUndefined();
  });

  it("rewrites the correct text block when content[0] is not the text block", () => {
    const api = createFakePluginApi();
    createTokenjuiceOpenClawExtension()(api);

    const before = api.handlers.get("before_tool_call")!;
    const persist = api.handlers.get("tool_result_persist")!;

    before({ toolName: "exec", params: { command: "git status" }, toolCallId: "call_mixed_1" }, {});

    const statusText = [
      "On branch main",
      "",
      "Changes not staged for commit:",
      "\tmodified:   src/hosts/openclaw/index.ts",
    ].join("\n");
    const message = {
      role: "toolResult",
      toolName: "exec",
      toolCallId: "call_mixed_1",
      content: [
        { type: "image", source: { type: "base64", media_type: "image/png", data: "IGNORED" } },
        { type: "text", text: statusText },
      ],
      details: {},
    };

    const result = persist({ toolName: "exec", toolCallId: "call_mixed_1", message }, {}) as {
      message: { content: Array<Record<string, unknown>> };
    };

    expect(result).toBeDefined();
    // leading image block is preserved untouched
    expect((result.message.content[0] as Record<string, unknown>).type).toBe("image");
    const textBlock = result.message.content[1] as { text: string };
    expect(textBlock.text).toContain("M: src/hosts/openclaw/index.ts");
    expect(textBlock.text).toContain("tokenjuice compacted bash output");
  });

  it("honors custom toolName configuration", () => {
    const api = createFakePluginApi();
    createTokenjuiceOpenClawExtension({ toolName: "shell" })(api);

    const before = api.handlers.get("before_tool_call")!;
    const persist = api.handlers.get("tool_result_persist")!;

    // exec should be ignored - wrong tool name
    before({ toolName: "exec", params: { command: "git status" }, toolCallId: "call_exec" }, {});
    const execMessage = buildToolResultMessage({ text: "ignored", toolCallId: "call_exec" });
    expect(persist({ toolName: "exec", toolCallId: "call_exec", message: execMessage }, {})).toBeUndefined();

    // shell should be intercepted
    before({ toolName: "shell", params: { command: "git status" }, toolCallId: "call_shell" }, {});
    const shellMessage = buildToolResultMessage({
      text: [
        "On branch main",
        "",
        "Changes not staged for commit:",
        "\tmodified:   src/hosts/openclaw/index.ts",
      ].join("\n"),
      toolCallId: "call_shell",
    });

    const result = persist({ toolName: "shell", toolCallId: "call_shell", message: shellMessage }, {}) as {
      message: { content: Array<{ text: string }> };
    };

    expect(result).toBeDefined();
    expect(result.message.content[0]!.text).toContain("M: src/hosts/openclaw/index.ts");
  });
});
