#!/usr/bin/env node
// Versão do app num lugar só: `node scripts/version.mjs <x.y.z>` grava nos três arquivos
// (e no Cargo.lock), mais o `<release>` no metainfo do Flatpak; sem argumento imprime a versão atual e sai 1 se os arquivos divergirem.
// Tolera CRLF (checkout do Windows) e não depende da ordem das chaves em [package].
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { METAINFO, addRelease } from "./metainfo.mjs";

export const FILES = ["package.json", "src-tauri/tauri.conf.json", "src-tauri/Cargo.toml", "src-tauri/Cargo.lock"];
export const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;
// Chave `version` de primeiro nível (2 espaços) do JSON; o resto do arquivo fica como está.
const JSON_VERSION = /(^  "version":\s*")([^"]*)(")/m;

// Linha `version = "…"` dentro da seção TOML pedida (até o próximo cabeçalho `[`), seja qual for a ordem.
// Para o Cargo.lock a "seção" é o bloco `[[package]]` cujo `name` é `leve`.
function tomlVersionLine(text, isStart) {
  const lines = text.split("\n");
  let inside = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, "");
    if (/^\[/.test(line)) inside = false;
    if (isStart(line, i, lines)) inside = true;
    if (inside) {
      const m = line.match(/^version\s*=\s*"([^"]*)"/);
      if (m) return { index: i, version: m[1], cr: lines[i].endsWith("\r") };
    }
  }
  return null;
}
const inPackage = (line) => line === "[package]";
const inLockEntry = (line, i, lines) => line === "[[package]]" && (lines[i + 1] ?? "").replace(/\r$/, "") === 'name = "leve"';

function readToml(file, isStart) {
  const hit = tomlVersionLine(readFileSync(file, "utf8"), isStart);
  if (!hit) throw new Error(`versão não encontrada em ${file}`);
  return hit.version;
}

function writeToml(file, isStart, version) {
  const text = readFileSync(file, "utf8");
  const hit = tomlVersionLine(text, isStart);
  if (!hit) throw new Error(`versão não encontrada em ${file}`);
  const lines = text.split("\n");
  lines[hit.index] = `version = "${version}"${hit.cr ? "\r" : ""}`;
  writeFileSync(file, lines.join("\n"));
}

function writeJson(file, version) {
  const text = readFileSync(file, "utf8");
  if (!JSON_VERSION.test(text)) throw new Error(`versão não encontrada em ${file}`);
  writeFileSync(file, text.replace(JSON_VERSION, `$1${version}$3`));
}

const defaultRoot = () => join(dirname(fileURLToPath(import.meta.url)), "..");

/** Versão em cada arquivo, pelo nome relativo à raiz (padrão: a raiz do repo). */
export function current(root = defaultRoot()) {
  const p = (rel) => join(root, rel);
  return {
    "package.json": JSON.parse(readFileSync(p("package.json"), "utf8")).version,
    "src-tauri/tauri.conf.json": JSON.parse(readFileSync(p("src-tauri/tauri.conf.json"), "utf8")).version,
    "src-tauri/Cargo.toml": readToml(p("src-tauri/Cargo.toml"), inPackage),
    "src-tauri/Cargo.lock": readToml(p("src-tauri/Cargo.lock"), inLockEntry),
  };
}

/**
 * Grava a versão nos quatro arquivos e, se for estável (X.Y.Z), põe o `<release>` dela com a data
 * `date` (padrão: hoje, UTC) no topo do metainfo do Flatpak (`addRelease`).
 */
export function set(root = defaultRoot(), version, date = new Date().toISOString().slice(0, 10)) {
  const p = (rel) => join(root, rel);
  writeJson(p("package.json"), version);
  writeJson(p("src-tauri/tauri.conf.json"), version);
  writeToml(p("src-tauri/Cargo.toml"), inPackage, version);
  writeToml(p("src-tauri/Cargo.lock"), inLockEntry, version);
  if (/^\d+\.\d+\.\d+$/.test(version) && existsSync(p(METAINFO))) {
    writeFileSync(p(METAINFO), addRelease(readFileSync(p(METAINFO), "utf8"), version, date));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = defaultRoot();
  const arg = process.argv[2];
  if (arg === undefined) {
    const all = current(root);
    const values = new Set(Object.values(all));
    if (values.size !== 1) {
      console.error("As versões divergem:");
      for (const [file, v] of Object.entries(all)) console.error(`  ${file}: ${v}`);
      process.exit(1);
    }
    console.log([...values][0]);
  } else {
    if (!SEMVER.test(arg)) {
      console.error(`Versão inválida: "${arg}". Use x.y.z (sem o "v" da tag).`);
      process.exit(2);
    }
    set(root, arg);
    console.log(arg);
  }
}
