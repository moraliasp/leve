import { beforeEach, describe, expect, it } from "vitest";
import { FOLDER_KEY, PREF_KEYS, TABS_KEY, TIP_KEY, TOP, boolPref, isOn, migrateLegacyKeys, migrateVerbatimPaths, resetPrefs, savedAnchor, savedTabs, setBoolPref, setOn } from "../src/prefs";
import { RECENT_KEY, SCROLL_KEY } from "../src/recent";

describe("preferências", () => {
  beforeEach(() => localStorage.clear());

  it("liga/desliga: ausente ou lixo vale o padrão, '1'/'0' decidem", () => {
    expect(boolPref("x", true)).toBe(true);
    expect(boolPref("x", false)).toBe(false);
    localStorage.setItem("x", "sim");
    expect(boolPref("x", false)).toBe(false);
    setBoolPref("x", false);
    expect(boolPref("x", true)).toBe(false);
    setBoolPref("x", true);
    expect(boolPref("x", false)).toBe(true);
  });

  it("as chaves do menu e da tela são as mesmas (uma fonte por preferência)", () => {
    expect(PREF_KEYS.remote).toBe("leve.remote");
    expect(PREF_KEYS.toc).toBe("leve.toc");
    expect(PREF_KEYS.theme).toBe("leve.theme");
  });

  describe("restaurar posição de leitura (leve.restoreScroll)", () => {
    const store = { "/a.md": { top: 300, index: 4, offset: 12 }, "/velho.md": 80 };
    beforeEach(() => localStorage.setItem(SCROLL_KEY, JSON.stringify(store)));

    it("ligada por padrão: devolve a âncora guardada, inclusive o formato antigo em pixel", () => {
      expect(savedAnchor("/a.md")).toEqual(store["/a.md"]);
      expect(savedAnchor("/velho.md")).toEqual({ top: 80, index: 0, offset: 0 });
      expect(savedAnchor("/nunca.md")).toEqual(TOP);
    });

    it("desligada: sempre o topo, sem apagar o que está guardado", () => {
      setBoolPref(PREF_KEYS.restoreScroll, false);
      expect(savedAnchor("/a.md")).toEqual(TOP);
      expect(JSON.parse(localStorage.getItem(SCROLL_KEY)!)).toEqual(store);
      setBoolPref(PREF_KEYS.restoreScroll, true);
      expect(savedAnchor("/a.md")).toEqual(store["/a.md"]);
    });
  });

  describe("reabrir abas ao iniciar (leve.restoreTabs)", () => {
    beforeEach(() => localStorage.setItem(TABS_KEY, JSON.stringify({ paths: ["/a.md", 7, "/b.md"], active: 1 })));

    it("ligada por padrão: devolve as abas salvas, só as que são caminho", () => {
      expect(savedTabs()).toEqual({ paths: ["/a.md", "/b.md"], active: 1 });
    });

    it("desligada: nenhuma aba, e a lista salva fica intacta", () => {
      setBoolPref(PREF_KEYS.restoreTabs, false);
      expect(savedTabs()).toEqual({ paths: [], active: 0 });
      expect(localStorage.getItem(TABS_KEY)).toContain("/a.md");
    });

    it("lista corrompida vira vazia", () => {
      localStorage.setItem(TABS_KEY, "{nope");
      expect(savedTabs()).toEqual({ paths: [], active: 0 });
    });
  });

  it("restaurar padrões apaga só as preferências; recentes, posições e abas ficam", () => {
    for (const k of Object.values(PREF_KEYS)) localStorage.setItem(k, "x");
    localStorage.setItem(RECENT_KEY, '["/a.md"]');
    localStorage.setItem(SCROLL_KEY, "{}");
    localStorage.setItem(TABS_KEY, "{}");
    localStorage.setItem(TIP_KEY, "1");
    resetPrefs();
    for (const k of Object.values(PREF_KEYS)) expect(localStorage.getItem(k), k).toBeNull();
    expect(localStorage.getItem(RECENT_KEY)).toBe('["/a.md"]');
    expect(localStorage.getItem(SCROLL_KEY)).toBe("{}");
    expect(localStorage.getItem(TABS_KEY)).toBe("{}");
    expect(localStorage.getItem(TIP_KEY)).toBe("1");
  });

  describe("migração das chaves mdview.* (até a 0.2.0)", () => {
    it("renomeia para leve.* preservando o valor e apaga a antiga", () => {
      localStorage.setItem("mdview.theme", "dark");
      localStorage.setItem("mdview.lang", "en");
      localStorage.setItem("mdview.recent", '["/a.md"]');
      localStorage.setItem("mdview.tip", "1");
      migrateLegacyKeys();
      expect(localStorage.getItem(PREF_KEYS.theme)).toBe("dark");
      expect(localStorage.getItem(PREF_KEYS.lang)).toBe("en");
      expect(localStorage.getItem(RECENT_KEY)).toBe('["/a.md"]');
      expect(localStorage.getItem(TIP_KEY)).toBe("1");
      expect(localStorage.getItem("mdview.theme")).toBeNull();
      expect(localStorage.getItem("mdview.lang")).toBeNull();
    });

    it("chave nova já gravada vence a antiga; chave de outro prefixo não é tocada", () => {
      localStorage.setItem(PREF_KEYS.zoom, "1.2");
      localStorage.setItem("mdview.zoom", "0.8");
      localStorage.setItem("outro.x", "1");
      migrateLegacyKeys();
      expect(localStorage.getItem(PREF_KEYS.zoom)).toBe("1.2");
      expect(localStorage.getItem("mdview.zoom")).toBeNull();
      expect(localStorage.getItem("outro.x")).toBe("1");
    });
  });
});

describe("caminhos com \\\\?\\ salvos até a 0.6.0", () => {
  beforeEach(() => localStorage.clear());

  it("saem dos Recentes, das abas, da pasta e dos pontos de leitura", () => {
    const disk = String.raw`\\?\C:\docs\a.md`;
    const unc = String.raw`\\?\UNC\srv\share\b.md`;
    localStorage.setItem(RECENT_KEY, JSON.stringify([disk, unc, "/c.md", String.raw`\\?\Volume{1}\d.md`]));
    localStorage.setItem(TABS_KEY, JSON.stringify({ paths: [disk], active: 0 }));
    localStorage.setItem(FOLDER_KEY, JSON.stringify({ root: "\\\\?\\C:\\docs\\", expanded: ["sub"] }));
    localStorage.setItem(SCROLL_KEY, JSON.stringify({ [unc]: { i: 1 } }));
    migrateVerbatimPaths();
    expect(JSON.parse(localStorage.getItem(RECENT_KEY) ?? "")).toEqual([
      String.raw`C:\docs\a.md`,
      String.raw`\\srv\share\b.md`,
      "/c.md",
      String.raw`\\?\Volume{1}\d.md`,
    ]);
    expect(JSON.parse(localStorage.getItem(TABS_KEY) ?? "").paths).toEqual([String.raw`C:\docs\a.md`]);
    expect(JSON.parse(localStorage.getItem(FOLDER_KEY) ?? "").root).toBe("C:\\docs\\");
    expect(Object.keys(JSON.parse(localStorage.getItem(SCROLL_KEY) ?? ""))).toEqual([String.raw`\\srv\share\b.md`]);
  });

  it("sem prefixo, nada muda", () => {
    // Nome de arquivo de verdade no Unix: o prefixo só vale no começo do caminho.
    const raw = JSON.stringify(["/a?.md", String.raw`C:\a.md`, String.raw`/home/u/\\?\C:\x.md`]);
    localStorage.setItem(RECENT_KEY, raw);
    migrateVerbatimPaths();
    expect(localStorage.getItem(RECENT_KEY)).toBe(raw);
  });
});

describe("preferências de liga/desliga", () => {
  beforeEach(() => localStorage.clear());

  it("cada uma tem o seu padrão", () => {
    for (const on of ["toc", "restoreScroll", "restoreTabs", "sample"] as const) expect(isOn(on)).toBe(true);
    for (const off of ["remote", "showHidden", "autoUpdate", "exportMdLinks"] as const) expect(isOn(off)).toBe(false);
  });

  it("grava na chave da preferência e vence o padrão", () => {
    setOn("toc", false);
    expect(localStorage.getItem(PREF_KEYS.toc)).toBe("0");
    expect(isOn("toc")).toBe(false);
    setOn("remote", true);
    expect(localStorage.getItem(PREF_KEYS.remote)).toBe("1");
    expect(isOn("remote")).toBe(true);
  });

  it("Restaurar padrões devolve o padrão", () => {
    setOn("sample", false);
    setOn("showHidden", true);
    resetPrefs();
    expect(isOn("sample")).toBe(true);
    expect(isOn("showHidden")).toBe(false);
  });
});
