import { icon } from "./icons";
import { codeLanguage } from "./highlight";
import { t } from "./i18n";

/** Ícone de copiar e rótulo da linguagem nos blocos de código (pós-render). */

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      /* sem permissão ou fora de contexto seguro: tenta o caminho antigo */
    }
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand("copy");
  ta.remove();
  if (!ok) throw new Error("execCommand(copy) recusado");
}

const ICON_COPY = icon("copy", 14);
const ICON_CHECK = icon("check", 14);
const ICON_X = icon("x", 14);


/**
 * Envolve cada `pre > code` (menos Mermaid) em `.code-wrap` com rótulo da linguagem e botão
 * que copia o texto puro, sem os spans do highlight. Feedback (check/x) por 1,5 s.
 */
export function decorateCodeBlocks(container: HTMLElement): void {
  for (const pre of container.querySelectorAll<HTMLPreElement>("pre:not(.mermaid)")) {
    const code = pre.querySelector<HTMLElement>(":scope > code");
    if (!code || pre.parentElement?.classList.contains("code-wrap")) continue;

    const wrap = document.createElement("div");
    wrap.className = "code-wrap";
    pre.replaceWith(wrap);
    wrap.appendChild(pre);

    const tools = document.createElement("div");
    tools.className = "code-tools";
    const lang = codeLanguage(code);
    if (lang) {
      const label = document.createElement("span");
      label.className = "code-lang";
      label.textContent = lang;
      tools.appendChild(label);
    }
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "code-copy";
    btn.innerHTML = ICON_COPY;
    btn.title = t("code.copy");
    btn.setAttribute("aria-label", t("code.copy"));
    let timer: number | undefined;
    btn.addEventListener("click", () => {
      const text = (code.textContent ?? "").replace(/\n$/, "");
      copyText(text)
        .then(() => {
          btn.innerHTML = ICON_CHECK;
          btn.title = t("code.copied");
          btn.classList.add("done");
        })
        .catch(() => {
          btn.innerHTML = ICON_X;
          btn.title = t("code.copyFailed");
          btn.classList.add("fail");
        })
        .finally(() => {
          window.clearTimeout(timer);
          timer = window.setTimeout(() => {
            btn.innerHTML = ICON_COPY;
            btn.title = t("code.copy");
            btn.classList.remove("done", "fail");
          }, 1500);
        });
    });
    tools.appendChild(btn);
    wrap.appendChild(tools);
  }
}
