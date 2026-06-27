# Contributing to tokenjuice

tokenjuice is a deterministic output compactor for terminal-heavy agent workflows. This repository is a fork of [vincentkoc/tokenjuice](https://github.com/vincentkoc/tokenjuice) by Vincent Koc, used and extended under the MIT license. Patches are welcome here. Before you start, please skim this file so we both spend time on the right things.

## Upstream first, when it fits

Most of tokenjuice (the reducer engine, the host integration matrix, the CLI surface) comes from upstream. If your change is not specific to this fork, the change will reach the most people if it lands upstream. Please consider opening it against [vincentkoc/tokenjuice](https://github.com/vincentkoc/tokenjuice) as well as, or instead of, here. Fork-specific maintenance (project metadata, fleet integration work, docs about this fork) belongs here.

## What kinds of changes land easily

- **Bug fixes** in reducers, the `wrap` / `reduce` / `reduce-json` surfaces, `doctor` checks, or host install/uninstall paths.
- **New or sharper JSON rules** under `src/rules` that compact a real, observed high-noise command without losing the lines that matter.
- **Host integration fixes** that keep exact file-content reads raw and unsafe mixed command sequences untouched.
- **Test coverage** for any of the above.
- **Docs corrections** that match the real CLI behavior.

## What needs a conversation first

- **New host integrations** or changes to the public install surface. Open an issue describing the host and its hook file first.
- **Breaking changes** to the `reduce-json` envelope, rule ids, or artifact format.
- **Anything that adds a runtime dependency.** tokenjuice keeps its runtime footprint small on purpose.

## What does not land

- Personal details, hostnames, real private IPs, account ids, or live auth profiles in code, rules, docs, or tests. Use `192.0.2.x` (RFC 5737) for example IPs.
- Commands or hooks that call out to the network without explicit opt-in.
- AI co-authorship trailers on commits (`Co-Authored-By: <model>`). Conventional commits only.

## Local dev

```bash
git clone https://github.com/escoffier-labs/tokenjuice.git
cd tokenjuice
pnpm install
pnpm build
pnpm verify        # lint + circular check + typecheck + tests
```

Run a single surface against the local build:

```bash
node dist/cli/main.js wrap --full -- git status
node dist/cli/main.js doctor hooks
```

To smoke-test host hook pass-through the same way CI does:

```bash
pnpm e2e:local
```

## Adding or changing a rule

Built-in JSON rules live in `src/rules`. User overrides live in `~/.config/tokenjuice/rules` and project overrides in `.tokenjuice/rules`; later layers override earlier ones by rule id. When you add a rule:

1. Add the rule JSON under `src/rules`.
2. Add a fixture and a test that proves the rule keeps the lines that matter and drops the noise.
3. Run `tokenjuice verify --fixtures` and `pnpm test`.

## Filing issues

Please use the templates under `.github/ISSUE_TEMPLATE/`. They exist so you do not have to re-type the version and install shape every time. Before posting output, remove tokens, private hostnames, private repo names, and unredacted absolute paths.

## License

By contributing you agree that your contribution is licensed under the MIT License, the same license as the rest of the repo, and that the upstream copyright of Vincent Koc is preserved.
