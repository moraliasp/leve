import { describe, expect, it } from "vitest";
import main from "../src/main.ts?raw";
import { showInOpenDialogs, showUpdateStatus, updateSource } from "../src/updater";

describe("updateSource", () => {
  it("no app instalado normalmente, o próprio app atualiza", () => {
    expect(updateSource(true, false)).toBe("app");
  });

  it("no Flatpak, quem atualiza é o Flatpak, nunca o atualizador do app", () => {
    expect(updateSource(true, true)).toBe("flatpak");
  });

  it("no modo navegador não há atualização", () => {
    expect(updateSource(false, false)).toBe("none");
    expect(updateSource(false, true)).toBe("none");
  });
});

describe("showUpdateStatus", () => {
  it("escreve em toda linha de recado, marca erro e esconde a vazia", () => {
    const root = document.createElement("div");
    root.innerHTML = '<dialog><p data-update-status hidden></p></dialog><dialog><p data-update-status hidden></p></dialog>';
    const [a, b] = root.querySelectorAll<HTMLElement>("[data-update-status]");
    showUpdateStatus(root, "Leve está atualizado (0.6.0)");
    expect(a.textContent).toBe("Leve está atualizado (0.6.0)");
    expect(b.hidden).toBe(false);
    showUpdateStatus(root, "falhou", true);
    expect(a.classList.contains("error")).toBe(true);
    showUpdateStatus(a.parentElement as HTMLElement, "");
    expect(a.hidden).toBe(true);
    expect(a.classList.contains("error")).toBe(false);
    expect(b.textContent).toBe("falhou");
  });
});

describe("showInOpenDialogs", () => {
  it("só o diálogo aberto recebe: no fechado o recado esperaria, já velho, a próxima abertura", () => {
    const root = document.createElement("div");
    root.innerHTML = '<dialog id="a" open><p data-update-status hidden></p></dialog><dialog id="b"><p data-update-status hidden></p></dialog>';
    showInOpenDialogs(root, "Leve está atualizado");
    expect(root.querySelector("#a p")?.textContent).toBe("Leve está atualizado");
    expect(root.querySelector("#b p")?.textContent).toBe("");
    expect(root.querySelector<HTMLElement>("#b p")?.hidden).toBe(true);
  });

  it("main.ts: todo recado passa pelos diálogos e fechar limpa o próprio", () => {
    expect(main).toMatch(/const updateUi: UpdateUi = \{ flash: updateNotice,/);
    expect(main).toMatch(/function updateNotice[\s\S]{0,200}showInOpenDialogs\(document, msg, isError\)/);
    expect(main).toMatch(/updateNotice\(t\("update\.browser"\), true\)/);
    expect(main).toMatch(/updateNotice\(t\("update\.flatpak"\)\)/);
    expect(main).toMatch(/\["about", "prefs"\][\s\S]{0,120}"close"[\s\S]{0,80}showUpdateStatus\(/);
  });
});
