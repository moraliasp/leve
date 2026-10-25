import { t } from "./i18n";
/**
 * Acessibilidade de teclado no WebKit do macOS. Por padrão o Tab só passa por campos de texto: botões
 * e links ficam de fora a menos que o usuário ligue "Navegação por teclado" no sistema. Um `tabindex`
 * explícito faz o WebKit incluí-los, então todo controle do app ganha `tabindex="0"`, inclusive os
 * criados depois (abas, sumário, botão de copiar, recentes) via MutationObserver.
 */

/** Controles que devem entrar no Tab. Quem gerencia o próprio foco (abas) já define `tabindex`. */
const TABBABLE = "button:not([tabindex]), a[href]:not([tabindex]), summary:not([tabindex])";

export function makeTabbable(root: ParentNode): void {
  for (const el of root.querySelectorAll<HTMLElement>(TABBABLE)) el.tabIndex = 0;
}

/** Aplica agora e a cada nó novo dentro de `root`. */
export function keepTabbable(root: HTMLElement): MutationObserver {
  makeTabbable(root);
  const obs = new MutationObserver((records) => {
    for (const r of records)
      for (const n of r.addedNodes) {
        if (!(n instanceof HTMLElement)) continue;
        if (n.matches(TABBABLE)) n.tabIndex = 0;
        makeTabbable(n);
      }
  });
  obs.observe(root, { childList: true, subtree: true });
  return obs;
}

/** Texto da contagem da busca para leitor de tela ("3/10" seria lido como "3 barra 10"). */
export function findAnnouncement(index: number, total: number): string {
  if (total === 0) return t("find.none");
  return total === 1 ? t("find.one") : t("find.nth", { i: index + 1, n: total });
}

/** Próxima aba para as setas do padrão ARIA de abas (circular), Home e End. */
export function tabKeyTarget(key: string, idx: number, count: number): number | null {
  if (count === 0) return null;
  switch (key) {
    case "ArrowRight":
      return (idx + 1) % count;
    case "ArrowLeft":
      return (idx - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}
