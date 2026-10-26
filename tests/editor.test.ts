import { beforeEach, describe, expect, it } from "vitest";
import rust from "../src-tauri/src/editor.rs?raw";
import { EDITOR_IDS, type EditorInfo, editablePath, editorOptions, editorPref, isEditorId, setEditorPref } from "../src/editor";
import { PREF_KEYS, resetPrefs } from "../src/prefs";

const info = (id: EditorInfo["id"], available: boolean): EditorInfo => ({ id, name: id.toUpperCase(), available, selfDefault: false });

describe("abrir no editor", () => {
  beforeEach(() => localStorage.clear());

  it("a lista fechada é a mesma do Rust (editor::Editor::id)", () => {
    const ids = [...rust.matchAll(/Editor::\w+ => "([a-z]+)",/g)].map((m) => m[1]);
    expect(ids).toEqual([...EDITOR_IDS]);
  });

  it("preferência: só ids da lista; ausente ou lixo é o aplicativo padrão; restaurar padrões limpa", () => {
    expect(editorPref()).toBe("system");
    setEditorPref("zed");
    expect(localStorage.getItem(PREF_KEYS.editor)).toBe("zed");
    expect(editorPref()).toBe("zed");
    localStorage.setItem(PREF_KEYS.editor, "/usr/bin/vim --cmd");
    expect(editorPref()).toBe("system");
    for (const bad of ["", "VSCODE", "code", null, 1]) expect(isEditorId(bad)).toBe(false);
    setEditorPref("cursor");
    resetPrefs();
    expect(editorPref()).toBe("system");
  });

  it("seletor mostra o instalado e mantém o escolhido mesmo se sumiu", () => {
    const list = [info("system", true), info("vscode", true), info("zed", false), info("sublime", false)];
    expect(editorOptions(list, "vscode").map((o) => o.id)).toEqual(["system", "vscode"]);
    expect(editorOptions(list, "zed")).toEqual([
      { id: "system", name: "SYSTEM", missing: false },
      { id: "vscode", name: "VSCODE", missing: false },
      { id: "zed", name: "ZED", missing: true },
    ]);
  });

  it("o exemplo em memória nunca vai para o editor", () => {
    expect(editablePath("sample:pt-BR")).toBeNull();
    expect(editablePath(null)).toBeNull();
    expect(editablePath("/docs/a.md")).toBe("/docs/a.md");
  });
});
