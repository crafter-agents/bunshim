import { expect, test, describe } from "bun:test";
import { spawnSync } from "bun";
import { join } from "node:path";

const SHIM = join(import.meta.dir, "..", "bin", "node");

function run(args: string[], input?: string, env?: Record<string, string>) {
  const res = spawnSync([SHIM, ...args], {
    stdin: input === undefined ? "ignore" : Buffer.from(input),
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...env },
  });
  return {
    code: res.exitCode,
    out: res.stdout.toString(),
    err: res.stderr.toString(),
  };
}

describe("bunshim: things bun can run", () => {
  test("--help describes the shim", () => {
    const r = run(["--help"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("shim");
  });

  test("-h describes the shim", () => {
    const r = run(["-h"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("shim");
  });

  test("--help advertises the bun executable override", () => {
    const r = run(["--help"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("BUNSHIM_BUN");
  });

  test("runs a script file and forwards argv", () => {
    const script = join(import.meta.dir, "fixtures", "argv.js");
    const r = run([script, "a", "b", "c"]);
    expect(r.code).toBe(0);
    expect(r.out.trim()).toBe("a,b,c");
  });

  test("-e evaluates code", () => {
    const r = run(["-e", 'console.log(1 + 2)']);
    expect(r.code).toBe(0);
    expect(r.out.trim()).toBe("3");
  });

  test("-e preserves trailing arguments after Bun's script-path slot", () => {
    const r = run(
      ["-e", "console.log(process.argv.slice(2))", "foo", "bar"],
      undefined,
      { BUNSHIM_BUN: "bun" },
    );
    expect(r.code).toBe(0);
    expect(r.out.trim()).toBe('[ "bar" ]');
  });

  test("-p prints an expression", () => {
    const r = run(["-p", '40 + 2']);
    expect(r.code).toBe(0);
    expect(r.out.trim()).toBe("42");
  });

  test("-p preserves trailing arguments after Bun's script-path slot", () => {
    const r = run(
      ["-p", "process.argv.slice(2)", "one", "two", "three"],
      undefined,
      { BUNSHIM_BUN: "bun" },
    );
    expect(r.code).toBe(0);
    expect(r.out.trim()).toBe('[ "two", "three" ]');
  });

  test("-pe prints an expression", () => {
    const r = run(["-pe", "40 + 2"]);
    expect(r.code).toBe(0);
    expect(r.out.trim()).toBe("42");
  });

  test("-pe preserves trailing arguments after Bun's script-path slot", () => {
    const r = run(
      ["-pe", "process.argv.slice(2)", "one", "two", "three"],
      undefined,
      { BUNSHIM_BUN: "bun" },
    );
    expect(r.code).toBe(0);
    expect(r.out.trim()).toBe('[ "two", "three" ]');
  });

  test("-ep prints an expression", () => {
    const r = run(["-ep", "40 + 2"]);
    expect(r.code).toBe(0);
    expect(r.out.trim()).toBe("42");
  });

  test("--print=EXPR prints an expression", () => {
    const r = run(["--print=7 * 6"]);
    expect(r.code).toBe(0);
    expect(r.out.trim()).toBe("42");
  });

  test("--eval=CODE form works", () => {
    const r = run(["--eval=console.log('joined')"]);
    expect(r.code).toBe(0);
    expect(r.out.trim()).toBe("joined");
  });

  test("reads a program from stdin", () => {
    const r = run([], 'console.log("from stdin")');
    expect(r.code).toBe(0);
    expect(r.out.trim()).toBe("from stdin");
  });

  test("an explicit dash reads a program from stdin", () => {
    const r = run(["-"], "console.log('dash')");
    expect(r.code).toBe(0);
    expect(r.out.trim()).toBe("dash");
  });

  test("-- runs a script and forwards its arguments", () => {
    const script = join(import.meta.dir, "fixtures", "argv.js");
    const r = run(["--", script, "a", "b"]);
    expect(r.code).toBe(0);
    expect(r.out.trim()).toBe("a,b");
  });

  test("passes through a benign flag before a script", () => {
    const script = join(import.meta.dir, "fixtures", "argv.js");
    const r = run(["--enable-source-maps", script, "x"]);
    expect(r.code).toBe(0);
    expect(r.out.trim()).toBe("x");
  });

  test("strips an equals-form max old space size flag", () => {
    const script = join(import.meta.dir, "fixtures", "argv.js");
    const r = run(["--max-old-space-size=256", script, "a", "b"]);
    expect(r.code).toBe(0);
    expect(r.out.trim()).toBe("a,b");
  });

  test("preserves a heap flag after the argument separator", () => {
    const script = join(import.meta.dir, "fixtures", "argv.js");
    const r = run(["--", script, "--max-old-space-size=1234", "foo"]);
    expect(r.code).toBe(0);
    expect(r.out.trim()).toBe("--max-old-space-size=1234,foo");
  });

  test("preserves a heap flag after the script without an argument separator", () => {
    const script = join(import.meta.dir, "fixtures", "argv.js");
    const r = run([script, "--max-old-space-size=1234", "foo"]);
    expect(r.code).toBe(0);
    expect(r.out.trim()).toBe("--max-old-space-size=1234,foo");
  });

  test("strips a bare max old space size flag and its numeric value", () => {
    const r = run([
      "--max-old-space-size",
      "256",
      "-e",
      'console.log("ok")',
    ]);
    expect(r.code).toBe(0);
    expect(r.out.trim()).toBe("ok");
  });

  test("strips multiple bare heap flags and their numeric values", () => {
    const script = join(import.meta.dir, "fixtures", "argv.js");
    const r = run([
      "--max-old-space-size",
      "256",
      "--max-semi-space-size",
      "8",
      "--max-heap-size",
      "512",
      script,
      "foo",
    ]);
    expect(r.code).toBe(0);
    expect(r.out.trim()).toBe("foo");
  });

  test("tolerates a max semi space size flag", () => {
    const script = join(import.meta.dir, "fixtures", "argv.js");
    const r = run(["--max-semi-space-size=8", script]);
    expect(r.code).toBe(0);
  });

  test("--version reports a node-compatible version", () => {
    const r = run(["--version"]);
    expect(r.code).toBe(0);
    expect(r.out.trim()).toMatch(/^v\d+\.\d+\.\d+/);
  });

  test("-v reports a node-compatible version", () => {
    const r = run(["-v"]);
    expect(r.code).toBe(0);
    expect(r.out.trim()).toMatch(/^v\d+\.\d+\.\d+/);
  });
});

describe("bunshim: module preload", () => {
  test("version and help flags after a preload use shim output", () => {
    const preload = join(import.meta.dir, "fixtures", "preload-marker.js");

    const version = run(["-r", preload, "--version"]);
    expect(version.code).toBe(0);
    expect(version.out.trim()).toMatch(/^v\d+\.\d+\.\d+/);
    expect(version.out).not.toContain("Usage: bun run");

    const help = run(["-r", preload, "-h"]);
    expect(help.code).toBe(0);
    expect(help.out).toContain("bunshim: a node-to-bun shim");
    expect(help.out).not.toContain("Usage: bun run");
  });

  test("-r preloads a module before -e evaluates code", () => {
    const preload = join(import.meta.dir, "fixtures", "preload-marker.js");
    const r = run([
      "-r",
      preload,
      "-e",
      'console.log(globalThis.__bunshimPreload ?? "not-preloaded")',
    ]);
    expect(r.code).toBe(0);
    expect(r.out.trim()).toBe("preloaded");
    expect(r.out).not.toContain("Usage: bun run");
  });

  test("-r preloads a module before -p prints the result", () => {
    const preload = join(import.meta.dir, "fixtures", "preload-marker.js");
    const r = run([
      "-r",
      preload,
      "-p",
      "globalThis.__bunshimPreload === 'preloaded' ? 40 + 2 : 0",
    ]);
    expect(r.code).toBe(0);
    expect(r.out.trim()).toBe("42");
    expect(r.out).not.toContain("Usage: bun run");
  });

  test("-r preloads a module before -pe and -ep print the result", () => {
    const preload = join(import.meta.dir, "fixtures", "preload-marker.js");
    for (const flag of ["-pe", "-ep"]) {
      const r = run([
        "-r",
        preload,
        flag,
        "globalThis.__bunshimPreload === 'preloaded' ? 40 + 2 : 0",
      ]);
      expect(r.code).toBe(0);
      expect(r.out.trim()).toBe("42");
      expect(r.out).not.toContain("Usage: bun run");
    }
  });

  test("-r preloads a module before the main script", () => {
    const preload = join(import.meta.dir, "fixtures", "preload-marker.js");
    const main = join(import.meta.dir, "fixtures", "reads-preload.js");
    const r = run(["-r", preload, main]);
    expect(r.code).toBe(0);
    expect(r.out.trim()).toBe("preloaded");
  });

  test("-r preloads a module before the main script when followed by --", () => {
    const preload = join(import.meta.dir, "fixtures", "preload-marker.js");
    const main = join(import.meta.dir, "fixtures", "reads-preload.js");
    const r = run(["-r", preload, "--", main, "foo", "bar"]);
    expect(r.code).toBe(0);
    expect(r.out.trim()).toBe("preloaded");

    const argv = join(import.meta.dir, "fixtures", "argv.js");
    const argvResult = run(["-r", preload, "--", argv, "foo", "bar"]);
    expect(argvResult.code).toBe(0);
    expect(argvResult.out.trim()).toBe("foo,bar");
  });

  test("heap sizing flags are stripped before module preload", () => {
    const preload = join(import.meta.dir, "fixtures", "preload-marker.js");
    const main = join(import.meta.dir, "fixtures", "reads-preload.js");
    const r = run(["--max-old-space-size=256", "-r", preload, main]);
    expect(r.code).toBe(0);
    expect(r.out.trim()).toBe("preloaded");
  });

  test("preserves a trailing heap flag after a preloaded main script", () => {
    const preload = join(import.meta.dir, "fixtures", "preload-marker.js");
    const main = join(import.meta.dir, "fixtures", "reads-preload.js");
    const r = run(["-r", preload, main, "--max-old-space-size=1234"]);
    expect(r.code).toBe(0);
    expect(r.out.trim()).toBe("preloaded");

    const argv = join(import.meta.dir, "fixtures", "argv.js");
    const argvResult = run([
      "-r",
      preload,
      argv,
      "--max-old-space-size=1234",
      "foo",
    ]);
    expect(argvResult.code).toBe(0);
    expect(argvResult.out.trim()).toBe("--max-old-space-size=1234,foo");
  });

  test("--require=VALUE preloads a module before the main script", () => {
    const preload = join(import.meta.dir, "fixtures", "preload-marker.js");
    const main = join(import.meta.dir, "fixtures", "reads-preload.js");
    const r = run([`--require=${preload}`, main]);
    expect(r.code).toBe(0);
    expect(r.out.trim()).toBe("preloaded");
  });

  test("--import preloads a module before the main script", () => {
    const preload = join(import.meta.dir, "fixtures", "preload-marker.js");
    const main = join(import.meta.dir, "fixtures", "reads-preload.js");
    const r = run(["--import", preload, main]);
    expect(r.code).toBe(0);
    expect(r.out.trim()).toBe("preloaded");
  });
});

describe("bunshim: things it refuses honestly", () => {
  test("syntax-check flags fail without running a script", () => {
    const script = join(import.meta.dir, "fixtures", "argv.js");
    for (const args of [
      ["-c", script],
      ["--check", script],
      ["--check=whatever"],
    ]) {
      const r = run(args);
      expect(r.code).toBe(2);
      expect(r.err).toContain("check");
    }
  });

  test("syntax-check flags after a preload fail without running the script", () => {
    const preload = join(import.meta.dir, "fixtures", "preload-marker.js");
    const main = join(import.meta.dir, "fixtures", "reads-preload.js");
    for (const args of [
      ["-r", preload, "-c", main],
      ["-r", preload, "--check", main],
      ["--require", preload, "--check=whatever", main],
      [`--require=${preload}`, "--check", main],
      ["--import", preload, "-c", main],
      [`--import=${preload}`, "--check=whatever", main],
    ]) {
      const r = run(args);
      expect(r.code).toBe(2);
      expect(r.err).toContain("check");
      expect(r.out).not.toContain("preloaded");
    }
  });

  test("node --test fails with the test-runner mismatch explained", () => {
    for (const args of [["--test"], ["--test", "whatever.js"]]) {
      const r = run(args);
      expect(r.code).toBe(2);
      expect(r.err).toContain("--test");
      expect(r.err).toContain("bun test");
    }
  });

  test("exotic V8/inspector flags fail with a clear message", () => {
    for (const flag of ["--prof", "--inspect", "--experimental-vm-modules"]) {
      const r = run([flag, "whatever.js"]);
      expect(r.code).toBe(2);
      expect(r.err).toContain("not supported");
    }
  });

  test("unsupported flags after a preload are refused only before the script", () => {
    const preload = join(import.meta.dir, "fixtures", "preload-marker.js");
    const main = join(import.meta.dir, "fixtures", "reads-preload.js");
    const argv = join(import.meta.dir, "fixtures", "argv.js");

    const refused = run(["-r", preload, "--inspect", main]);
    expect(refused.code).toBe(2);
    expect(refused.err).toContain("not supported");

    const scriptArgument = run([argv, "--inspect"]);
    expect(scriptArgument.code).toBe(0);
    expect(scriptArgument.out.trim()).toBe("--inspect");

    const preloadEval = run([
      "-r",
      preload,
      "-e",
      'console.log(globalThis.__bunshimPreload ?? "missing")',
    ]);
    expect(preloadEval.code).toBe(0);
    expect(preloadEval.out.trim()).toBe("preloaded");
  });

  test("-e without code is an honest error", () => {
    const r = run(["-e"]);
    expect(r.code).toBe(2);
    expect(r.err).toContain("needs a code argument");
  });

  test("-p and --print without code are honest errors", () => {
    for (const flag of ["-p", "--print"]) {
      const r = run([flag]);
      expect(r.code).toBe(2);
      expect(r.err).toContain("needs a code argument");
    }
  });

  test("-pe without code is an honest error", () => {
    const r = run(["-pe"]);
    expect(r.code).toBe(2);
    expect(r.err).toContain("needs a code argument");
  });

  test("-- without a script is an honest error", () => {
    const r = run(["--"]);
    expect(r.code).toBe(2);
    expect(r.err).toContain("nothing to run after --");
  });
});

describe("bunshim: NODE_OPTIONS", () => {
  test("refuses --check", () => {
    const script = join(import.meta.dir, "fixtures", "argv.js");
    const r = run([script], undefined, { NODE_OPTIONS: "--check" });
    expect(r.code).toBe(2);
    expect(r.err).toContain("check");
  });

  test("refuses -c", () => {
    const script = join(import.meta.dir, "fixtures", "argv.js");
    const r = run([script], undefined, { NODE_OPTIONS: "-c" });
    expect(r.code).toBe(2);
    expect(r.err).toContain("check");
  });

  test("--require does not preload a module", () => {
    const preload = join(import.meta.dir, "fixtures", "preload-marker.js");
    const main = join(import.meta.dir, "fixtures", "reads-preload.js");
    const r = run([main], undefined, {
      NODE_OPTIONS: `--require=${preload}`,
    });
    expect(r.code).toBe(0);
    expect(r.out.trim()).toBe("missing");
  });

  test("strips a max old space size flag", () => {
    const script = join(import.meta.dir, "fixtures", "argv.js");
    const r = run([script], undefined, {
      NODE_OPTIONS: "--max-old-space-size=4096",
    });
    expect(r.code).toBe(0);
  });

  test("refuses a denylisted inspector flag", () => {
    const script = join(import.meta.dir, "fixtures", "argv.js");
    const r = run([script], undefined, { NODE_OPTIONS: "--inspect" });
    expect(r.code).toBe(2);
    expect(r.err).toContain("NODE_OPTIONS");
  });

  test("refuses a denylisted flag mixed with a benign flag", () => {
    const script = join(import.meta.dir, "fixtures", "argv.js");
    const r = run([script], undefined, {
      NODE_OPTIONS: "--prof --enable-source-maps",
    });
    expect(r.code).toBe(2);
    expect(r.err).toContain("NODE_OPTIONS");
  });

  test("an empty value leaves the happy path unchanged", () => {
    const r = run(["-e", "console.log(1 + 2)"], undefined, {
      NODE_OPTIONS: "",
    });
    expect(r.code).toBe(0);
    expect(r.out.trim()).toBe("3");
  });
});
