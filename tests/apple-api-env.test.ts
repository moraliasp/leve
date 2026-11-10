import { afterEach, beforeAll, describe, expect, it } from "vitest";

// scripts/apple-api-env.sh (#127): limpa e confere o Issuer ID e o Key ID antes do build macOS.
// Sem @types/node no projeto: módulos do Node por import dinâmico, tipados só no que o teste usa.
interface NodeApi {
  mkdtempSync(prefix: string): string;
  readFileSync(p: string, enc: "utf8"): string;
  rmSync(p: string, o: { recursive: true; force: true }): void;
  writeFileSync(p: string, body: string): void;
  tmpdir(): string;
  join(...p: string[]): string;
  spawnSync(
    cmd: string,
    args: string[],
    o: { encoding: "utf8"; env: Record<string, string> },
  ): { status: number | null; stdout: string; stderr: string };
  env: Record<string, string>;
}
let node: NodeApi;
beforeAll(async () => {
  const mods = await Promise.all(["node:fs", "node:os", "node:path", "node:child_process", "node:process"].map((m) => import(m as string)));
  node = Object.assign({}, ...mods);
});

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) node.rmSync(d, { recursive: true, force: true });
});

const UUID = "12345678-abcd-4ef0-9a1b-0123456789ab";
const KEY = "ABCDE12345";

function run(issuer: string, key: string) {
  const dir = node.mkdtempSync(node.join(node.tmpdir(), "apple-api-env-"));
  dirs.push(dir);
  const githubEnv = node.join(dir, "env");
  node.writeFileSync(githubEnv, "");
  const r = node.spawnSync("bash", ["scripts/apple-api-env.sh"], {
    encoding: "utf8",
    env: { PATH: node.env.PATH, APPLE_API_ISSUER: issuer, APPLE_API_KEY: key, GITHUB_ENV: githubEnv },
  });
  return { ...r, written: node.readFileSync(githubEnv, "utf8") };
}

describe("apple-api-env.sh", () => {
  it("limpa quebra de linha, espaço e aspas e grava os dois valores mascarados", () => {
    const r = run(` ${UUID}\n`, `"${KEY}"\r\n`);
    expect(r.status).toBe(0);
    expect(r.written).toBe(`APPLE_API_ISSUER=${UUID}\nAPPLE_API_KEY=${KEY}\n`);
    expect(r.stdout).toContain(`::add-mask::${UUID}`);
    expect(r.stdout).toContain(`::add-mask::${KEY}`);
  });

  it.each([
    ["trocados", KEY, UUID, ["APPLE_API_ISSUER do environment release parece um Key ID", "APPLE_API_KEY do environment release parece o Issuer ID"]],
    ["vazios", "", "", ["APPLE_API_ISSUER do environment release está vazio", "APPLE_API_KEY do environment release está vazio"]],
    ["UUID longo e Key ID curto", `${UUID}0`, "ABC", ["tem 37 caracteres", "tem 3 caracteres"]],
    ["Key ID em minúsculas", UUID, KEY.toLowerCase(), ["APPLE_API_KEY do environment release tem letras minúsculas"]],
  ])("recusa %s antes de gravar, sem mostrar o valor", (_, issuer, key, erros) => {
    const r = run(issuer, key);
    expect(r.status).toBe(1);
    expect(r.written).toBe("");
    for (const e of erros) expect(r.stdout).toContain(e);
    for (const v of [issuer, key].filter((v) => v.length > 3)) expect(r.stdout).not.toContain(v);
  });
});
