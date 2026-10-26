// Gera THIRD_PARTY.md: dependências de produção do npm (via `pnpm licenses list --prod --json`)
// e crates diretos do Rust (via `cargo metadata`). Rode da raiz: `node scripts/third-party.mjs`.
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const sh = (cmd, cwd = ".") => execSync(cmd, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });

const npm = JSON.parse(sh("pnpm licenses list --prod --json"));
const rows = [];
// Pacote sem campo `license` no package.json: a licença vem do arquivo do pacote, conferido à mão.
const semCampo = { khroma: "MIT (arquivo `license` do pacote)" };
for (const [license, pkgs] of Object.entries(npm)) {
  for (const p of pkgs) rows.push({ name: p.name, version: p.versions?.join(", ") ?? p.version ?? "", license: license === "Unknown" ? (semCampo[p.name] ?? "Unknown") : license, url: p.homepage ?? "" });
}
rows.sort((a, b) => a.name.localeCompare(b.name));

const meta = JSON.parse(sh("cargo metadata --format-version 1", "src-tauri"));
const root = meta.packages.find((p) => p.name === "leve");
// Pelo id resolvido, não pelo nome: crate com várias versões no grafo (base64) entra só na versão direta.
const direct = new Set(meta.resolve.nodes.find((n) => n.id === root.id).deps.map((d) => d.pkg));
const crates = meta.packages
  .filter((p) => direct.has(p.id))
  .map((p) => ({ name: p.name, version: p.version, license: p.license ?? "", url: p.repository ?? "" }))
  .sort((a, b) => a.name.localeCompare(b.name));
const count = {};
for (const p of meta.packages) if (p.name !== "leve") count[p.license ?? "?"] = (count[p.license ?? "?"] ?? 0) + 1;

// Licenças com obrigação de aviso: EPL/MPL/CDLA sem alternativa permissiva (`OR`). Dupla com alternativa
// só entra quando a escolha está registrada em `escolhas` (e em THIRD_PARTY_NOTICES.md).
const escolhas = { dompurify: "Apache-2.0 escolhida; texto e fonte em THIRD_PARTY_NOTICES.md" };
// Instalados como dependência de produção, mas cortados do bundle: não são distribuídos, então não pedem aviso.
const foraDoBundle = { elkjs: "layout ELK do Mermaid, cortado pelo plugin `mermaidSemElk` do `vite.config.ts`" };
const temAviso = (l) => /\b(EPL|MPL|CDLA)-/.test(l);
const temAlternativa = (l) => /\bOR\b/.test(l);
const avisos = [
  ...rows.map((r) => ({ ...r, origem: "npm" })),
  ...meta.packages.filter((p) => p.name !== "leve").map((p) => ({ name: p.name, version: p.version, license: p.license ?? "", url: p.repository ?? "", origem: "crate" })),
]
  .filter((r) => temAviso(r.license))
  .filter((r) => !foraDoBundle[r.name])
  .filter((r) => {
    if (!temAlternativa(r.license)) return true;
    if (escolhas[r.name]) return true;
    console.warn(`AVISO: ${r.name} ${r.version} tem ${r.license} com alternativa e sem escolha registrada; decida e registre em \`escolhas\` e no NOTICES.`);
    return false;
  })
  .sort((a, b) => a.origem.localeCompare(b.origem) || a.name.localeCompare(b.name));
const tabelaAvisos = [
  "| Pacote | Versão | Origem | Licença | Situação |",
  "|---|---|---|---|---|",
  ...avisos.map((r) => `| ${r.url ? `[${r.name}](${r.url})` : r.name} | ${r.version} | ${r.origem} | ${r.license} | ${escolhas[r.name] ?? "sem alternativa permissiva; texto e fonte em THIRD_PARTY_NOTICES.md"} |`),
].join("\n");
const notaFora = rows
  .filter((r) => foraDoBundle[r.name])
  .map((r) => `- ${r.name} ${r.version} (${r.license}): ${foraDoBundle[r.name]}.`)
  .join("\n");

const table = (xs) =>
  ["| Pacote | Versão | Licença |", "|---|---|---|", ...xs.map((r) => `| ${r.url ? `[${r.name}](${r.url})` : r.name} | ${r.version} | ${r.license} |`)].join("\n");

const out = `# Terceiros

Gerado por \`node scripts/third-party.mjs\` em ${new Date().toISOString().slice(0, 10)}. Textos completos das licenças com obrigação de aviso (Lucide, DOMPurify, crates MPL-2.0, webpki-root-certs) em \`THIRD_PARTY_NOTICES.md\`.

## Licenças com obrigação de aviso (EPL/MPL/CDLA)

Pacotes npm de produção e crates do grafo do Rust cuja licença é EPL ou MPL sem alternativa permissiva, mais os de licença dupla com escolha registrada. Cada um precisa de um título com o nome em \`THIRD_PARTY_NOTICES.md\` (conferido por \`tests/notices.test.ts\`). Revisão do jurídico antes da release.

${tabelaAvisos}
${notaFora ? `\nFora do bundle (dependência instalada, não distribuída no app):\n\n${notaFora}\n` : ""}
## npm (produção, ${rows.length} pacotes incluindo transitivos)

${table(rows)}

## Rust (crates diretos; o grafo completo tem ${meta.packages.length - 1} crates)

${table(crates)}

Licenças no grafo completo do Rust: ${Object.entries(count)
  .sort((a, b) => b[1] - a[1])
  .map(([l, n]) => `${l} (${n})`)
  .join(", ")}.
`;
writeFileSync("THIRD_PARTY.md", out);
console.log(`THIRD_PARTY.md: ${rows.length} npm, ${crates.length} crates diretos, ${avisos.length} com aviso EPL/MPL/CDLA`);
