import { type CommentSink, hiddenTotal, revealHidden, scanHidden } from "./hidden";
import { t } from "./i18n";

/**
 * Interface do conteúdo oculto (a detecção está em `hidden.ts`). Achou algo: aviso no topo,
 * "Este documento tem N trechos ocultos", com "Mostrar" (vale para o documento, em memória).
 * Com Exibir › Mostrar conteúdo oculto ligado, tudo já aparece marcado e o aviso só conta.
 */

const labels = () => ({ comment: t("hidden.comment"), element: t("hidden.element"), char: t("hidden.char") });

function bannerText(n: number, shown: boolean): string {
  if (shown) return n === 1 ? t("hidden.shownOne") : t("hidden.shownMany", { n });
  return n === 1 ? t("hidden.bannerOne") : t("hidden.bannerMany", { n });
}

/**
 * Procura o oculto em `container` e põe o aviso em `banner`. `reveal` (preferência global ou
 * pedido anterior para este documento) mostra tudo já. Devolve quantos trechos achou.
 */
export function applyHiddenPolicy(
  container: HTMLElement,
  banner: HTMLElement,
  opts: { reveal: boolean; comments: CommentSink | null; source?: string; onReveal?: () => void },
): number {
  banner.hidden = true;
  banner.replaceChildren();
  const scan = scanHidden(container, opts.comments, opts.source);
  const n = hiddenTotal(scan);
  if (n === 0) return 0;
  const text = document.createElement("span");
  banner.append(text);
  if (opts.reveal) {
    revealHidden(container, scan, opts.comments, labels());
    text.textContent = bannerText(n, true);
  } else {
    text.textContent = bannerText(n, false);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "text";
    btn.textContent = t("hidden.show");
    btn.addEventListener("click", () => {
      revealHidden(container, scan, opts.comments, labels());
      text.textContent = bannerText(n, true);
      btn.remove();
      opts.onReveal?.();
    });
    banner.append(btn);
  }
  banner.hidden = false;
  return n;
}
