import { describe, expect, it } from "vitest";
import { attribute, generateDoc, mb, median, parseBenchLine, parseFootprint, parsePs, percentile, summarize, webkitKind } from "../scripts/bench-lib.mjs";
import { BENCH_MEASURES, lastMeasures } from "../src/bench";

const utf8 = (s: string) => new TextEncoder().encode(s).length;

describe("estatística", () => {
  it("mediana com n par e ímpar, sem mexer na entrada", () => {
    const xs = [5, 1, 3];
    expect(median(xs)).toBe(3);
    expect(xs).toEqual([5, 1, 3]);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNaN();
  });

  it("p90 pelo posto mais próximo devolve um valor medido", () => {
    const xs = [10, 1, 9, 2, 8, 3, 7, 4, 6, 5];
    expect(percentile(xs, 90)).toBe(9);
    expect(percentile(xs, 100)).toBe(10);
    expect(percentile(xs, 0)).toBe(1);
    expect(percentile([7], 90)).toBe(7);
    expect(percentile([], 90)).toBeNaN();
  });

  it("resumo", () => {
    expect(summarize([3, 1, 2])).toEqual({ n: 3, median: 2, p90: 3, min: 1, max: 3 });
  });
});

describe("documento sintético", () => {
  it("é determinístico e passa do alvo por pouco", () => {
    const a = generateDoc(100_000, 1);
    expect(generateDoc(100_000, 1)).toBe(a);
    expect(generateDoc(100_000, 2)).not.toBe(a);
    expect(utf8(a)).toBeGreaterThanOrEqual(100_000);
    expect(utf8(a)).toBeLessThan(105_000);
  });

  it("tem a mistura de um documento técnico", () => {
    const d = generateDoc(200_000);
    expect(d).toMatch(/^# Seção 1:/);
    expect(d).toMatch(/^#### /m);
    expect(d).toMatch(/^```ts$/m);
    expect(d).toMatch(/^\| .* \|$/m);
    expect(d).toMatch(/https:\/\/exemplo\.invalid\//);
    expect(d).not.toMatch(/```mermaid|\$\$|!\[/);
  });
});

describe("leitura das saídas", () => {
  it("linha do gancho", () => {
    const v = parseBenchLine('LEVE_BENCH {"doc":"/a.md","runMs":1.5,"epochMs":1700000000123,"pageMs":2,"measures":[]}');
    expect(v?.epochMs).toBe(1700000000123);
    expect(v?.doc).toBe("/a.md");
    expect(parseBenchLine("outra coisa")).toBeNull();
    expect(parseBenchLine("LEVE_BENCH {quebrado")).toBeNull();
    expect(parseBenchLine('LEVE_BENCH {"doc":"/a.md"}')).toBeNull();
  });

  it("ps, tipo do WebKit e atribuição pelo responsável", () => {
    const procs = parsePs(
      [
        "  100 /x/Leve.app/Contents/MacOS/leve",
        "  200 /System/Library/Frameworks/WebKit.framework/Versions/A/XPCServices/com.apple.WebKit.WebContent.xpc/Contents/MacOS/com.apple.WebKit.WebContent",
        "  201 /S/com.apple.WebKit.GPU.xpc/Contents/MacOS/com.apple.WebKit.GPU",
        "  202 /S/com.apple.WebKit.Networking.xpc/Contents/MacOS/com.apple.WebKit.Networking",
        "  300 /S/com.apple.WebKit.WebContent.xpc/Contents/MacOS/com.apple.WebKit.WebContent",
        "  400 /bin/zsh",
        "",
      ].join("\n"),
    );
    expect(procs).toHaveLength(6);
    expect(webkitKind(procs[1].comm)).toBe("WebContent");
    expect(webkitKind("/bin/zsh")).toBeNull();
    const resp = new Map([
      [200, 100],
      [201, 100],
      [202, 100],
      [300, 999],
      [400, 100],
    ]);
    const mine = attribute(procs, resp, 100);
    expect(mine.map((p) => [p.pid, p.kind])).toEqual([
      [100, "app"],
      [200, "WebContent"],
      [201, "GPU"],
      [202, "Networking"],
    ]);
  });

  it("footprint e MB", () => {
    expect(parseFootprint("Auxiliary data:\n    phys_footprint: 71419416 B\n    phys_footprint_peak: 268813824 B")).toBe(71419416);
    expect(parseFootprint("nada")).toBeNaN();
    expect(mb(7_984_262)).toBe("8,0");
    expect(mb(3_556_686, "en-US")).toBe("3.6");
  });
});

describe("gancho do frontend", () => {
  it("pega a última medida de cada nome, na ordem pedida", () => {
    const entries = [
      { name: "leve:render", startTime: 10, duration: 1 },
      { name: "leve:dom", startTime: 10, duration: 2 },
      { name: "outra", startTime: 0, duration: 9 },
      { name: "leve:render", startTime: 100, duration: 3 },
    ];
    expect(lastMeasures(entries, BENCH_MEASURES)).toEqual([
      { name: "leve:render", ms: 3, end: 103 },
      { name: "leve:dom", ms: 2, end: 12 },
    ]);
  });
});
