import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DICTS, detectLang, setLang, t } from "../src/i18n";
import { render } from "../src/render";
import { shortcutRows } from "../src/shortcuts";
import { dailyCheckDue, DAY_MS } from "../src/updater";
import { loadYaml } from "../src/yaml";

// Front matter e dados de nó do Mermaid leem o `yaml`, que o app carrega sob demanda (src/yaml.ts).
beforeAll(() => loadYaml());

describe("i18n", () => {
  afterAll(() => setLang("pt-BR"));

  it("idioma do sistema: qualquer português vira pt-BR, o resto inglês", () => {
    expect(detectLang(["pt-PT"])).toBe("pt-BR");
    expect(detectLang(["pt"])).toBe("pt-BR");
    expect(detectLang(["de-DE", "pt-BR"])).toBe("pt-BR");
    expect(detectLang(["en-GB", "pt-BR"])).toBe("en");
    expect(detectLang(["fr-FR"])).toBe("en");
    expect(detectLang([])).toBe("en");
  });

  it("os dois dicionários têm as mesmas chaves e os mesmos parâmetros", () => {
    const pt = DICTS["pt-BR"];
    const en = DICTS.en;
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
    const params = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const k of Object.keys(pt) as (keyof typeof pt)[]) expect(params(en[k]), k).toEqual(params(pt[k]));
  });

  it("troca parâmetros e mantém o que não veio", () => {
    setLang("en");
    expect(t("find.nth", { i: 2, n: 5 })).toBe("Result 2 of 5");
    expect(t("doc.notFound")).toBe("Not found: {path}");
    setLang("pt-BR");
    expect(t("find.nth", { i: 2, n: 5 })).toBe("Resultado 2 de 5");
  });

  it("render e atalhos acompanham o idioma", () => {
    setLang("en");
    expect(render("> [!NOTE]\n> x")).toContain('class="alert-title">Note</');
    expect(render("---\na: true\n---\n# x")).toContain("<summary>Metadata</summary>");
    expect(shortcutRows("windows").find(([, k]) => k.includes("click"))?.[1]).toBe("Ctrl+click");
    setLang("pt-BR");
    expect(render("> [!NOTE]\n> x")).toContain('class="alert-title">Nota</');
    expect(shortcutRows("mac").find(([w]) => w === "Abrir link em aba nova")?.[1]).toBe("⌘clique");
  });
});

describe("checagem diária de atualização", () => {
  const now = 1_800_000_000_000;
  it("só com a preferência ligada e 24 h depois da última", () => {
    expect(dailyCheckDue(now, null, false)).toBe(false);
    expect(dailyCheckDue(now, null, true)).toBe(true);
    expect(dailyCheckDue(now, now - DAY_MS + 1, true)).toBe(false);
    expect(dailyCheckDue(now, now - DAY_MS, true)).toBe(true);
    expect(dailyCheckDue(now, Number.NaN, true)).toBe(true);
    expect(dailyCheckDue(now, now + 60_000, true), "relógio voltou").toBe(true);
  });
});
