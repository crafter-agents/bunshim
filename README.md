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
| `node -pe "expr"` | `bun -p expr` |
| `node -ep "expr"` | `bun -p expr` |
| `node --eval=code` | `bun -e code` |
| `echo code \| node` | `bun run -` |
| `node --version` | prints `process.version` (node-compatible) |
| `node -r module script.js` | forwards the preload flag to `bun run` |
| `node --require=module script.js` | forwards the preload flag to `bun run` |
| `node --import module script.js` | forwards the preload flag to `bun run` |

## What it ignores

Node heap-sizing flags are accepted and ignored because Bun manages its own
heap. This applies both to command-line arguments and `NODE_OPTIONS`.

| Accepted forms |
|---|
| `--max-old-space-size=SIZE` or `--max-old-space-size SIZE` |
| `--max-semi-space-size=SIZE` or `--max-semi-space-size SIZE` |
| `--max-heap-size=SIZE` or `--max-heap-size SIZE` |

## What it refuses

It exits non-zero with a clear message instead of pretending, for:

- the interactive REPL (`node` with no script on a TTY)
- syntax-check flags (`-c`, `--check`) because Bun cannot syntax-check without executing
- the Node test runner (`--test`) because `node:test` and `bun test` have incompatible semantics
- inspector / profiler flags (`--inspect`, `--prof`, `--cpu-prof`, ...)
- exotic V8 / loader flags (`--experimental-vm-modules`, `--stack-size`, ...)

The same flags are also refused when passed via `NODE_OPTIONS`.
`NODE_OPTIONS` syntax-check flags (`-c` and `--check`) refuse just like the CLI path.
Unsupported flags are detected anywhere before the script name, including
after a supported preload flag. Flags after the script name remain script arguments.

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

Claims about a shim are cheap. These were measured across 2026-07-28 and
2026-07-29 against four third-party CLIs: agent-browser, vercel, Clerk, and pnpm.
Each ships a `#!/usr/bin/env node` shebang and was tested on a machine with no
`node` installed. Each shim invocation was paired with a direct Bun control run,
and both were compared on exit code, stdout, and stderr.

| CLI | Invocation | Result |
|---|---|---|
| agent-browser 0.32.3 | `--version` | exit 0, stdout identical to control, stderr empty |
| agent-browser 0.32.3 | `--help` | exit 0, byte-for-byte identical to control |
| agent-browser 0.32.3 | `doctor --offline --quick --json` | exit 0, 2308 bytes of JSON, byte-for-byte identical |
| vercel | `--version` | exit 0, version on stdout and banner on stderr, both identical |
| vercel | `--help` | exit 0, full help on stderr with empty stdout, identical |
| Clerk 2.0.1-snapshot.9f8329d | `--version` | exit code, stdout, and stderr byte-for-byte identical to control |
| Clerk 2.0.1-snapshot.9f8329d | `--help` | exit code, 2,133-byte stdout, and stderr byte-for-byte identical to control |
| pnpm 10.18.3 | `--version` | exit code, stdout, and stderr byte-for-byte identical to control |
| pnpm 10.18.3 | `--help` | exit code, 3,209-byte stdout, and stderr byte-for-byte identical to control |
| gemini-cli 0.25.2 | `--version` | exit 0, stdout and stderr byte-for-byte identical to control |
| gemini-cli 0.25.2 | `--help` | exit 0, stdout and stderr byte-for-byte identical to control |

Vercel writing help to stderr rather than stdout is its own behavior, faithfully
forwarded. A shim that "fixed" that would be lying about what the program did.

**What this does not establish.** Every invocation above is informational, plus
one local diagnostic. Nothing here tests a command that performs network I/O,
spawns a browser, or exercises a Node API that Bun implements differently. The
shim forwards; it does not make Bun into Node. Untested is untested, and this
table says only what it measured.

## Runtime behavior: shim versus Bun versus real Node

The table above covers external CLIs. This one covers the shim's own runtime
semantics: every row is a shim invocation paired with a direct-Bun control run
on the same machine, compared on exit code, stdout, and stderr. "Real Node"
values are the documented behavior, not a rerun of actual Node (there is none
on this machine to run).

**Divergences from real Node.** These are deliberate: bunshim forwards to Bun
faithfully rather than pretending to be Node, so where Bun itself differs from
Node, the shim differs too.

| Behavior | Command | Shim / Bun control result | Real Node would |
|---|---|---|---|
| `--version` | `node --version` vs `bun --version` | shim prints `v24.3.0` (Node-compatible), Bun prints its own `1.3.0` | print its own Node version, not Bun's |
| Runtime identity | `node -e 'console.log(process.title, process.argv0, process.execPath)'` | both report Bun's title and executable paths | report `"node"` and a Node executable path |
| Global `Bun` object | `node -e 'console.log(typeof Bun, typeof process.versions.bun)'` | both expose `"object"` for `Bun` and a string for `process.versions.bun` | have neither |
| Trailing args with `-e` / `-p` / `-pe` / `-ep` | `node -e 'console.log(process.argv.slice(2))' foo bar` | both consume the first trailing arg into Bun's script-path slot; only `["bar"]` reaches `process.argv.slice(2)` | leave `["foo", "bar"]` in `process.argv.slice(2)` |
| `NODE_OPTIONS="--require=PATH"` / `--import=PATH` | preload via env var vs `-r PATH` | both silently no-op the env-var form; `-r PATH` on the CLI does preload | preload the named module before the entry script runs, from either form |
| Unknown `NODE_OPTIONS` flag | `NODE_OPTIONS="--totally-bogus-flag-xyz"` | both accept it silently and run | reject an unrecognized flag at startup |

**Confirmed compatible.** Same paired comparison; shim and Bun control matched
exactly, and the behavior matches real Node's documented semantics too.

| Behavior | Command |
|---|---|
| CommonJS `__dirname`, `__filename`, `module.id` | `node fixture.js` (require of a CJS fixture) |
| `NODE_PATH` resolution | `NODE_PATH=dir node -e 'require("fixture")'` |
| `node:`-prefixed built-ins | `node -e 'require("node:path")'`, `require("node:test")` |
| `require.main === module` | `node fixture.js` |
| `process.exitCode` assignment | `node -e 'process.exitCode = 7; console.log("before"); console.log("after")'` |
| Uncaught synchronous exception | `node -e 'throw new Error("x")'` (exit 1, matching stderr) |
| Unhandled promise rejection | `node -e 'Promise.reject(new Error("x"))'` (exit 1, matching stderr) |
| Recursive `node` spawn through `PATH` | a script spawning a child `node --version` with the shim's bin dir on `PATH` |
| Unknown CLI flag passthrough | `node --totally-unknown-flag-xyz -e '...'` |

## Scope

This is a compatibility shim, not a node reimplementation. It covers the
invocations a Bun-only machine actually hits when running node-shebang CLIs. If
your program needs a real node feature, it will tell you rather than guess.

`bin/node` is a `#!/bin/sh` script, so it only runs where a POSIX shell does:
Linux and macOS. Native Windows has no shebang interpreter, so `bin/node`
cannot run there at all; CI covers Linux and macOS only for that reason, not
as an oversight.
