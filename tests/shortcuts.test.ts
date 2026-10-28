import { describe, expect, it } from "vitest";
import html from "../index.html?raw";
import main from "../src/main.ts?raw";
import lib from "../src-tauri/src/lib.rs?raw";
import { SHORTCUTS, applyTooltips, detectPlatform, formatKeys, keysFor, shortcutRows, tooltip } from "../src/shortcuts";
import { applyI18n } from "../src/i18n";

describe("atalhos por plataforma", () => {
  it("detecta mac, windows e linux por userAgentData, platform e UA", () => {
    expect(detectPlatform({ platform: "MacIntel" })).toBe("mac");
    expect(detectPlatform({ platform: "Win32" })).toBe("windows");
    expect(detectPlatform({ userAgentData: { platform: "Windows" }, platform: "" })).toBe("windows");
    // A fonte mais específica vence: userAgentData antes de platform, platform antes do UA.
    expect(detectPlatform({ userAgentData: { platform: "Android" }, platform: "MacIntel" })).toBe("linux");
    expect(detectPlatform({ platform: "MacIntel", userAgent: "Windows NT" })).toBe("mac");
    expect(detectPlatform({ platform: "Linux x86_64" })).toBe("linux");
    expect(detectPlatform({ platform: "", userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" })).toBe("windows");
    expect(detectPlatform({})).toBe("linux");
  });

  it("formata Mod/Shift/Alt como símbolos no mac e por extenso no Windows", () => {
    expect(formatKeys("Mod+Shift+L", "mac")).toBe("⌘⇧L");
    expect(formatKeys("Mod+Shift+L", "windows")).toBe("Ctrl+Shift+L");
    expect(formatKeys("Mod+Alt+K", "linux")).toBe("Ctrl+Alt+K");
    expect(formatKeys("Mod+=  Mod+-  Mod+0", "windows")).toBe("Ctrl+=  Ctrl+-  Ctrl+0");
    expect(formatKeys("Shift+Enter", "mac")).toBe("⇧↩");
    expect(formatKeys("Shift+Enter", "windows")).toBe("Shift+Enter");
    // Esc fica por extenso também no mac (⎋ é pouco conhecido).
    expect(formatKeys("Esc", "mac")).toBe("Esc");
    expect(detectPlatform({ platform: "", userAgent: "Darwin" })).toBe("linux");
  });

  it("tooltips vêm do mesmo mapa da tela de atalhos", () => {
    expect(tooltip("Sumário", "toggle-toc", "mac")).toBe("Sumário (⌘B)");
    expect(tooltip("Sumário", "toggle-toc", "windows")).toBe("Sumário (Ctrl+B)");
    expect(tooltip("Fechar aba", "close-tab", "windows")).toBe("Fechar aba (Ctrl+W)");
    expect(tooltip("Entendi", "nao-existe", "windows")).toBe("Entendi");
    expect(keysFor("find-prev", "windows")).toBe("Shift+Enter");
    const rows = shortcutRows("windows");
    expect(rows.find(([w]) => w === "Sumário")?.[1]).toBe(keysFor("toggle-toc", "windows"));
    expect(rows.find(([w]) => w === "Mostrar no Explorer")).toBeDefined();
    expect(shortcutRows("linux").find(([w]) => w === "Mostrar na pasta")).toBeDefined();
    expect(shortcutRows("mac").find(([w]) => w === "Mostrar no Finder")).toBeDefined();
    expect(rows.some(([, k]) => k.includes("⌘"))).toBe(false);
  });

  it("applyTooltips preenche [data-shortcut] e pode ser reaplicado sem duplicar", () => {
    const d = document.createElement("div");
    d.innerHTML = '<button data-shortcut="open" title="Abrir">x</button><button title="Sem">y</button>';
    applyTooltips(d, "windows");
    expect(d.querySelector("button")!.title).toBe("Abrir (Ctrl+O)");
    applyTooltips(d, "mac");
    expect(d.querySelector("button")!.title).toBe("Abrir (⌘O)");
    expect(d.querySelectorAll("button")[1].title).toBe("Sem");
  });

  it("index.html: todo botão com atalho tem data-shortcut no mapa e sai com Ctrl no Windows", () => {
    // Nenhum ⌘/⇧ fixo no HTML: o rótulo nasce do mapa.
    expect(html).not.toMatch(/[⌘⇧⌥]/);
    const d = document.createElement("div");
    d.innerHTML = html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>"));
    applyI18n(d);
    const withShortcut = d.querySelectorAll<HTMLElement>("[data-shortcut]");
    expect(withShortcut.length).toBe(12);
    for (const el of withShortcut) expect(keysFor(el.dataset.shortcut ?? "", "windows"), el.outerHTML).not.toBe("");
    applyTooltips(d, detectPlatform({ userAgentData: { platform: "Windows" }, platform: "Win32" }));
    const titles = Array.from(withShortcut).map((el) => el.title);
    expect(titles).toEqual([
      "Sumário (Ctrl+B)",
      "Voltar (Ctrl+[)",
      "Avançar (Ctrl+])",
      "Tema (Ctrl+Shift+L)",
      "Abrir (Ctrl+O)",
      "Anterior (Shift+Enter)",
      "Próximo (Enter)",
      "Fechar (Esc)",
      "Atalhos (Ctrl+/)",
      "Diminuir (Ctrl+-)",
      "Aumentar (Ctrl+=)",
      "Tamanho padrão (Ctrl+0)",
    ]);
    applyTooltips(d, detectPlatform({ platform: "MacIntel" }));
    expect(Array.from(withShortcut).map((el) => el.title)).toEqual([
      "Sumário (⌘B)",
      "Voltar (⌘[)",
      "Avançar (⌘])",
      "Tema (⌘⇧L)",
      "Abrir (⌘O)",
      "Anterior (⇧↩)",
      "Próximo (↩)",
      "Fechar (Esc)",
      "Atalhos (⌘/)",
      "Diminuir (⌘-)",
      "Aumentar (⌘=)",
      "Tamanho padrão (⌘0)",
    ]);
  });

  it("menu nativo: nenhum atalho repetido e todo atalho do menu está no mapa (Mod+E = Abrir no editor)", () => {
    const accels = [...lib.matchAll(/Some\("CmdOrCtrl\+([^"]+)"\)/g)].map((m) => `Mod+${m[1]}`);
    expect(new Set(accels).size).toBe(accels.length);
    const mapped = SHORTCUTS.flatMap((s) => s.keys.split("  "));
    for (const a of accels) expect(mapped, a).toContain(a);
    expect(lib).toMatch(/item\("open-in-editor", s\.open_in_editor, Some\("CmdOrCtrl\+E"\)\)/);
    expect(keysFor("open-in-editor", "windows")).toBe("Ctrl+E");
    expect(main).toMatch(/"open-in-editor": \(\) =>/);
  });

  it("main.ts aplica os tooltips no início e usa o mapa para a aba", () => {
    expect(main).toMatch(/applyTooltips\(\$\("app"\), PLATFORM\)/);
    expect(main).toMatch(/tooltip\(tr\("tab.close"\), "close-tab", PLATFORM\)/);
    expect(main).not.toMatch(/[⌘⇧]\w*[)"]/);
  });
});
