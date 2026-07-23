import { expect, test, describe } from "bun:test";
import { spawnSync } from "bun";
import { join } from "node:path";

const SHIM = join(import.meta.dir, "..", "bin", "node");

function run(args: string[], input?: string) {
  const res = spawnSync([SHIM, ...args], {
    stdin: input === undefined ? "ignore" : Buffer.from(input),
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env },
  });
  return {
    code: res.exitCode,
    out: res.stdout.toString(),
    err: res.stderr.toString(),
  };
}

describe("bunshim: things bun can run", () => {
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

  test("-p prints an expression", () => {
    const r = run(["-p", '40 + 2']);
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

  test("--version reports a node-compatible version", () => {
    const r = run(["--version"]);
    expect(r.code).toBe(0);
    expect(r.out.trim()).toMatch(/^v\d+\.\d+\.\d+/);
  });
});

describe("bunshim: things it refuses honestly", () => {
  test("exotic V8/inspector flags fail with a clear message", () => {
    for (const flag of ["--prof", "--inspect", "--experimental-vm-modules"]) {
      const r = run([flag, "whatever.js"]);
      expect(r.code).toBe(2);
      expect(r.err).toContain("not supported");
    }
  });

  test("-e without code is an honest error", () => {
    const r = run(["-e"]);
    expect(r.code).toBe(2);
    expect(r.err).toContain("needs a code argument");
  });
});
