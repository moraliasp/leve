#!/usr/bin/env node
// `npx leve.md`: baixa o Leve da release do GitHub, confere o SHA-256 embutido em ../sums.json e instala.
// Só módulos do Node (>= 18), sem dependência nem postinstall. ../package.json e ../sums.json saem de
// scripts/packaging.mjs; por que assim: "npx leve.md" em docs/decisoes.md.
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { accessSync, constants, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const REPO = "moraliasp/leve";
const MAX_HOPS = 5;

const MESSAGES = {
  en: {
    help: (v) => `leve.md ${v}: installs Leve, a Markdown viewer, from github.com/${REPO}/releases.

Usage: npx leve.md [--force]

  macOS    downloads Leve_${v}_<arch>.app.tar.gz, checks its SHA-256 and moves Leve.app to
           /Applications (or ~/Applications), then opens it
  Windows  downloads Leve_${v}_x64-setup.exe, checks its SHA-256 and runs the installer
  Linux    not supported: prints where to get the .deb, .rpm and Flatpak

  --force    replace an existing Leve.app (macOS)
  --help     show this help
  --version  show the version`,
    linux: (v) => `Linux is not supported by npx leve.md. Get the .deb, .rpm, AppImage or Flatpak from
  https://github.com/${REPO}/releases/tag/v${v}
Instructions: https://github.com/${REPO}/blob/main/docs/instalacao.md#linux`,
    unsupported: (p, a) => `No Leve package for ${p} ${a}. Supported: macOS (arm64, x64) and Windows (x64).`,
    unknownArg: (a) => `Unknown option: ${a}. See npx leve.md --help.`,
    exists: (p) => `Leve is already installed at ${p}. Leaving it as is (it updates itself). Use --force to replace it.`,
    downloading: (u) => `Downloading ${u}`,
    hashMismatch: (n) => `SHA-256 of ${n} does not match the one shipped in this package. Nothing was installed.`,
    installed: (p) => `Leve installed at ${p}.`,
    runningInstaller: "Running the Leve installer…",
    failed: (m) => `Error: ${m}`,
  },
  pt: {
    help: (v) => `leve.md ${v}: instala o Leve, visualizador de Markdown, a partir de github.com/${REPO}/releases.

Uso: npx leve.md [--force]

  macOS    baixa Leve_${v}_<arq>.app.tar.gz, confere o SHA-256 e move o Leve.app para
           /Applications (ou ~/Applications), depois abre
  Windows  baixa Leve_${v}_x64-setup.exe, confere o SHA-256 e abre o instalador
  Linux    sem suporte: mostra onde baixar o .deb, o .rpm e o Flatpak

  --force    substitui um Leve.app existente (macOS)
  --help     mostra esta ajuda
  --version  mostra a versão`,
    linux: (v) => `O npx leve.md não instala no Linux. Baixe o .deb, o .rpm, o AppImage ou o Flatpak em
  https://github.com/${REPO}/releases/tag/v${v}
Passo a passo: https://github.com/${REPO}/blob/main/docs/instalacao.md#linux`,
    unsupported: (p, a) => `Não há pacote do Leve para ${p} ${a}. Com suporte: macOS (arm64, x64) e Windows (x64).`,
    unknownArg: (a) => `Opção desconhecida: ${a}. Veja npx leve.md --help.`,
    exists: (p) => `O Leve já está instalado em ${p}. Fica como está (ele se atualiza sozinho). Use --force para substituir.`,
    downloading: (u) => `Baixando ${u}`,
    hashMismatch: (n) => `O SHA-256 de ${n} não confere com o que veio neste pacote. Nada foi instalado.`,
    installed: (p) => `Leve instalado em ${p}.`,
    runningInstaller: "Abrindo o instalador do Leve…",
    failed: (m) => `Erro: ${m}`,
  },
};

export const messages = (locale = Intl.DateTimeFormat().resolvedOptions().locale) =>
  locale.toLowerCase().startsWith("pt") ? MESSAGES.pt : MESSAGES.en;

/** Pacote da release para esta plataforma: `{ kind: "mac" | "win", name }`, ou `{ kind: "linux" | "unsupported" }`. */
export function pickAsset(platform, arch, version) {
  if (platform === "darwin" && arch === "arm64") return { kind: "mac", name: `Leve_${version}_aarch64.app.tar.gz` };
  if (platform === "darwin" && arch === "x64") return { kind: "mac", name: `Leve_${version}_x64.app.tar.gz` };
  if (platform === "win32" && arch === "x64") return { kind: "win", name: `Leve_${version}_x64-setup.exe` };
  if (platform === "linux") return { kind: "linux" };
  return { kind: "unsupported" };
}

export const assetUrl = (version, name) => `https://github.com/${REPO}/releases/download/v${version}/${name}`;

/** Só https, e só o GitHub e o CDN de downloads dele. */
export function allowedUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  return u.protocol === "https:" && (u.hostname === "github.com" || u.hostname.endsWith(".githubusercontent.com"));
}

export const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

/** Erro se o conteúdo não tem o hash esperado (minúsculo, como no SHA256SUMS). */
export function verify(buf, expected, name, msg = messages()) {
  if (!/^[0-9a-f]{64}$/.test(expected ?? "") || sha256(buf) !== expected) throw new Error(msg.hashMismatch(name));
}

/** Baixa para a memória seguindo redirecionamento à mão, cada salto conferido por `allowedUrl`. */
export async function download(url, fetchImpl = fetch) {
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    if (!allowedUrl(url)) throw new Error(`refusing to download from ${url}`);
    const res = await fetchImpl(url, { redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error(`redirect without location from ${url}`);
      url = new URL(loc, url).href;
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return Buffer.from(await res.arrayBuffer());
  }
  throw new Error(`too many redirects for ${url}`);
}

/** /Applications se gravável, senão ~/Applications (criada se faltar). */
export function macDestination() {
  try {
    accessSync("/Applications", constants.W_OK);
    return "/Applications";
  } catch {
    const dir = join(homedir(), "Applications");
    mkdirSync(dir, { recursive: true });
    return dir;
  }
}

/** Extrai o tar.gz (já conferido) e move só o Leve.app para `destDir`. Devolve o caminho do app. */
export function installMac(tarPath, destDir, { force = false, msg = messages() } = {}) {
  const target = join(destDir, "Leve.app");
  if (existsSync(target) && !force) throw new Error(msg.exists(target));
  const out = mkdtempSync(join(tmpdir(), "leve-x-"));
  try {
    execFileSync("tar", ["-xzf", tarPath, "-C", out], { stdio: "inherit" });
    const app = join(out, "Leve.app");
    if (!existsSync(join(app, "Contents", "Info.plist"))) throw new Error(`Leve.app not found in ${tarPath}`);
    if (existsSync(target)) rmSync(target, { recursive: true, force: true });
    // mv, não rename: a pasta temporária pode estar em outro volume.
    execFileSync("mv", [app, target], { stdio: "inherit" });
    return target;
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

export const openApp = (appPath) => execFileSync("open", [appPath], { stdio: "inherit" });

/** Instalador NSIS por usuário, interativo, solto deste processo. */
export const runWindowsInstaller = (exePath) => spawn(exePath, [], { detached: true, stdio: "ignore", shell: false }).unref();

const readJson = (rel) => JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8"));

export async function main(args = process.argv.slice(2)) {
  const msg = messages();
  const { version } = readJson("../package.json");
  for (const a of args) if (!["--force", "--help", "--version"].includes(a)) return fail(msg.unknownArg(a), 2);
  if (args.includes("--help")) return console.log(msg.help(version)), 0;
  if (args.includes("--version")) return console.log(version), 0;
  const force = args.includes("--force");

  const asset = pickAsset(process.platform, process.arch, version);
  if (asset.kind === "linux") return fail(msg.linux(version), 1);
  if (asset.kind === "unsupported") return fail(msg.unsupported(process.platform, process.arch), 1);

  const dest = asset.kind === "mac" ? macDestination() : "";
  if (asset.kind === "mac" && !force && existsSync(join(dest, "Leve.app"))) return fail(msg.exists(join(dest, "Leve.app")), 1);

  const url = assetUrl(version, asset.name);
  console.log(msg.downloading(url));
  const buf = await download(url);
  // Confere antes de gravar: conteúdo que não confere nunca chega ao disco.
  verify(buf, readJson("../sums.json")[asset.name], asset.name, msg);
  const dir = mkdtempSync(join(tmpdir(), "leve-"));
  const file = join(dir, asset.name);
  writeFileSync(file, buf);

  if (asset.kind === "win") {
    console.log(msg.runningInstaller);
    // O instalador segue rodando depois deste processo: o arquivo fica no temp.
    runWindowsInstaller(file);
    return 0;
  }
  let app;
  try {
    app = installMac(file, dest, { force, msg });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log(msg.installed(app));
  openApp(app);
  return 0;
}

function fail(text, code) {
  console.error(text);
  return code;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main().then(
    (code) => (process.exitCode = code),
    (e) => {
      console.error(messages().failed(e.message));
      process.exitCode = 1;
    },
  );
}
