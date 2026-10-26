/**
 * Ícones de interface: Lucide (https://lucide.dev, licença ISC, ver THIRD_PARTY_NOTICES.md),
 * no estilo do Claude Code: traço fino, cantos arredondados, monocromático (`currentColor`).
 * Cada SVG é importado um a um, então só os usados entram no bundle.
 */
import panelLeft from "lucide-static/icons/panel-left.svg?raw";
import chevronLeft from "lucide-static/icons/chevron-left.svg?raw";
import chevronRight from "lucide-static/icons/chevron-right.svg?raw";
import chevronUp from "lucide-static/icons/chevron-up.svg?raw";
import chevronDown from "lucide-static/icons/chevron-down.svg?raw";
import sunMoon from "lucide-static/icons/sun-moon.svg?raw";
import x from "lucide-static/icons/x.svg?raw";
import copy from "lucide-static/icons/copy.svg?raw";
import check from "lucide-static/icons/check.svg?raw";
import info from "lucide-static/icons/info.svg?raw";
import lightbulb from "lucide-static/icons/lightbulb.svg?raw";
import messageSquareWarning from "lucide-static/icons/message-square-warning.svg?raw";
import triangleAlert from "lucide-static/icons/triangle-alert.svg?raw";
import octagonAlert from "lucide-static/icons/octagon-alert.svg?raw";
import imageOff from "lucide-static/icons/image-off.svg?raw";
import globeLock from "lucide-static/icons/globe-lock.svg?raw";

const RAW = {
  "panel-left": panelLeft,
  "chevron-left": chevronLeft,
  "chevron-right": chevronRight,
  "chevron-up": chevronUp,
  "chevron-down": chevronDown,
  "sun-moon": sunMoon,
  x,
  copy,
  check,
  info,
  lightbulb,
  "message-square-warning": messageSquareWarning,
  "triangle-alert": triangleAlert,
  "octagon-alert": octagonAlert,
  "image-off": imageOff,
  "globe-lock": globeLock,
} as const;

export type IconName = keyof typeof RAW;

/** Traço único em todo o app: um pouco mais fino que o padrão do Lucide (2). */
const STROKE = "1.75";

/** SVG pronto para `innerHTML`: sem comentário e classe, tamanho e traço do app, `aria-hidden`. */
export function icon(name: IconName, size = 16): string {
  return RAW[name]
    .replace(/<!--[\s\S]*?-->\s*/, "")
    .replace(/\s+class="[^"]*"/, "")
    .replace(/width="24"/, `width="${size}"`)
    .replace(/height="24"/, `height="${size}"`)
    .replace(/stroke-width="2"/, `stroke-width="${STROKE}"`)
    .replace("<svg", '<svg aria-hidden="true" focusable="false"')
    .replace(/\s*\n\s*/g, " ")
    .trim();
}

/** Mesmo SVG como `url(data:…)` para `mask` em CSS (traço preto vira a área visível). */
export function iconMask(name: IconName): string {
  return `url("data:image/svg+xml,${encodeURIComponent(icon(name, 24))}")`;
}

/** Ícones usados só por CSS (alerts, callouts, imagem ausente) viram variáveis em `:root`. */
const CSS_VARS: Record<string, IconName> = {
  "--icon-note": "info",
  "--icon-tip": "lightbulb",
  "--icon-important": "message-square-warning",
  "--icon-warning": "triangle-alert",
  "--icon-caution": "octagon-alert",
  "--icon-fold": "chevron-down",
  "--icon-image-off": "image-off",
  "--icon-remote": "globe-lock",
};

/** Preenche `<span data-icon="nome">` do HTML estático e publica as variáveis de máscara. */
export function installIcons(root: ParentNode = document): void {
  for (const el of root.querySelectorAll<HTMLElement>("[data-icon]")) {
    el.outerHTML = icon(el.dataset.icon as IconName, Number(el.dataset.size ?? 16));
  }
  const style = document.documentElement.style;
  for (const [prop, name] of Object.entries(CSS_VARS)) style.setProperty(prop, iconMask(name));
}

/** As mesmas variáveis de máscara como regra CSS (`:root{--icon-note:url(…);…}`), para o HTML exportado. */
export function iconCssVars(): string {
  const decls = Object.entries(CSS_VARS).map(([prop, name]) => `${prop}:${iconMask(name)}`);
  return `:root{${decls.join(";")}}`;
}
