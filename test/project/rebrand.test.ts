import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("Token Glace branding", () => {
  it("uses Token Glace package metadata while preserving the legacy tokenjuice launcher", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
      name?: string;
      homepage?: string;
      bugs?: { url?: string };
      repository?: { url?: string };
      bin?: Record<string, string>;
    };

    expect(packageJson.name).toBe("token-glace");
    expect(packageJson.homepage).toBe("https://github.com/escoffier-labs/token-glace");
    expect(packageJson.bugs?.url).toBe("https://github.com/escoffier-labs/token-glace/issues");
    expect(packageJson.repository?.url).toBe("git+https://github.com/escoffier-labs/token-glace.git");
    expect(packageJson.bin).toMatchObject({
      "token-glace": "dist/cli/main.js",
      tokenjuice: "dist/cli/main.js",
    });
  });

  it("presents Token Glace in the README without the old juicebox emoji", async () => {
    const readme = await readFile("README.md", "utf8");

    expect(readme).toContain("<h1 align=\"center\">Token Glace</h1>");
    expect(readme).toContain("docs/assets/token-glace-social-preview.jpg");
    expect(readme).not.toContain("docs/assets/tokenjuice-social-preview.jpg");
    expect(readme).toContain("`token-glace --help`");
    expect(readme).not.toContain("\u{1F9C3}");
  });
});
