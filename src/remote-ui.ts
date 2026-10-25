import { PREF_KEYS } from "./prefs";
import { remoteHost, restoreRemote } from "./remote";
import { t } from "./i18n";

/**
 * Interface da política de conteúdo remoto (a política em si está em `remote.ts`, dentro do
 * sanitize). Cada imagem bloqueada vira um botão "Imagem remota bloqueada · carregar" que libera
 * só ela; o aviso no topo conta o que falta e oferece carregar tudo neste documento. Com a
 * preferência global ligada (Exibir › Carregar imagens remotas), nada é bloqueado.
 */

export const REMOTE_PREF_KEY = PREF_KEYS.remote;

export function remotePrefEnabled(): boolean {
  return localStorage.getItem(REMOTE_PREF_KEY) === "1";
}

export function setRemotePref(on: boolean): void {
  localStorage.setItem(REMOTE_PREF_KEY, on ? "1" : "0");
}

export interface RemoteHooks {
  /** Chamado quando uma imagem volta a ter `src`: quem chama vigia o erro de carga. */
  watch?: (img: HTMLImageElement, url: string) => void;
}

/** Devolve os atributos de um elemento bloqueado e tira o placeholder dele. */
export function loadRemote(el: HTMLElement, hooks: RemoteHooks = {}): void {
  const url = el.dataset.remoteSrc ?? el.dataset.remoteSrcset ?? "";
  restoreRemote(el);
  el.classList.remove("remote-hidden");
  const ph = el.nextElementSibling;
  if (ph instanceof HTMLElement && ph.classList.contains("img-remote")) ph.remove();
  if (el instanceof HTMLImageElement) hooks.watch?.(el, url);
}

/** Libera tudo que está bloqueado no contêiner. */
export function allowRemote(container: HTMLElement, hooks: RemoteHooks = {}): void {
  for (const el of container.querySelectorAll<HTMLElement>("[data-remote]")) loadRemote(el, hooks);
  container.querySelectorAll(".img-remote").forEach((p) => p.remove());
}

export function blockedCount(container: HTMLElement): number {
  return container.querySelectorAll("[data-remote]").length;
}

function bannerText(n: number): string {
  return n === 1 ? t("remote.bannerOne") : t("remote.bannerMany", { n });
}

/**
 * Marca o que o sanitize bloqueou: placeholder clicável por imagem e aviso no topo com
 * "Carregar imagens remotas neste documento". `allowAll` (preferência global ou pedido anterior
 * para este documento) libera tudo de uma vez. Devolve quantos recursos ficaram bloqueados.
 */
export function applyRemotePolicy(
  container: HTMLElement,
  banner: HTMLElement,
  opts: { allowAll: boolean; onAllowAll?: () => void } & RemoteHooks,
): number {
  banner.hidden = true;
  banner.replaceChildren();
  if (blockedCount(container) === 0) return 0;
  if (opts.allowAll) {
    allowRemote(container, opts);
    return 0;
  }
  const text = document.createElement("span");
  const refresh = (): void => {
    const n = blockedCount(container);
    if (n === 0) banner.hidden = true;
    else text.textContent = bannerText(n);
  };
  for (const img of container.querySelectorAll<HTMLImageElement>("img[data-remote-src], img[data-remote-srcset]")) {
    const url = img.dataset.remoteSrc ?? img.dataset.remoteSrcset ?? "";
    const host = remoteHost(url);
    const ph = document.createElement("button");
    ph.type = "button";
    ph.className = "img-remote";
    ph.title = t("remote.placeholderTitle", { host, url });
    ph.setAttribute("aria-label", t("remote.placeholderLabel", { alt: img.alt ? `, ${img.alt}` : "", host }));
    const label = document.createElement("span");
    label.textContent = t("remote.placeholder");
    const code = document.createElement("code");
    code.textContent = host;
    ph.append(label, code);
    ph.addEventListener("click", () => {
      loadRemote(img, opts);
      refresh();
    });
    img.classList.add("remote-hidden");
    img.after(ph);
  }
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "text";
  btn.textContent = t("remote.loadAll");
  btn.addEventListener("click", () => {
    allowRemote(container, opts);
    banner.hidden = true;
    opts.onAllowAll?.();
  });
  banner.append(text, btn);
  refresh();
  banner.hidden = false;
  return blockedCount(container);
}
