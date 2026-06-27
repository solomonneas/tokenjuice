# Changelog

## Unreleased

### Fixes

- Replace the compacted-output footer with a neutral, factual marker (characters omitted plus how to retrieve the full output) and only emit it when compaction removed a substantial amount, so tokenjuice no longer appends do-not-verify directives or footnotes tiny, untruncated output.
- Harden ownership detection, restoration, and malformed marker handling for beta host integrations.
- Build release artifacts from explicit tags and validate Homebrew tap release-tag input.
- Make `pnpm build` portable across supported Node platforms.

### Documentation

- Rework the README to lead with what tokenjuice does, why, and how this fork differs, and add "Why not something else?", "What tokenjuice is not", and "What this fork changes" sections.
- Add a prominent fork credit to [vincentkoc/tokenjuice](https://github.com/vincentkoc/tokenjuice) by Vincent Koc, used and extended under the MIT license (we also contribute upstream), and document install-from-source for this fork (the npm package and Homebrew tap install upstream's build, not this fork).
- Add `CONTRIBUTING.md` (with an upstream-contribution path) and `CODE_OF_CONDUCT.md`.
- Add GitHub issue templates (`bug.yml`, `feature.yml`, `config.yml` with `blank_issues_enabled: false` and an upstream contact link) and a pull request template with a no-PII / content-guard checkbox.

### Changed

- Add a second copyright line (`Copyright (c) 2026 Solomon Neas`) to `LICENSE` alongside the retained upstream copyright of Vincent Koc; both remain under the same MIT license.
- Re-point `package.json` `homepage`, `bugs`, and `repository` at `escoffier-labs/tokenjuice` for this fork; the npm package name and version are unchanged, and the upstream sponsorship link is retained.

## 0.8.0 - 2026-05-25

### Features

- Add a beta Agent Layer source-instruction integration.
- Add a beta AdaL CLI instruction integration.
- Add a beta Aether prompt-source integration.
- Add a beta aictl project-prompt integration.
- Add a beta AI Memory Protocol RST-memory integration.
- Add a beta AgentInit source-instruction integration.
- Add a beta Agentlink source-instruction integration.
- Add a beta anywhere-agents source-instruction integration.
- Add a beta Amazon Q Developer CLI workspace-rule integration.
- Add a beta Agentloom source-rule integration.
- Add a beta agents-cli shared-memory integration.
- Add a beta AGENTS.md instruction integration.
- Add a beta agents.ge source-rule integration.
- Add a beta AgentsMesh source-rule integration.
- Add a beta Baz workspace-skill integration.
- Add a beta Bito custom-guidelines integration.
- Add a beta Blackbox CLI workspace-skill integration.
- Add a beta Blocks repo-skill integration.
- Add a beta Clawdbot workspace-skill integration.
- Add a beta IBM Bob Shell context-file integration.
- Add a beta Builder Projects rule integration.
- Add a beta Charlie AGENTS.md instruction integration.
- Add a beta CodeAnt review-instructions integration.
- Add a beta Codebuff instruction integration.
- Add a beta Codegen instruction integration.
- Add a beta Coder Agents workspace-skill integration.
- Add a beta CodeRabbit path-instruction integration.
- Add a beta Command Code PostToolUse hook integration.
- Add a beta Deep Agents Code instruction integration.
- Add a beta Devin for Terminal PreToolUse hook integration.
- Add a beta dot-agents global-rule integration.
- Add a beta Docker Agent prompt-file integration.
- Add a beta ECA workspace-skill integration.
- Add a beta Elyra workspace-skill integration.
- Add a beta Firebase Studio AI-rules integration.
- Add a beta ForgeCode AGENTS.md instruction integration.
- Add a beta GitLab Duo custom-rules integration.
- Add a beta Greptile rules integration.
- Add a beta gptme instruction integration.
- Add a beta Jean2 instruction integration.
- Add a beta JetBrains AI Assistant project-rule integration.
- Add a beta Jules instruction integration.
- Add a beta LeanCTL project-instruction integration.
- Add a beta Kimi Code CLI PostToolUse hook integration.
- Add a beta LocalCode plugin integration.
- Add a beta mcp-agent agent-definition integration.
- Add a beta mini-SWE-agent config-fragment integration.
- Add a beta SWE-agent config-fragment integration.
- Add a beta Stagewise workspace-skill integration.
- Add a beta Mistral Vibe instruction integration.
- Add a beta Mux tool_post hook integration.
- Add a beta NovaKit context-file integration.
- Add a beta Knowns guidance-file integration.
- Add a beta Ona Agent workspace-skill integration.
- Add a beta pi-go workspace-skill integration.
- Add a beta Qodo review-guideline integration.
- Add a beta Replit Agent instruction integration.
- Add a beta Rovo Dev CLI project-memory integration.
- Add a beta Tabby system-prompt integration.
- Add a beta Tabnine CLI project-context integration.
- Add a beta Trae project-rule integration.
- Add a beta UiPath for Coding Agents instruction integration.
- Add a beta Warp project-rules integration.
- Add a beta Zencoder Zen Rules integration.

### Fixes

- Preserve existing instruction-file `.bak` backups instead of overwriting them during install.
- Preserve existing JetBrains AI Assistant `.bak` rule backups when installing over a custom rule.
- Normalize stored artifact sources for Copilot, Droid, and VS Code Copilot hook adapters.
- Add missing uninstall coverage for Claude Code, CodeBuddy, Cursor, and pi integrations.

## 0.7.1 - 2026-05-17

### Fixes

- Route `node scripts/run-vitest.mjs` output through the Vitest reducer so Rolldown plugin timing warnings do not drown out passing test summaries.
- Match wrapped Bash commands after harmless terminal setup preludes such as `tt title` or `tmux select-pane -T`.
- Route Claude Code through a `PreToolUse` Bash wrapper so Tokenjuice compacts the actual command result without duplicate `PostToolUse` context or approval-flow bypasses.
- Preserve CodeBuddy's native Bash approval flow when wrapping `PreToolUse` commands.
- Keep the Codex hook compatible with current Codex hook and approval surfaces, including `hooks`, `PermissionRequest`, Windows commands, async hooks, and approval/sandbox doctor reporting.
- Compact whole JSON fallback output without dropping non-zero exit status.
- Add timeout safety caps to Tokenjuice-installed Codex, Claude Code, and Copilot CLI hooks, with doctor warnings for stale entries.

### Maintenance

- Add `--help`/`-h` output to the Codex log analysis script.
- Update CI to the Node 24-ready pnpm setup action and remove the stale Release Drafter input warning.
