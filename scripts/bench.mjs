#!/usr/bin/env node
// Benchmark do Leve no macOS: abertura a frio até o documento pintado, memória do app (processo
// principal + processos do WebKit atribuídos a ele) e tamanho do app e do instalador.
// Método e resultados: docs/benchmark.md. Uso, depois de `pnpm tauri build`:
//
//   node scripts/bench.mjs [--runs 10] [--warmup 1] [--settle 10000] [--app <Leve.app>] [--json <arquivo>]
//
// Não envia teclas nem cliques, não usa rede e não grava fora de uma pasta temporária própria
// (apagada no fim): cada abertura roda com HOME próprio, então o perfil do Leve instalado na
// máquina não é lido nem tocado.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { attribute, generateDoc, mb, parseBenchLine, parseFootprint, parsePs, summarize, webkitKind } from "./bench-lib.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const KINDS = ["app", "WebContent", "GPU", "Networking"];
const PAINT_WAIT_MS = 3000;

function args(argv) {
  const o = { runs: 10, warmup: 1, settle: 10000, timeout: 60000, app: join(ROOT, "src-tauri/target/release/bundle/macos/Leve.app"), json: null };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i].replace(/^--/, "");
    if (!(k in o)) throw new Error(`opção desconhecida: ${argv[i]}`);
    const v = argv[++i];
    o[k] = typeof o[k] === "number" ? Number(v) : v;
  }
  return o;
}

const sh = (cmd, a) => execFileSync(cmd, a, { encoding: "utf8" }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const plist = (app, key) => sh("plutil", ["-extract", key, "raw", join(app, "Contents/Info.plist")]);
const procs = () => parsePs(sh("ps", ["-axo", "pid=,comm="]));

function bundleBytes(dir) {
  let n = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) n += bundleBytes(p);
    else n += lstatSync(p).size;
  }
  return n;
}

function machine(app) {
  let commit = "?";
  try {
    commit = sh("git", ["-C", ROOT, "rev-parse", "--short", "HEAD"]);
  } catch {
    // fora de um checkout git
  }
  return {
    cpu: sh("sysctl", ["-n", "machdep.cpu.brand_string"]),
    memGB: Math.round(Number(sh("sysctl", ["-n", "hw.memsize"])) / 2 ** 30),
    macos: `${sh("sw_vers", ["-productVersion"])} (${sh("sw_vers", ["-buildVersion"])})`,
    arch: sh("uname", ["-m"]),
    leve: plist(app, "CFBundleShortVersionString"),
    commit,
    date: new Date().toISOString().slice(0, 10),
  };
}

function sizes(app) {
  const exe = join(app, "Contents/MacOS", plist(app, "CFBundleExecutable"));
  const dmgDir = join(app, "../../dmg");
  const dmgs = existsSync(dmgDir) ? readdirSync(dmgDir).filter((f) => f.endsWith(".dmg")) : [];
  const dmg = dmgs.map((f) => join(dmgDir, f)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
  return {
    app: bundleBytes(app),
    exe: statSync(exe).size,
    exeArchs: sh("lipo", ["-archs", exe]),
    dmg: dmg ? statSync(dmg).size : null,
    dmgName: dmg ? basename(dmg) : null,
  };
}

/** Memória (phys_footprint e RSS) do app e dos processos do WebKit que têm o app como responsável. */
function memory(mainPid, respBin) {
  const list = procs();
  const webkit = list.filter((p) => webkitKind(p.comm));
  const resp = new Map();
  if (webkit.length) {
    for (const line of sh(respBin, webkit.map((p) => String(p.pid))).split("\n")) {
      const [pid, r] = line.split(" ").map(Number);
      resp.set(pid, r);
    }
  }
  return attribute(list, resp, mainPid).map((p) => {
    let footprint = NaN;
    let rss = NaN;
    try {
      footprint = parseFootprint(sh("footprint", ["-p", String(p.pid), "-f", "bytes", "--noCategories"]));
      rss = Number(sh("ps", ["-o", "rss=", "-p", String(p.pid)])) * 1024;
    } catch {
      // processo saiu no meio da leitura: fica NaN e aparece na tabela
    }
    return { pid: p.pid, kind: p.kind, footprint, rss };
  });
}

async function waitGone(pids, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const alive = new Set(procs().map((p) => p.pid));
    if (!pids.some((p) => alive.has(p))) return true;
    await sleep(50);
  }
  return false;
}

async function once({ app, exe, doc, tmp, settle, timeout, respBin }) {
  const home = mkdtempSync(join(tmp, "home-"));
  const out = join(tmp, `stdout-${basename(home)}.log`);
  writeFileSync(out, "");
  const docReal = realpathSync(doc);
  const t0 = Date.now();
  // `open` passa pelo LaunchServices como um duplo-clique: o arquivo chega por RunEvent::Opened.
  // -n: instância nova; -F: sem restaurar janelas. HOME e CFFIXED_USER_HOME isolam o perfil.
  spawnSync("open", ["-n", "-F", "--env", "LEVE_BENCH=1", "--env", `HOME=${home}`, "--env", `CFFIXED_USER_HOME=${home}`, "--stdout", out, "-a", app, doc]);
  // Duas linhas por documento (src/bench.ts): `layout` sempre; `paint` quando o WebKit dá um quadro
  // à janela, o que não acontece enquanto ela está coberta por outras.
  const read = (phase) =>
    readFileSync(out, "utf8")
      .split("\n")
      .map(parseBenchLine)
      .find((v) => v && v.doc === docReal && v.phase === phase) ?? null;
  let line = null;
  while (!line && Date.now() - t0 < timeout) {
    await sleep(20);
    line = read("layout");
  }
  const main = procs().find((p) => p.comm === exe);
  if (!line || !main) {
    if (main) process.kill(main.pid, "SIGKILL");
    throw new Error(`sem sinal de layout em ${timeout} ms (${basename(doc)}); saída em ${out}`);
  }
  const layoutSeen = Date.now();
  let paint = null;
  const paintEnd = Date.now() + PAINT_WAIT_MS;
  while (!paint && Date.now() < paintEnd) {
    await sleep(20);
    paint = read("paint");
  }
  await sleep(Math.max(0, settle - (Date.now() - layoutSeen)));
  const mem = memory(main.pid, respBin);
  process.kill(main.pid, "SIGTERM");
  if (!(await waitGone([main.pid], 5000))) process.kill(main.pid, "SIGKILL");
  await waitGone(mem.map((m) => m.pid), 5000);
  rmSync(home, { recursive: true, force: true });
  const m = Object.fromEntries(line.measures.map((x) => [x.name, x.ms]));
  const byKind = (k, f) => mem.filter((x) => x.kind === k).reduce((n, x) => n + x[f], 0);
  return {
    openMs: line.epochMs - t0,
    paintMs: paint ? paint.epochMs - t0 : null,
    runMs: line.runMs,
    pageMs: line.pageMs,
    renderMs: m["leve:render"],
    layoutMs: m["leve:layout"],
    footprint: Object.fromEntries(KINDS.map((k) => [k, byKind(k, "footprint")])),
    rss: Object.fromEntries(KINDS.map((k) => [k, byKind(k, "rss")])),
    processes: mem.map((x) => x.kind),
  };
}

const fmtMs = (s) => `${Math.round(s.median)} / ${Math.round(s.p90)}`;
const fmtMB = (s) => `${mb(s.median)} / ${mb(s.p90)}`;
const total = (r, f) => KINDS.reduce((n, k) => n + r[f][k], 0);

async function main() {
  if (process.platform !== "darwin") throw new Error("bench.mjs mede só no macOS por enquanto (ver docs/benchmark.md)");
  const o = args(process.argv);
  if (!existsSync(o.app)) throw new Error(`${o.app} não existe: rode \`pnpm tauri build\` antes`);
  const exe = join(o.app, "Contents/MacOS", plist(o.app, "CFBundleExecutable"));
  const running = procs().filter((p) => p.comm.endsWith("/Contents/MacOS/" + basename(exe)));
  if (running.length) throw new Error(`feche o Leve antes de medir (pid ${running.map((p) => p.pid).join(", ")}): a instância única mandaria o arquivo para ele`);
  // O single-instance (tauri-plugin-single-instance) cria este socket ao abrir e só o apaga ao sair
  // por conta própria; o SIGTERM do bench o deixa. No fim ele volta a como estava: some se não existia.
  const socket = `/tmp/${plist(o.app, "CFBundleIdentifier").replace(/[.-]/g, "_")}_si.sock`;
  const hadSocket = existsSync(socket);

  const tmp = mkdtempSync(join(tmpdir(), "leve-bench-"));
  try {
    const respBin = join(tmp, "responsavel");
    sh("swiftc", ["-O", join(ROOT, "scripts/bench-responsavel.swift"), "-o", respBin]);
    const docsDir = join(tmp, "docs");
    mkdirSync(docsDir);
    const docs = [
      { name: "docs/exemplo.md", path: join(ROOT, "docs/exemplo.md") },
      { name: "sintético 1 MB", path: join(docsDir, "bench-1mb.md"), bytes: 1_000_000 },
      { name: "sintético 5 MB", path: join(docsDir, "bench-5mb.md"), bytes: 5_000_000 },
    ];
    for (const d of docs) if (d.bytes) writeFileSync(d.path, generateDoc(d.bytes, 1));
    for (const d of docs) d.size = statSync(d.path).size;

    const info = { machine: machine(o.app), sizes: sizes(o.app), runs: o.runs, warmup: o.warmup, settleMs: o.settle, docs: [] };
    for (const d of docs) {
      const results = [];
      for (let i = 0; i < o.warmup + o.runs; i++) {
        const r = await once({ app: o.app, exe, doc: d.path, tmp, settle: o.settle, timeout: o.timeout, respBin });
        const tag = i < o.warmup ? "aquecimento" : `${i - o.warmup + 1}/${o.runs}`;
        console.error(`${d.name} ${tag}: layout ${Math.round(r.openMs)} ms, quadro ${r.paintMs == null ? "—" : Math.round(r.paintMs) + " ms"} (run ${Math.round(r.runMs)}, page ${Math.round(r.pageMs)}), ${mb(total(r, "footprint"))} MB [${r.processes.join(", ")}]`);
        if (i >= o.warmup) results.push(r);
      }
      const s = (f) => summarize(results.map(f));
      info.docs.push({
        name: d.name,
        bytes: d.size,
        openMs: s((r) => r.openMs),
        paintMs: summarize(results.filter((r) => r.paintMs != null).map((r) => r.paintMs)),
        renderMs: s((r) => r.renderMs),
        layoutMs: s((r) => r.layoutMs),
        footprint: Object.fromEntries([...KINDS.map((k) => [k, s((r) => r.footprint[k])]), ["total", s((r) => total(r, "footprint"))]]),
        rssTotal: s((r) => total(r, "rss")),
        results,
      });
    }

    const m = info.machine;
    const z = info.sizes;
    console.log(`Leve ${m.leve} (${m.commit}), ${m.cpu}, ${m.memGB} GB, macOS ${m.macos}, ${m.date}`);
    console.log(`${o.runs} execuções por documento (+${o.warmup} de aquecimento descartada), memória lida ${o.settle} ms depois do layout. Mediana / p90.\n`);
    console.log("| Documento | Abertura até o layout (ms) | Até o 1º quadro (ms) | `leve:render` (ms) | `leve:layout` (ms) | Memória total (MB) | App | WebContent | GPU | Networking | RSS somado (MB) |");
    console.log("|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|");
    for (const d of info.docs) {
      const f = d.footprint;
      console.log(
        `| ${d.name} (${d.bytes < 100_000 ? `${(d.bytes / 1000).toFixed(1).replace(".", ",")} kB` : `${mb(d.bytes)} MB`}) | ${fmtMs(d.openMs)} | ${d.paintMs.n ? `${fmtMs(d.paintMs)}${d.paintMs.n < o.runs ? ` (${d.paintMs.n}/${o.runs})` : ""}` : "—"} | ${fmtMs(d.renderMs)} | ${fmtMs(d.layoutMs)} | ${fmtMB(f.total)} | ${fmtMB(f.app)} | ${fmtMB(f.WebContent)} | ${fmtMB(f.GPU)} | ${fmtMB(f.Networking)} | ${fmtMB(d.rssTotal)} |`,
      );
    }
    console.log(`\nTamanho: Leve.app ${mb(z.app)} MB (executável ${mb(z.exe)} MB, ${z.exeArchs}); ${z.dmgName ?? "sem .dmg"} ${z.dmg ? mb(z.dmg) + " MB" : ""}`);
    if (o.json) writeFileSync(o.json, JSON.stringify(info, null, 2) + "\n");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
    if (!hadSocket) rmSync(socket, { force: true });
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
