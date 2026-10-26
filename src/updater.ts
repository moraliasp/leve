/**
 * Atualização pelo `tauri-plugin-updater`: o app lê o `latest.json` da última release do GitHub
 * (endpoint em tauri.conf.json), confere a assinatura do pacote com a chave pública embutida, baixa,
 * instala e reinicia. Só procura quando o leitor pede (menu, Sobre, Preferências) ou, com
 * "Procurar atualizações uma vez por dia" ligado, no máximo uma vez a cada 24 h. Por quê:
 * docs/decisoes.md, "Atualização pela release do GitHub".
 */
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { t } from "./i18n";
import { PREF_KEYS, boolPref } from "./prefs";

/** Quando foi a última checagem automática (dado, não preferência: fora de "Restaurar padrões"). */
const CHECKED_KEY = "leve.updateChecked";
export const DAY_MS = 24 * 60 * 60 * 1000;

export interface UpdateUi {
  flash: (msg: string, isError?: boolean, sticky?: boolean) => void;
  confirm: (title: string, message: string, ok: string) => Promise<boolean>;
}

let running = false;

/** Hora de procurar de novo? Checagem diária ligada e 24 h desde a última (ou relógio voltou). */
export function dailyCheckDue(now: number, last: number | null, enabled: boolean): boolean {
  if (!enabled) return false;
  if (last === null || !Number.isFinite(last)) return true;
  return now - last >= DAY_MS || now < last;
}

/**
 * Procura, pergunta e instala. `manual`: o leitor pediu, então "já está atualizado" e erros
 * aparecem; na checagem diária só aparece o diálogo quando há versão nova.
 */
export async function checkForUpdates(ui: UpdateUi, manual: boolean, current: string): Promise<void> {
  if (running) return;
  running = true;
  try {
    if (manual) ui.flash(t("update.checking"), false, true);
    let update: Update | null;
    try {
      update = await check();
    } catch (e) {
      if (manual) ui.flash(t("update.failed", { error: String(e) }), true);
      else console.warn("updater:", e);
      return;
    } finally {
      localStorage.setItem(CHECKED_KEY, String(Date.now()));
    }
    if (!update) {
      if (manual) ui.flash(t("update.upToDate", { version: current }));
      return;
    }
    if (manual) ui.flash("");
    const ok = await ui.confirm(
      t("update.availableTitle"),
      t("update.availableText", { version: update.version, current }),
      t("update.install"),
    );
    if (!ok) return;
    let total = 0;
    let done = 0;
    try {
      await update.downloadAndInstall((ev) => {
        if (ev.event === "Started") total = ev.data.contentLength ?? 0;
        else if (ev.event === "Progress") {
          done += ev.data.chunkLength;
          const progress = total ? `${Math.min(100, Math.round((done / total) * 100))} %` : "";
          ui.flash(t("update.downloading", { progress }), false, true);
        } else if (ev.event === "Finished") ui.flash(t("update.installing"), false, true);
      });
    } catch (e) {
      ui.flash(t("update.failed", { error: String(e) }), true);
      return;
    }
    // No Windows o instalador já fechou o app; no macOS a troca do bundle está feita.
    await relaunch();
  } finally {
    running = false;
  }
}

/** Checagem diária: na abertura e a cada hora com o app aberto, se a preferência estiver ligada. */
export function maybeDailyCheck(ui: UpdateUi, current: string): void {
  const raw = localStorage.getItem(CHECKED_KEY);
  const last = raw === null ? null : Number(raw);
  if (dailyCheckDue(Date.now(), last, boolPref(PREF_KEYS.autoUpdate, false))) void checkForUpdates(ui, false, current);
}
