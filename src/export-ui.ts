/**
 * Exportar HTML, Copiar como HTML e Copiar como texto formatado: a sheet `#export` e os efeitos
 * em volta de `export.ts` e `rich.ts`, que vêm sob demanda. Gravar é só pelo diálogo do Rust.
 */
import { invoke } from "@tauri-apps/api/core";
import { copyText } from "./code";
import type { DocStyle } from "./doc-style";
import { $ } from "./dom";
import type { ExportResult, ImageEmbed } from "./export";
import { highlightAll } from "./highlight";
import { lang, t } from "./i18n";
import { isLargeDoc } from "./limits";
import { renderMath } from "./math";
import { isOn, setOn } from "./prefs";
import { joinPath, renderMermaid } from "./render";
import * as theme from "./theme";

interface ExportDoc {
  path: string;
  dir: string;
  name: string;
  content: string;
}

export interface ExportHost {
  tauri: boolean;
  flash(msg: string, isError?: boolean, sticky?: boolean): void;
  contentEl: HTMLElement;
  currentDoc(): ExportDoc | null;
  docStyle(): DocStyle;
}

/** Sheet `#export` aberta para gravar arquivo ou para copiar; o botão principal decide. */
let exportMode: "file" | "copy" = "file";

/** Abre a sheet com a opção dos links `.md`. Nada é montado até o leitor confirmar. */
export function openExport(h: ExportHost, mode: "file" | "copy"): void {
  if (!h.currentDoc()) {
    h.flash(t("export.noDoc"), true);
    return;
  }
  exportMode = mode;
  $("export-title").textContent = t(mode === "copy" ? "export.copyTitle" : "export.title");
  $("export-ok").textContent = t(mode === "copy" ? "export.copy" : "export.ok");
  $<HTMLInputElement>("export-md-links").checked = isOn("exportMdLinks");
  $<HTMLDialogElement>("export").showModal();
}

/**
 * Imagens locais do documento como data URI. No app, o Rust lê só o que `allow_assets` já liberaria
 * (pasta de documento concedido, caminho relativo, extensão de imagem) e recusa acima de 5 MB sem ler;
 * no navegador, `fetch` no servidor do Vite.
 */
async function readExportImages(h: ExportHost, dir: string, rels: string[], max: number): Promise<Record<string, ImageEmbed>> {
  if (rels.length === 0) return {};
  if (h.tauri) return invoke<Record<string, ImageEmbed>>("export_images", { dir, rels });
  const { blobToDataUri } = await import("./export");
  const out: Record<string, ImageEmbed> = {};
  await Promise.all(
    rels.map(async (rel) => {
      out[rel] = { data: null, tooBig: false };
      try {
        const res = await fetch(joinPath(dir, rel));
        const blob = await res.blob();
        if (!res.ok || blob.type.includes("text/html")) return;
        if (blob.size > max) out[rel].tooBig = true;
        else out[rel].data = await blobToDataUri(blob);
      } catch {
        /* fica com o caminho relativo */
      }
    }),
  );
  return out;
}

/**
 * Monta o HTML a partir de um clone do documento desenhado: realce completo (fora do modo grande),
 * Mermaid redesenhado no tema claro se a página está no escuro ou ainda não terminou, KaTeX pendente,
 * CSS claro com as fontes usadas e imagens locais embutidas. A página não é tocada.
 */
async function buildExport(h: ExportHost, doc: ExportDoc): Promise<ExportResult> {
  const [ex, { exportCss }] = await Promise.all([import("./export"), import("./export-css")]);
  const root = ex.cloneContent(h.contentEl);
  if (!isLargeDoc(doc.content)) await highlightAll(root);
  const unrendered = Array.from(root.querySelectorAll("pre.mermaid")).some((p) => !p.querySelector("svg") && !p.classList.contains("has-error"));
  if (theme.isDark() || unrendered) await renderMermaid(root, false);
  await renderMath(root);
  const [css, images] = await Promise.all([
    exportCss(root, h.docStyle()),
    readExportImages(h, doc.dir, ex.localImageRels(root), ex.EXPORT_IMAGE_MAX_BYTES),
  ]);
  const mdLinks = isOn("exportMdLinks") ? "html" : "text";
  return ex.buildExportHtml(root, { fileName: doc.name, lang: lang(), css, mdLinks, images });
}

function oversizedNotice(n: number): string {
  return n === 0 ? "" : n === 1 ? t("export.oversizedOne") : t("export.oversizedMany", { n });
}

/** Grava pelo diálogo nativo do Rust (`save_html`): o frontend manda o documento de origem e o HTML, nunca o destino. */
async function saveExport(h: ExportHost, doc: ExportDoc, pending: Promise<ExportResult>): Promise<void> {
  try {
    const { html, oversized } = await pending;
    let saved: string | null;
    if (h.tauri) saved = await invoke<string | null>("save_html", { doc: doc.path, html });
    else {
      // Modo navegador: download do arquivo, para a prova manual.
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([html], { type: "text/html" }));
      a.download = doc.name.replace(/\.[^.]+$/, "") + ".html";
      a.click();
      URL.revokeObjectURL(a.href);
      saved = a.download;
    }
    if (!saved) return;
    h.flash([t("export.saved", { path: saved }), oversizedNotice(oversized)].filter(Boolean).join(" · "), false, oversized > 0);
  } catch (e) {
    h.flash(t("export.failed", { error: String(e) }), true);
  }
}

/**
 * Copia o HTML como texto. Chamada dentro do clique do botão da sheet: o WebKit só aceita escrever
 * na área de transferência com um gesto do leitor, e o `ClipboardItem` com promessa segura o gesto
 * enquanto o HTML é montado. Sem `ClipboardItem`, `copyText` (Clipboard API ou `execCommand`).
 */
async function copyExport(h: ExportHost, pending: Promise<ExportResult>): Promise<void> {
  try {
    let copied = false;
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      const blob = pending.then((r) => new Blob([r.html], { type: "text/plain" }));
      // Recusa (permissão negada pelo WebView) cai no caminho de `copyText`.
      copied = await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]).then(
        () => true,
        () => false,
      );
    }
    if (!copied) await copyText((await pending).html);
    const { oversized } = await pending;
    h.flash([t("export.copied"), oversizedNotice(oversized)].filter(Boolean).join(" · "), false, oversized > 0);
  } catch (e) {
    h.flash(t("export.failed", { error: String(e) }), true);
  }
}

export function wireExport(h: ExportHost): void {
  $("export-ok").addEventListener("click", () => {
    setOn("exportMdLinks", $<HTMLInputElement>("export-md-links").checked);
    const doc = h.currentDoc();
    if (!doc) return;
    const pending = buildExport(h, doc);
    if (exportMode === "copy") void copyExport(h, pending);
    else void saveExport(h, doc, pending);
  });
}

/**
 * Editar › Copiar como texto formatado (Mod+Shift+C): `text/html` com estilo inline + `text/plain`
 * (o Markdown-fonte, ou o texto da seleção) num `ClipboardItem` só. A escrita começa aqui, de forma
 * síncrona, dentro do gesto do leitor; o conteúdo chega pelas promessas, montado por `src/rich.ts`
 * (carregado sob demanda, como o resto: reserva por `execCommand` e aviso).
 */
export function copyRich(h: ExportHost): void {
  const doc = h.currentDoc();
  if (!doc) {
    h.flash(t("rich.noDoc"), true);
    return;
  }
  const sel = window.getSelection();
  const range = sel && !sel.isCollapsed && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
  const rich = import("./rich");
  const job = rich.then((m) =>
    m.richCopyJob({
      content: h.contentEl,
      range,
      source: doc.content,
      large: isLargeDoc(doc.content),
      readImages: (rels, max) => readExportImages(h, doc.dir, rels, max),
    }),
  );
  const write =
    typeof ClipboardItem !== "undefined" && navigator.clipboard?.write
      ? navigator.clipboard.write([
          new ClipboardItem({
            "text/html": job.then((j) => new Blob([j.html], { type: "text/html" })),
            "text/plain": job.then((j) => new Blob([j.plain], { type: "text/plain" })),
          }),
        ])
      : Promise.reject(new Error("ClipboardItem indisponível"));
  rich
    .then((m) => m.finishCopy(job, write))
    .then(
      ({ message, oversized }) => h.flash([message, oversizedNotice(oversized)].filter(Boolean).join(" · "), false, oversized > 0),
      (e) => h.flash(t("rich.failed", { error: String(e) }), true),
    );
}
