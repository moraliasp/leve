import { describe, expect, it } from "vitest";
import { buildLatest } from "../scripts/latest-json.mjs";

const files = [
  "Leve_0.2.0_universal.dmg",
  "Leve_0.2.0_universal.app.tar.gz",
  "Leve_0.2.0_universal.app.tar.gz.sig",
  "Leve_0.2.0_x64-setup.exe",
  "Leve_0.2.0_x64-setup.exe.sig",
  "Leve_0.2.0_x64_en-US.msi",
  "Leve_0.2.0_x64_en-US.msi.sig",
];
const sig = (f: string) => `assinatura de ${f}\n`;

describe("latest.json do atualizador", () => {
  it("aponta cada plataforma para o pacote da tag, com a assinatura dele", () => {
    const l = buildLatest({ tag: "v0.2.0", files, sig, date: new Date("2026-10-25T12:00:00Z") });
    expect(l.version).toBe("0.2.0");
    expect(l.pub_date).toBe("2026-10-25T12:00:00.000Z");
    const base = "https://github.com/moraliasp/leve/releases/download/v0.2.0/";
    expect(l.platforms["darwin-aarch64"]).toEqual({
      url: `${base}Leve_0.2.0_universal.app.tar.gz`,
      signature: "assinatura de Leve_0.2.0_universal.app.tar.gz",
    });
    expect(l.platforms["darwin-x86_64"]).toEqual(l.platforms["darwin-aarch64"]);
    expect(l.platforms["windows-x86_64"].url).toBe(`${base}Leve_0.2.0_x64-setup.exe`);
    expect(l.platforms["windows-x86_64-msi"].url).toBe(`${base}Leve_0.2.0_x64_en-US.msi`);
  });

  it("release candidate anuncia a versão que compilou, com URLs da tag rc", () => {
    const l = buildLatest({ tag: "v0.2.1-rc.1", files: files.map((f) => f.replace("0.2.0", "0.2.1")), sig });
    expect(l.version).toBe("0.2.1");
    expect(l.platforms["windows-x86_64"].url).toContain("/download/v0.2.1-rc.1/Leve_0.2.1_x64-setup.exe");
  });

  it("recusa pacote sem assinatura ou plataforma faltando", () => {
    expect(() => buildLatest({ tag: "v0.2.0", files: files.filter((f) => !f.endsWith("setup.exe.sig")), sig })).toThrow(/assinatura/);
    expect(() => buildLatest({ tag: "v0.2.0", files: files.filter((f) => !f.includes(".msi")), sig })).toThrow(/msi/);
  });
});
