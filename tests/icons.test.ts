import { describe, expect, it } from "vitest";
import { icon, iconMask, installIcons } from "../src/icons";

describe("icons (Lucide)", () => {
  it("normaliza o SVG: sem comentário de licença nem classe, tamanho, traço e aria-hidden", () => {
    const s = icon("copy", 14);
    expect(s.startsWith('<svg aria-hidden="true" focusable="false"')).toBe(true);
    expect(s).toContain('width="14"');
    expect(s).toContain('height="14"');
    expect(s).toContain('stroke-width="1.75"');
    expect(s).toContain('stroke="currentColor"');
    expect(s).not.toMatch(/<!--|class=|\n/);
  });
  it("máscara CSS é um data URI do mesmo SVG", () => {
    expect(iconMask("info")).toMatch(/^url\("data:image\/svg\+xml,%3Csvg%20aria-hidden/);
  });
  it("installIcons troca [data-icon] pelo SVG e publica as variáveis de máscara", () => {
    document.body.innerHTML = '<button><span data-icon="x"></span></button>';
    installIcons();
    expect(document.querySelector("button")?.innerHTML).toMatch(/^<svg aria-hidden="true"/);
    expect(document.querySelector("[data-icon]")).toBeNull();
    expect(document.documentElement.style.getPropertyValue("--icon-note")).toMatch(/^url\("data:/);
  });
});
