import { beforeEach, describe, expect, it, vi } from "vitest";
import lib from "../src-tauri/src/lib.rs?raw";
import caps from "../src-tauri/capabilities/default.json?raw";
import cargo from "../src-tauri/Cargo.toml?raw";
import html from "../index.html?raw";
import { CLIP_SCHEME, addClip, clipName, clipText, dropClip, inMemory, isClip } from "../src/clip";
import { editablePath } from "../src/editor";
import { keysFor, shortcutRows } from "../src/shortcuts";
import { type Tab, insertTab, tabFactory } from "../src/tabs";

// Mock à mão, não `vi.fn`: o Vitest reprova o teste quando a promessa de um `vi.fn` rejeita.
const calls: unknown[][] = [];
let reply: () => Promise<unknown> = async () => null;
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => {
    calls.push(args);
    return reply();
  },
}));
const { openClipboard, pastedText, saveClip } = await import("../src/clip-ui");
type Host = Parameters<typeof openClipboard>[0];

describe("documento colado em memória (src/clip.ts)", () => {
  it("caminho sintético clip:<n>, sem repetir, e que nunca parece arquivo", () => {
    const a = addClip("# A");
    const b = addClip("# B");
    expect(a.startsWith(CLIP_SCHEME)).toBe(true);
    expect(a).not.toBe(b);
    expect(isClip(a)).toBe(true);
    expect(isClip("/docs/clip:1.md")).toBe(false);
    expect(isClip("C:\\clip.md")).toBe(false);
    expect(clipText(a)).toBe("# A");
    dropClip(a);
    expect(clipText(a)).toBeUndefined();
    expect(clipText(b)).toBe("# B");
  });

  it("exemplo e colado são em memória; arquivo não", () => {
    expect(inMemory("clip:3")).toBe(true);
    expect(inMemory("sample:en")).toBe(true);
    expect(inMemory("/a.md")).toBe(false);
    expect(editablePath("clip:3")).toBeNull();
    expect(editablePath("/a.md")).toBe("/a.md");
  });

  it("abas coladas lado a lado ganham número a partir da segunda", () => {
    expect(clipName("clip:1", "Sem título")).toBe("Sem título");
    expect(clipName("clip:2", "Sem título")).toBe("Sem título 2");
    expect(clipName("clip:x", "Untitled")).toBe("Untitled");
  });

  it("clipboard vazio, só espaço ou ausente não vira documento", () => {
    expect(pastedText(null)).toBeNull();
    expect(pastedText(undefined)).toBeNull();
    expect(pastedText("")).toBeNull();
    expect(pastedText(" \n\t")).toBeNull();
    expect(pastedText("# Oi\n")).toBe("# Oi\n");
  });
});

/** Anfitrião de mentira: lista de abas real (src/tabs.ts) e efeitos gravados. */
function host(paths: string[], activeIdx: number, tauri = true) {
  const make = tabFactory();
  const tabs: Tab[] = [];
  for (const p of paths) insertTab(tabs, make(p, p), null, false);
  let active: Tab | null = tabs[activeIdx] ?? null;
  const log: string[] = [];
  const h: Host = {
    tauri,
    flash: (m, err) => log.push(`${err ? "erro" : "aviso"}: ${m}`),
    tabs: () => tabs,
    active: () => active,
    open: async (p) => log.push(`abre ${p}`),
    reopen: async (p) => log.push(`relê ${p}`),
    activate: async (t) => {
      active = t;
      log.push(`foca ${t.path}`);
    },
    close: async (t) => {
      tabs.splice(tabs.indexOf(t), 1);
      log.push(`fecha ${t.path}`);
    },
    renderTabs: () => log.push("abas"),
  };
  return { h, tabs, log };
}

describe("abrir da área de transferência", () => {
  beforeEach(() => {
    calls.length = 0;
    reply = async () => null;
  });

  it("lê pelo Rust e abre o texto numa aba nova", async () => {
    reply = async () => "| a |\n|---|\n| 1 |\n";
    const { h, log } = host([], -1);
    await openClipboard(h);
    expect(calls).toEqual([["read_clipboard"]]);
    const path = log[0].replace("abre ", "");
    expect(isClip(path)).toBe(true);
    expect(clipText(path)).toBe("| a |\n|---|\n| 1 |\n");
  });

  it("vazio ou não-texto (o Rust devolve null): aviso curto, nenhuma aba", async () => {
    reply = async () => null;
    const { h, log } = host([], -1);
    await openClipboard(h);
    expect(log).toEqual(["aviso: A área de transferência não tem texto"]);
  });

  it("erro do Rust (grande demais) aparece como erro", async () => {
    // O invoke de verdade rejeita com o texto do Rust, não com Error.
    reply = () => Promise.reject("Arquivo grande demais para abrir (21 MB; o limite é 20 MB).");
    const { h, log } = host([], -1);
    await openClipboard(h);
    expect(log).toEqual(["erro: Arquivo grande demais para abrir (21 MB; o limite é 20 MB)."]);
  });
});

describe("salvar o colado", () => {
  beforeEach(() => {
    calls.length = 0;
    reply = async () => null;
  });

  it("só com o colado ativo: arquivo ativo não abre diálogo", async () => {
    const { h, log } = host(["/a.md"], 0);
    await saveClip(h);
    expect(calls).toEqual([]);
    expect(log).toEqual([]);
  });

  it("manda só o texto (nunca destino); cancelar não muda nada", async () => {
    const path = addClip("# x");
    reply = async () => null;
    const { h, tabs, log } = host([path], 0);
    await saveClip(h);
    expect(calls).toEqual([["save_markdown", { text: "# x" }]]);
    expect(tabs[0].path).toBe(path);
    expect(clipText(path)).toBe("# x");
    expect(log).toEqual([]);
  });

  it("salvo: a aba vira o arquivo, relê do disco e descarta o texto", async () => {
    const path = addClip("# x");
    reply = async () => "/Users/eu/Documents/Sem título.md";
    const { h, tabs, log } = host(["/a.md", path], 1);
    await saveClip(h);
    expect(tabs[1].path).toBe("/Users/eu/Documents/Sem título.md");
    expect(tabs[1].name).toBe("Sem título.md");
    expect(clipText(path)).toBeUndefined();
    expect(log).toEqual(["relê /Users/eu/Documents/Sem título.md", "aviso: Salvo: Sem título.md"]);
  });

  it("salvou por cima de arquivo aberto em outra aba: foca essa e fecha a colada", async () => {
    const path = addClip("# x");
    reply = async () => "/b.md";
    const { h, tabs, log } = host(["/b.md", path], 1);
    await saveClip(h);
    expect(log).toEqual(["foca /b.md", `fecha ${path}`, "aviso: Salvo: b.md"]);
    expect(tabs.map((t) => t.path)).toEqual(["/b.md"]);
  });

  it("segundo pedido com o diálogo aberto é ignorado", async () => {
    const path = addClip("# x");
    let done: (v: string | null) => void = () => {};
    reply = () => new Promise((r) => (done = r));
    const { h } = host([path], 0);
    const first = saveClip(h);
    await saveClip(h);
    expect(calls).toHaveLength(1);
    done(null);
    await first;
  });

  it("no navegador: aviso, sem invoke", async () => {
    const path = addClip("# x");
    const { h, log } = host([path], 0, false);
    await saveClip(h);
    expect(calls).toEqual([]);
    expect(log).toEqual(["erro: Salvar só no app"]);
  });
});

describe("menu, permissões e estado vazio", () => {
  it("Arquivo › Abrir da área de transferência (Mod+Shift+V) e Salvar… (Mod+S), no menu e no mapa", () => {
    expect(lib).toMatch(/item\(\s*"open-clipboard",\s*s\.open_clipboard,\s*Some\("CmdOrCtrl\+Shift\+V"\),?\s*\)/);
    expect(lib).toMatch(/MenuItemBuilder::with_id\("save", s\.save\)\s*\.accelerator\("CmdOrCtrl\+S"\)\s*\.enabled\(false\)/);
    expect(keysFor("open-clipboard", "windows")).toBe("Ctrl+Shift+V");
    expect(keysFor("save", "mac")).toBe("⌘S");
    expect(shortcutRows("mac").find(([w]) => w === "Abrir da área de transferência")?.[1]).toBe("⌘⇧V");
  });

  it("o frontend não tem como ler o clipboard: só o comando do Rust lê", () => {
    expect(caps).not.toMatch(/clipboard/);
    // Sem o plugin: nenhum comando de clipboard registrado para o WebView.
    expect(cargo).not.toMatch(/^tauri-plugin-clipboard-manager/m);
    expect(lib).not.toMatch(/clipboard_manager/);
    expect(cargo).toMatch(/^arboard = \{ version = "3", default-features = false \}/m);
    expect(lib).toMatch(/fn read_clipboard\(/);
  });

  it("o estado vazio menciona o atalho, pelo mapa (sem ⌘ escrito)", () => {
    expect(html).toMatch(/id="empty-clip"/);
    expect(html).toMatch(/<kbd id="empty-clip-keys"><\/kbd>/);
  });
});
