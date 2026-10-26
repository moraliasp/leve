import { describe, expect, it } from "vitest";
import lib from "../src-tauri/src/lib.rs?raw";
import caps from "../src-tauri/capabilities/default.json?raw";
import html from "../index.html?raw";
import { hydrateImages } from "../src/render";
import { keysFor, shortcutRows } from "../src/shortcuts";
import { clipboardDoc, isUntitled, persistableTabs, replaceInHistory, untitledId, untitledName } from "../src/untitled";

describe("documento não salvo (área de transferência)", () => {
  it("id sintético nunca parece caminho de arquivo", () => {
    expect(untitledId(3)).toBe("untitled:3");
    expect(isUntitled("untitled:3")).toBe(true);
    expect(isUntitled("/docs/untitled:3.md")).toBe(false);
    expect(isUntitled("C:\\untitled.md")).toBe(false);
    expect(isUntitled(null)).toBe(false);
    expect(isUntitled(undefined)).toBe(false);
  });

  it("abas não salvas lado a lado ganham número a partir da segunda", () => {
    expect(untitledName("untitled:1", "Sem título")).toBe("Sem título");
    expect(untitledName("untitled:2", "Sem título")).toBe("Sem título 2");
    expect(untitledName("untitled:x", "Untitled")).toBe("Untitled");
  });

  it("clipboard vazio, só espaço ou não-texto não vira documento", () => {
    expect(clipboardDoc(null)).toBeNull();
    expect(clipboardDoc(undefined)).toBeNull();
    expect(clipboardDoc("")).toBeNull();
    expect(clipboardDoc(" \n\t")).toBeNull();
    expect(clipboardDoc("# Oi\n")).toBe("# Oi\n");
  });

  it("aba não salva não é persistida e o índice da ativa acompanha", () => {
    expect(persistableTabs(["/a.md", "untitled:1", "/b.md"], 2)).toEqual({ paths: ["/a.md", "/b.md"], active: 1 });
    expect(persistableTabs(["/a.md", "untitled:1"], 1)).toEqual({ paths: ["/a.md"], active: -1 });
    expect(persistableTabs(["untitled:1"], 0)).toEqual({ paths: [], active: -1 });
    expect(persistableTabs([], -1)).toEqual({ paths: [], active: -1 });
  });

  it("salvar troca o id pelo caminho no histórico da aba", () => {
    expect(replaceInHistory(["untitled:1", "/x.md", "untitled:1"], "untitled:1", "/d/Sem título.md")).toEqual([
      "/d/Sem título.md",
      "/x.md",
      "/d/Sem título.md",
    ]);
  });

  it("imagem relativa sem pasta vira aviso, sem carregar nada", async () => {
    const d = document.createElement("div");
    d.innerHTML = '<img src="foto.png" alt="Foto"><img src="https://x.test/a.png">';
    await hydrateImages(d, null, false);
    expect(d.querySelector(".img-missing code")?.textContent).toBe("foto.png");
    expect(d.querySelectorAll("img")).toHaveLength(1);
  });

  it("atalhos no menu nativo e no mapa, sem permissão de clipboard no frontend", () => {
    expect(lib).toMatch(/item\(\s*"open-clipboard",\s*s\.open_clipboard,\s*Some\("CmdOrCtrl\+Shift\+V"\),?\s*\)/);
    expect(lib).toMatch(/item\("save", s\.save, Some\("CmdOrCtrl\+S"\)\)/);
    expect(keysFor("open-clipboard", "windows")).toBe("Ctrl+Shift+V");
    expect(keysFor("save", "mac")).toBe("⌘S");
    expect(shortcutRows("mac").find(([w]) => w === "Abrir da área de transferência")?.[1]).toBe("⌘⇧V");
    expect(caps).not.toMatch(/clipboard/);
    // Estado vazio menciona o atalho pelo mapa, nunca com ⌘ escrito.
    expect(html).toMatch(/id="empty-clipboard"/);
    expect(html).toMatch(/id="empty-clipboard-keys"/);
  });
});
