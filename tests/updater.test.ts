import { describe, expect, it } from "vitest";
import { updateSource } from "../src/updater";

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
