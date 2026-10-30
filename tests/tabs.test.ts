import { beforeEach, describe, expect, it } from "vitest";
import { PREF_KEYS, TABS_KEY, savedTabs } from "../src/prefs";
import {
  type Tab,
  adoptSaved,
  canGoBack,
  canGoForward,
  commitDoc,
  cycleTarget,
  findTab,
  insertTab,
  parseSavedTabs,
  removeTab,
  restoreSaved,
  serializeTabs,
  stepHistory,
  tabFactory,
} from "../src/tabs";

const name = (p: string) => p.split("/").pop() ?? p;

/** Lista com as abas na ordem dada, cada uma inserida no fim. */
function setup(...paths: string[]): { tabs: Tab[]; make: (p: string) => Tab } {
  const f = tabFactory();
  const make = (p: string) => f(p, name(p));
  const tabs: Tab[] = [];
  for (const p of paths) insertTab(tabs, make(p), null, false);
  return { tabs, make };
}

const paths = (tabs: readonly Tab[]) => tabs.map((t) => t.path);

describe("criar e inserir", () => {
  it("id sequencial, histórico começando no próprio caminho, sem âncora", () => {
    const f = tabFactory();
    const a = f("/a.md", "a.md");
    const b = f("/b.md", "b.md");
    expect([a.id, b.id]).toEqual([1, 2]);
    expect(a).toEqual({ id: 1, path: "/a.md", name: "a.md", hist: ["/a.md"], histIdx: 0, anchor: null });
    // Cada fábrica conta do zero (uma por página).
    expect(tabFactory()("/c.md", "c.md").id).toBe(1);
  });

  it("insere logo depois da ativa", () => {
    const { tabs, make } = setup("/a.md", "/b.md", "/c.md");
    insertTab(tabs, make("/x.md"), tabs[0]);
    expect(paths(tabs)).toEqual(["/a.md", "/x.md", "/b.md", "/c.md"]);
    insertTab(tabs, make("/y.md"), tabs[3]);
    expect(paths(tabs)).toEqual(["/a.md", "/x.md", "/b.md", "/c.md", "/y.md"]);
  });

  it("sem ativa, ou com afterActive desligado, vai para o fim", () => {
    const { tabs, make } = setup("/a.md", "/b.md");
    insertTab(tabs, make("/x.md"), null);
    insertTab(tabs, make("/y.md"), tabs[0], false);
    expect(paths(tabs)).toEqual(["/a.md", "/b.md", "/x.md", "/y.md"]);
  });

  it("acha a aba existente pelo caminho (abrir em nova ou focar)", () => {
    const { tabs } = setup("/a.md", "/b.md");
    expect(findTab(tabs, "/b.md")).toBe(tabs[1]);
    expect(findTab(tabs, "/c.md")).toBeUndefined();
  });
});

describe("fechar", () => {
  it("fechar outra que não a ativa: a ativa continua", () => {
    const { tabs } = setup("/a.md", "/b.md", "/c.md");
    const [a, b] = tabs;
    expect(removeTab(tabs, a, b)).toEqual({ next: b });
    expect(paths(tabs)).toEqual(["/b.md", "/c.md"]);
  });

  it("fechar a ativa: a da direita assume", () => {
    const { tabs } = setup("/a.md", "/b.md", "/c.md");
    const [, b, c] = tabs;
    expect(removeTab(tabs, b, b)?.next).toBe(c);
  });

  it("fechar a ativa que é a última: a da esquerda assume", () => {
    const { tabs } = setup("/a.md", "/b.md", "/c.md");
    const [, b, c] = tabs;
    expect(removeTab(tabs, c, c)?.next).toBe(b);
  });

  it("fechar a única: estado vazio", () => {
    const { tabs } = setup("/a.md");
    expect(removeTab(tabs, tabs[0], tabs[0])).toEqual({ next: null });
    expect(tabs).toEqual([]);
  });

  it("aba que já saiu: nada muda", () => {
    const { tabs, make } = setup("/a.md");
    expect(removeTab(tabs, make("/x.md"), tabs[0])).toBeNull();
    expect(paths(tabs)).toEqual(["/a.md"]);
  });
});

describe("ciclo entre abas", () => {
  it("±1 com volta nas pontas", () => {
    const { tabs } = setup("/a.md", "/b.md", "/c.md");
    const [a, b, c] = tabs;
    expect(cycleTarget(tabs, a, 1)).toBe(b);
    expect(cycleTarget(tabs, c, 1)).toBe(a);
    expect(cycleTarget(tabs, a, -1)).toBe(c);
    expect(cycleTarget(tabs, b, -1)).toBe(a);
  });

  it("sem ativa ou com uma aba só: nada", () => {
    const one = setup("/a.md").tabs;
    expect(cycleTarget(one, one[0], 1)).toBeNull();
    expect(cycleTarget(setup("/a.md", "/b.md").tabs, null, 1)).toBeNull();
  });
});

describe("histórico", () => {
  it("aba nova: nem voltar nem avançar", () => {
    const t = setup("/a.md").tabs[0];
    expect([canGoBack(t), canGoForward(t)]).toEqual([false, false]);
    expect([canGoBack(null), canGoForward(null)]).toEqual([false, false]);
  });

  it("push entra depois da posição e descarta o avançar", () => {
    const t = setup("/a.md").tabs[0];
    commitDoc(t, "/b.md", "b.md", true);
    commitDoc(t, "/c.md", "c.md", true);
    expect(t.hist).toEqual(["/a.md", "/b.md", "/c.md"]);
    expect(stepHistory(t, -1)).toBe("/b.md");
    expect(stepHistory(t, -1)).toBe("/a.md");
    expect([canGoBack(t), canGoForward(t)]).toEqual([false, true]);
    commitDoc(t, "/d.md", "d.md", true);
    expect(t.hist).toEqual(["/a.md", "/d.md"]);
    expect(t.histIdx).toBe(1);
    expect([canGoBack(t), canGoForward(t)]).toEqual([true, false]);
  });

  it("voltar e avançar param nos limites sem mexer no índice", () => {
    const t = setup("/a.md").tabs[0];
    commitDoc(t, "/b.md", "b.md", true);
    expect(stepHistory(t, 1)).toBeNull();
    expect(t.histIdx).toBe(1);
    expect(stepHistory(t, -1)).toBe("/a.md");
    expect(stepHistory(t, -1)).toBeNull();
    expect(t.histIdx).toBe(0);
    expect(stepHistory(t, 1)).toBe("/b.md");
  });

  it("sem push (voltar, troca de aba): troca caminho e nome, o histórico fica", () => {
    const t = setup("/a.md").tabs[0];
    commitDoc(t, "/b.md", "b.md", true);
    stepHistory(t, -1);
    t.anchor = { top: 10, index: 1, offset: 2 };
    commitDoc(t, "/a.md", "a.md", false);
    expect(t).toMatchObject({ path: "/a.md", name: "a.md", hist: ["/a.md", "/b.md"], histIdx: 0, anchor: null });
  });
});

describe("leve.tabs", () => {
  it("formato atual exato: caminhos e índice da ativa", () => {
    const { tabs } = setup("/a.md", "/b.md", "/c.md");
    expect(serializeTabs(tabs, tabs[1])).toBe('{"paths":["/a.md","/b.md","/c.md"],"active":1}');
    expect(serializeTabs(tabs, null)).toBe('{"paths":["/a.md","/b.md","/c.md"],"active":-1}');
    expect(serializeTabs([], null)).toBe('{"paths":[],"active":-1}');
  });

  it("o exemplo (sample:*) fica fora, e o índice da ativa conta só os arquivos", () => {
    const { tabs } = setup("sample:pt-BR", "/a.md", "sample:en", "/b.md");
    expect(serializeTabs(tabs, tabs[3])).toBe('{"paths":["/a.md","/b.md"],"active":1}');
    expect(serializeTabs(tabs, tabs[1])).toBe('{"paths":["/a.md","/b.md"],"active":0}');
  });

  it("o colado (clip:*) também fica fora, ativo ou não", () => {
    const { tabs } = setup("/a.md", "clip:1", "/b.md", "clip:2");
    expect(serializeTabs(tabs, tabs[2])).toBe('{"paths":["/a.md","/b.md"],"active":1}');
    expect(serializeTabs(tabs, tabs[1])).toBe('{"paths":["/a.md","/b.md"],"active":-1}');
  });

  it("exemplo ativo: -1 (a restauração cai na primeira)", () => {
    const { tabs } = setup("/a.md", "sample:pt-BR", "/b.md");
    expect(serializeTabs(tabs, tabs[1])).toBe('{"paths":["/a.md","/b.md"],"active":-1}');
  });

  it("JSON salvo por versões anteriores volta igual", () => {
    expect(parseSavedTabs(JSON.parse('{"paths":["/Users/x/a.md","C:\\\\docs\\\\b.md"],"active":1}'))).toEqual({
      paths: ["/Users/x/a.md", "C:\\docs\\b.md"],
      active: 1,
    });
  });

  it("lixo vira vazio; caminho que não é texto sai; ativa não numérica vira 0", () => {
    expect(parseSavedTabs(null)).toEqual({ paths: [], active: 0 });
    expect(parseSavedTabs("x")).toEqual({ paths: [], active: 0 });
    expect(parseSavedTabs({ paths: "a", active: "1" })).toEqual({ paths: [], active: 0 });
    expect(parseSavedTabs({ paths: ["/a.md", 7, null, "/b.md"], active: -1 })).toEqual({ paths: ["/a.md", "/b.md"], active: -1 });
  });

  it("ida e volta: mesmas abas e a mesma ativa", () => {
    const { tabs } = setup("/a.md", "sample:en", "/b.md", "/c.md");
    const saved = parseSavedTabs(JSON.parse(serializeTabs(tabs, tabs[3])));
    const back = setup();
    const act = restoreSaved(back.tabs, saved, back.make);
    expect(paths(back.tabs)).toEqual(["/a.md", "/b.md", "/c.md"]);
    expect(act?.path).toBe("/c.md");
  });
});

describe("salvar o colado", () => {
  it("vira a aba do arquivo: caminho, nome e histórico", () => {
    const { tabs } = setup("/a.md", "clip:1");
    const t = tabs[1];
    expect(adoptSaved(tabs, t, "clip:1", "/d/Sem título.md", "Sem título.md")).toBeNull();
    expect(t.path).toBe("/d/Sem título.md");
    expect(t.name).toBe("Sem título.md");
    expect(t.hist).toEqual(["/d/Sem título.md"]);
    expect(paths(tabs)).toEqual(["/a.md", "/d/Sem título.md"]);
  });

  it("salvou por cima de um arquivo aberto em outra aba: devolve essa, e a colada fica como estava", () => {
    const { tabs } = setup("/a.md", "clip:1", "/b.md");
    const t = tabs[1];
    expect(adoptSaved(tabs, t, "clip:1", "/b.md", "b.md")).toBe(tabs[2]);
    expect(t.path).toBe("clip:1");
    expect(t.hist).toEqual(["clip:1"]);
  });

  it("nunca devolve a própria aba", () => {
    const { tabs } = setup("clip:1");
    expect(adoptSaved(tabs, tabs[0], "clip:1", "/x.md", "x.md")).toBeNull();
    expect(tabs[0].path).toBe("/x.md");
  });
});

describe("restaurar abas", () => {
  it("vão para o fim, sem repetir caminho já aberto (arquivo do SO chegou antes)", () => {
    const { tabs, make } = setup("/b.md");
    const act = restoreSaved(tabs, { paths: ["/a.md", "/b.md", "/c.md"], active: 2 }, make);
    expect(paths(tabs)).toEqual(["/b.md", "/a.md", "/c.md"]);
    expect(act).toBe(tabs[2]);
  });

  it("índice fora da lista (ou -1): a primeira", () => {
    const a = setup();
    expect(restoreSaved(a.tabs, { paths: ["/a.md", "/b.md"], active: -1 }, a.make)?.path).toBe("/a.md");
    const b = setup();
    expect(restoreSaved(b.tabs, { paths: ["/a.md"], active: 5 }, b.make)?.path).toBe("/a.md");
  });

  it("nada salvo: nenhuma", () => {
    const { tabs, make } = setup();
    expect(restoreSaved(tabs, { paths: [], active: 0 }, make)).toBeNull();
  });
});

describe("savedTabs (prefs) lê pelo mesmo parser", () => {
  beforeEach(() => localStorage.clear());

  it("o que serializeTabs grava, savedTabs devolve", () => {
    const { tabs } = setup("/a.md", "sample:pt-BR", "/b.md");
    localStorage.setItem(TABS_KEY, serializeTabs(tabs, tabs[2]));
    expect(savedTabs()).toEqual({ paths: ["/a.md", "/b.md"], active: 1 });
  });

  it("com Reabrir abas desligado, nenhuma", () => {
    localStorage.setItem(TABS_KEY, '{"paths":["/a.md"],"active":0}');
    localStorage.setItem(PREF_KEYS.restoreTabs, "0");
    expect(savedTabs()).toEqual({ paths: [], active: 0 });
  });
});
