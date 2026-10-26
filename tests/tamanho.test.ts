import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { check, measure, openingAssets, ORCAMENTO, report } from "../scripts/tamanho.mjs";

// Sem @types/node no projeto: módulos do Node por import dinâmico, tipados só no que o teste usa.
interface NodeApi {
  mkdirSync(p: string, o: { recursive: true }): void;
  mkdtempSync(prefix: string): string;
  rmSync(p: string, o: { recursive: true; force: true }): void;
  writeFileSync(p: string, body: string): void;
  tmpdir(): string;
  join(...p: string[]): string;
  dirname(p: string): string;
  gzipSync(s: string, o: { level: number }): { length: number };
  spawnSync(cmd: string, args: string[], o: { encoding: "utf8" }): { status: number | null; stdout: string; stderr: string };
  execPath: string;
}
let node: NodeApi;
beforeAll(async () => {
  const mods = await Promise.all(["node:fs", "node:os", "node:path", "node:zlib", "node:child_process", "node:process"].map((m) => import(m as string)));
  node = Object.assign({}, ...mods);
});

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) node.rmSync(d, { recursive: true, force: true });
});

function fixture(files: Record<string, string>) {
  const dir = node.mkdtempSync(node.join(node.tmpdir(), "leve-tamanho-"));
  dirs.push(dir);
  for (const [p, body] of Object.entries(files)) {
    node.mkdirSync(node.dirname(node.join(dir, p)), { recursive: true });
    node.writeFileSync(node.join(dir, p), body);
  }
  return dir;
}

const html = `<!doctype html><html><head>
<script type="module" crossorigin src="/assets/index-abc.js"></script>
<link rel="stylesheet" crossorigin href="/assets/index-def.css">
<link rel="icon" href="/favicon.png">
</head><body><button class="link"></button></body></html>`;

describe("orçamento de tamanho", () => {
  it("acha o JS de módulo e o CSS do index.html, sem ícone nem outros links", () => {
    expect(openingAssets(html)).toEqual(["assets/index-abc.js", "assets/index-def.css"]);
  });

  it("conta o modulepreload na abertura", () => {
    const comPreload = html.replace("</head>", '<link rel="modulepreload" crossorigin href="/assets/vendor-xyz.js"></head>');
    expect(openingAssets(comPreload)).toEqual(["assets/index-abc.js", "assets/index-def.css", "assets/vendor-xyz.js"]);
    const d = fixture({
      "index.html": comPreload,
      "assets/index-abc.js": "a".repeat(300),
      "assets/index-def.css": "b".repeat(50),
      "assets/vendor-xyz.js": "v".repeat(200),
    });
    expect(measure(d).values.abertura).toBe(550);
  });

  it("mede total, abertura e maior arquivo de um dist", () => {
    const js = "a".repeat(300);
    const css = "b".repeat(50);
    const d = fixture({
      "index.html": html,
      "favicon.png": "x".repeat(10),
      "assets/index-abc.js": js,
      "assets/index-def.css": css,
      "assets/elk-123.js": "c".repeat(1000),
    });
    const m = measure(d);
    const gz = (s: string) => node.gzipSync(s, { level: 9 }).length;
    expect(m.values.total).toBe(html.length + 10 + 300 + 50 + 1000);
    expect(m.values.abertura).toBe(350);
    expect(m.values.aberturaGzip).toBe(gz(js) + gz(css));
    expect(m.values.maior).toBe(1000);
    expect(m.largest).toBe("assets/elk-123.js");
    expect(m.opening).toEqual(["assets/index-abc.js", "assets/index-def.css"]);
    expect(m.count).toBe(5);
  });

  it("recusa dist sem index.html ou com referência quebrada, em vez de medir zero", () => {
    expect(() => measure(fixture({ "assets/a.js": "x" }))).toThrow(/sem index.html/);
    expect(() => measure(fixture({ "index.html": html, "assets/index-abc.js": "x" }))).toThrow(/index-def.css/);
  });

  it("passa no limite e acusa o que estourou e por quanto", () => {
    const values = { total: 100, totalGzip: 50, abertura: 1531, aberturaGzip: 10, maior: 60 };
    const rows = check(values, { total: 100, totalGzip: 50, abertura: 1000, aberturaGzip: 10, maior: 60 });
    expect(rows.filter((r) => !r.ok).map((r) => [r.key, r.over])).toEqual([["abertura", 531]]);
    expect(report(rows)).toMatch(/chunk de abertura .*ESTOUROU por 0,5 kB \(153%\)/);
  });

  it("ignora medida sem limite e checa todas no orçamento padrão", () => {
    const values = { total: 9e9, totalGzip: 0, abertura: 0, aberturaGzip: 0, maior: 0 };
    expect(check(values, { maior: 1 }).map((r) => r.key)).toEqual(["maior"]);
    const padrao = check(values);
    expect(padrao.map((r) => r.key)).toEqual(["total", "totalGzip", "abertura", "aberturaGzip", "maior"]);
    expect(padrao.filter((r) => !r.ok).map((r) => r.key)).toEqual(["total"]);
  });

  it("o CLI sai com 0 dentro do orçamento e com erro quando estoura", () => {
    const files = { "index.html": html, "assets/index-abc.js": "a".repeat(300), "assets/index-def.css": "b".repeat(50) };
    const run = (d: string) => node.spawnSync(node.execPath, ["scripts/tamanho.mjs", d], { encoding: "utf8" });

    const ok = run(fixture(files));
    expect(ok.status, ok.stderr).toBe(0);
    expect(ok.stdout).toMatch(/chunk de abertura/);

    // Um arquivo maior que ORCAMENTO.maior (e fora da abertura) estoura só esse limite.
    const big = run(fixture({ ...files, "assets/elk-123.js": "c".repeat(ORCAMENTO.maior + 1) }));
    expect(big.status).not.toBe(0);
    expect(big.stdout).toMatch(/maior arquivo .*ESTOUROU por 0,0 kB/);
    expect(big.stderr).toMatch(/1 limite\(s\) estourado\(s\)/);
  });
});
