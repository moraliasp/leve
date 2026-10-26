import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { buildPackaging, parseSums } from "../scripts/packaging.mjs";
import wVersion from "../packaging/winget/0.2.0/Moralia.Leve.yaml?raw";
import wInstaller from "../packaging/winget/0.2.0/Moralia.Leve.installer.yaml?raw";
import wEn from "../packaging/winget/0.2.0/Moralia.Leve.locale.en-US.yaml?raw";
import wPt from "../packaging/winget/0.2.0/Moralia.Leve.locale.pt-BR.yaml?raw";

const committed: Record<string, string> = {
  "packaging/winget/0.2.0/Moralia.Leve.yaml": wVersion,
  "packaging/winget/0.2.0/Moralia.Leve.installer.yaml": wInstaller,
  "packaging/winget/0.2.0/Moralia.Leve.locale.en-US.yaml": wEn,
  "packaging/winget/0.2.0/Moralia.Leve.locale.pt-BR.yaml": wPt,
};

// SHA256SUMS.txt da release v0.2.0, como o release.yml gravou.
const SUMS_020 = `ca614bc93c94102b10d8dfc162c854cb116464cb770903c797c7fecd6e5bbcac  Leve_0.2.0_universal.app.tar.gz
1e67bb9304b085af629cc1806cad143689cfb693913c2e01412a0738da6d065e  Leve_0.2.0_universal.app.tar.gz.sig
f3b9d08363e18522cb755a9ffed9f955541eea5e701ee0818d5cba49bcc7a4de  Leve_0.2.0_universal.dmg
f843be69f16f824d83737cec5857aebbf47dd2f4cc1b0b737727a14f5b1c3173  Leve_0.2.0_x64-setup.exe
d2ba8e2f7118cb4ad25c5181a013fa2446d5711e98ebf154b724738a3caa58ab  Leve_0.2.0_x64-setup.exe.sig
f7579be479263faf3d0daf62fdd00044f3f4f00d10b47decc2fd04f6dc0cd4a9  Leve_0.2.0_x64_en-US.msi
bfff88adf5753095c40a66da7eb99cd1307d278a82e103398a5d0fcabb824f27  Leve_0.2.0_x64_en-US.msi.sig
fbc1a13dbc350fa07d2d6e8eeb6a4030ee4daa2cfb6d7e569d563763f414ba69  latest.json
`;

const gen = (version = "0.2.0", sums = SUMS_020) =>
  buildPackaging({ version, sums: parseSums(sums), releaseDate: "2026-10-25" });

describe("pacotes winget e Homebrew", () => {
  it("lê o SHA256SUMS, inclusive o modo binário do sha256sum", () => {
    const s = parseSums(`${"A".repeat(64)} *Leve.dmg\r\n\n`);
    expect(s.get("Leve.dmg")).toBe("a".repeat(64));
    expect(() => parseSums("isto não é um hash  Leve.dmg")).toThrow(/linha inválida/);
  });

  // Os manifestos de uma versão não mudam depois de publicados; o cask acompanha a última versão,
  // então só ele fica de fora deste tripwire.
  it("os manifestos winget versionados de 0.2.0 são exatamente o que o gerador produz", () => {
    const files = Object.entries(gen()).filter(([rel]) => rel.startsWith("packaging/winget/"));
    expect(files).toHaveLength(4);
    for (const [rel, content] of files) expect(committed[rel], rel).toBe(content);
  });

  it("winget: NSIS por usuário com o hash do -setup.exe e as quatro extensões", () => {
    const files = gen();
    const dir = "packaging/winget/0.2.0";
    expect(Object.keys(files).filter((f) => f.startsWith(dir)).sort()).toEqual([
      `${dir}/Moralia.Leve.installer.yaml`,
      `${dir}/Moralia.Leve.locale.en-US.yaml`,
      `${dir}/Moralia.Leve.locale.pt-BR.yaml`,
      `${dir}/Moralia.Leve.yaml`,
    ]);
    const inst = parse(files[`${dir}/Moralia.Leve.installer.yaml`]);
    expect(inst).toMatchObject({
      PackageIdentifier: "Moralia.Leve",
      PackageVersion: "0.2.0",
      InstallerType: "nullsoft",
      Scope: "user",
      FileExtensions: ["md", "markdown", "mdown", "mkd"],
      ReleaseDate: "2026-10-25",
      ManifestType: "installer",
    });
    expect(inst.Installers).toEqual([
      {
        Architecture: "x64",
        InstallerUrl: "https://github.com/moraliasp/leve/releases/download/v0.2.0/Leve_0.2.0_x64-setup.exe",
        InstallerSha256: "F843BE69F16F824D83737CEC5857AEBBF47DD2F4CC1B0B737727A14F5B1C3173",
      },
    ]);
    const en = parse(files[`${dir}/Moralia.Leve.locale.en-US.yaml`]);
    expect(en).toMatchObject({ Publisher: "Moralia", License: "MIT", PackageLocale: "en-US", ManifestType: "defaultLocale" });
    expect(en.ReleaseNotesUrl).toBe("https://github.com/moraliasp/leve/releases/tag/v0.2.0");
    const pt = parse(files[`${dir}/Moralia.Leve.locale.pt-BR.yaml`]);
    expect(pt).toMatchObject({ PackageLocale: "pt-BR", ManifestType: "locale" });
    expect(parse(files[`${dir}/Moralia.Leve.yaml`])).toMatchObject({ DefaultLocale: "en-US", ManifestType: "version" });
  });

  it("cask: versão e sha256 do dmg universal; a URL usa #{version}", () => {
    const cask = gen()["packaging/homebrew/Casks/leve.rb"];
    expect(cask).toContain('version "0.2.0"');
    expect(cask).toContain('sha256 "f3b9d08363e18522cb755a9ffed9f955541eea5e701ee0818d5cba49bcc7a4de"');
    expect(cask).toContain("releases/download/v#{version}/Leve_#{version}_universal.dmg");
    expect(cask).toContain('"~/Library/Application Support/br.com.moralia.leve"');
  });

  it("versão nova muda a pasta do winget, as URLs e os hashes", () => {
    const sums = SUMS_020.split("0.2.0").join("0.3.1");
    const files = gen("0.3.1", sums);
    expect(Object.keys(files)).toContain("packaging/winget/0.3.1/Moralia.Leve.installer.yaml");
    expect(files["packaging/winget/0.3.1/Moralia.Leve.installer.yaml"]).toContain("/v0.3.1/Leve_0.3.1_x64-setup.exe");
    expect(files["packaging/homebrew/Casks/leve.rb"]).toContain('version "0.3.1"');
  });

  it("recusa pre-release, data malformada e pacote sem hash", () => {
    expect(() => gen("0.2.1-rc.1")).toThrow(/versão inválida/);
    expect(() => buildPackaging({ version: "0.2.0", sums: parseSums(SUMS_020), releaseDate: "25/10/2026" })).toThrow(/data/);
    const semDmg = SUMS_020.split("\n").filter((l) => !l.endsWith(".dmg")).join("\n");
    expect(() => gen("0.2.0", semDmg)).toThrow(/Leve_0.2.0_universal.dmg/);
    const semExe = SUMS_020.split("\n").filter((l) => !l.endsWith("setup.exe")).join("\n");
    expect(() => gen("0.2.0", semExe)).toThrow(/x64-setup.exe/);
  });
});
