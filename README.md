# bunshim

A `node` for machines that only have [Bun](https://bun.sh).

Plenty of CLIs ship a `#!/usr/bin/env node` shebang. On a Bun-only box there is
no `node` on `PATH`, so they die with `exit 127` before they run a line. bunshim
is a small `node` executable that forwards those invocations to Bun when Bun can
honor them, and fails loudly when it cannot, so nothing silently does the wrong
thing.

## What it translates

| You run | It runs |
|---|---|
| `node script.js a b` | `bun run script.js a b` |
| `node -e "code"` | `bun -e "code"` |
| `node -p "expr"` | `bun -p "expr"` |
| `node --eval=code` | `bun -e code` |
| `echo code \| node` | `bun run -` |
| `node --version` | prints `process.version` (node-compatible) |

## What it refuses

It exits non-zero with a clear message instead of pretending, for:

- the interactive REPL (`node` with no script on a TTY)
- inspector / profiler flags (`--inspect`, `--prof`, `--cpu-prof`, ...)
- exotic V8 / loader flags (`--experimental-vm-modules`, `--stack-size`, ...)

These are node capabilities Bun does not reproduce. Run the real node for them.

## Install

Put `bin/node` early on your `PATH`:

```sh
ln -s "$PWD/bin/node" ~/.local/bin/node   # or anywhere ahead of the real PATH
```

If `bun` is not on `PATH`, point at it with `BUNSHIM_BUN=/path/to/bun`.

## Test

```sh
bun test
```

## Verified against real CLIs

Claims about a shim are cheap. These were measured on 2026-07-28 against two
third-party CLIs that ship a `#!/usr/bin/env node` shebang, on a machine with no
`node` installed. Each shim invocation was paired with a direct Bun control run,
and both were compared on exit code, stdout, and stderr.

| CLI | Invocation | Result |
|---|---|---|
| agent-browser 0.32.3 | `--version` | exit 0, stdout identical to control, stderr empty |
| agent-browser 0.32.3 | `--help` | exit 0, byte-for-byte identical to control |
| agent-browser 0.32.3 | `doctor --offline --quick --json` | exit 0, 2308 bytes of JSON, byte-for-byte identical |
| vercel | `--version` | exit 0, version on stdout and banner on stderr, both identical |
| vercel | `--help` | exit 0, full help on stderr with empty stdout, identical |

Vercel writing help to stderr rather than stdout is its own behavior, faithfully
forwarded. A shim that "fixed" that would be lying about what the program did.

**What this does not establish.** Every invocation above is informational, plus
one local diagnostic. Nothing here tests a command that performs network I/O,
spawns a browser, or exercises a Node API that Bun implements differently. The
shim forwards; it does not make Bun into Node. Untested is untested, and this
table says only what it measured.

## Scope

This is a compatibility shim, not a node reimplementation. It covers the
invocations a Bun-only machine actually hits when running node-shebang CLIs. If
your program needs a real node feature, it will tell you rather than guess.
