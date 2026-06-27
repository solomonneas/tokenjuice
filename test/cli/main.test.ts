import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { buildCompactionFooter } from "../../src/core/compaction-metadata.js";
import { decorateWrapInlineText, isDirectModuleEntrypoint, parseArgs, resolveNoOmit } from "../../src/cli/main.js";
import type { CompactResult } from "../../src/types.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tokenjuice-cli-main-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("parseArgs", () => {
  it("parses --no-omit for reduce and wrap", () => {
    expect(parseArgs(["reduce", "--no-omit"]).noOmit).toBe(true);
    expect(parseArgs(["wrap", "--no-omit", "--", "echo", "hi"]).noOmit).toBe(true);
  });
});

function makeResult(authoritative: boolean, rawChars: number, reducedChars: number): CompactResult {
  return {
    inlineText: "summary",
    compaction: {
      authoritative,
      kinds: authoritative ? ["head-tail-omission"] : ["no-omit-domain-passthrough"],
    },
    stats: {
      rawChars,
      reducedChars,
      ratio: rawChars > 0 ? reducedChars / rawChars : 0,
    },
    classification: {
      family: "generic",
      confidence: 0.9,
      matchedReducer: "generic/fallback",
    },
  };
}

describe("decorateWrapInlineText", () => {
  it("adds a neutral compaction footer for substantial lossy summaries", () => {
    const decorated = decorateWrapInlineText(makeResult(true, 4_000, 40), false);
    expect(decorated).toContain(buildCompactionFooter(4_000, 40));
  });

  it("uses a non-instructional footer with no do-not-verify language", () => {
    const decorated = decorateWrapInlineText(makeResult(true, 4_000, 40), false);
    for (const banned of ["Do not", "do not", "not retrievable", "Proceed with the task", "authoritative"]) {
      expect(decorated).not.toContain(banned);
    }
  });

  it("provides the raw-artifact recovery command when output is stored", () => {
    const result: CompactResult = {
      inlineText: "summary",
      compaction: {
        authoritative: true,
        kinds: ["head-tail-omission"],
      },
      rawRef: {
        id: "tj_0123456789ab",
        path: "/tmp/tokenjuice/raw.txt",
        metadataPath: "/tmp/tokenjuice/meta.json",
      },
      stats: {
        rawChars: 4_000,
        reducedChars: 40,
        ratio: 0.01,
      },
      classification: {
        family: "generic",
        confidence: 0.9,
        matchedReducer: "generic/fallback",
      },
    };

    expect(decorateWrapInlineText(result, false)).toContain("tokenjuice cat tj_0123456789ab");
  });

  it("suppresses the footer for lossless rewrites", () => {
    expect(decorateWrapInlineText(makeResult(false, 4_000, 40), false)).toBe("summary");
  });

  it("suppresses the footer when too few characters were omitted", () => {
    // 300 chars saved is below FOOTER_MIN_SAVED_CHARS even though the ratio is high.
    expect(decorateWrapInlineText(makeResult(true, 400, 100), false)).toBe("summary");
  });

  it("suppresses the footer when the savings ratio is too small", () => {
    // 1_500 chars saved clears the absolute floor, but 15% is below FOOTER_MIN_SAVED_RATIO.
    expect(decorateWrapInlineText(makeResult(true, 10_000, 8_500), false)).toBe("summary");
  });
});

describe("resolveNoOmit", () => {
  it("enables noOmit from TOKENJUICE_NO_OMISSION", () => {
    expect(resolveNoOmit(false, { TOKENJUICE_NO_OMISSION: "1" })).toBe(true);
  });

  it("keeps noOmit enabled when the CLI flag is set", () => {
    expect(resolveNoOmit(true, {})).toBe(true);
  });
});

describe("isDirectModuleEntrypoint", () => {
  it("matches a relative argv[1] path", async () => {
    const dir = await createTempDir();
    const modulePath = join(dir, "main.js");
    const cwd = join(dir, "cwd");
    const originalCwd = process.cwd();
    await writeFile(modulePath, "");
    await mkdir(cwd);
    process.chdir(cwd);

    try {
      await expect(isDirectModuleEntrypoint(pathToFileURL(modulePath), ["node", "../main.js"])).resolves.toBe(true);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("matches a symlinked argv[1] path", async () => {
    const dir = await createTempDir();
    const modulePath = join(dir, "main.js");
    const symlinkPath = join(dir, "tokenjuice");
    await writeFile(modulePath, "");
    await symlink(modulePath, symlinkPath);

    await expect(isDirectModuleEntrypoint(pathToFileURL(modulePath), ["node", symlinkPath])).resolves.toBe(true);
  });
});
