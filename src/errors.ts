import { t } from "./i18n";

/**
 * Erro não tratado do frontend (promessa rejeitada sem `catch`, exceção em callback) vira aviso
 * na barra, não só console. Erro de recurso (`<img>`, `<script>` que não carregou) fica de fora:
 * imagem já vira `.img-missing` no documento.
 */

/** Tamanho máximo da mensagem do erro no aviso. */
export const MAX_ERROR_CHARS = 160;
/** Intervalo mínimo entre avisos: um laço de erros não entope a barra. */
export const MIN_INTERVAL_MS = 3000;
/** A mesma mensagem não volta a aparecer dentro desta janela. */
export const DEDUPE_MS = 30000;

export function describeError(reason: unknown): string {
  let msg: string;
  if (reason instanceof Error) msg = reason.message || reason.name;
  else if (typeof reason === "string") msg = reason;
  else {
    try {
      msg = JSON.stringify(reason) ?? String(reason);
    } catch {
      msg = String(reason);
    }
  }
  msg = msg.replace(/\s+/g, " ").trim();
  return msg.length > MAX_ERROR_CHARS ? `${msg.slice(0, MAX_ERROR_CHARS - 1)}…` : msg;
}

/** Registra os handlers globais e devolve a função que os remove (testes). */
export function installErrorReporting(report: (msg: string) => void, win: Window = window): () => void {
  let lastAt = -Infinity;
  let lastMsg = "";

  const show = (reason: unknown): void => {
    const detail = describeError(reason);
    const now = Date.now();
    // Mesma mensagem não repete por um tempo; mensagem nova espera o intervalo mínimo.
    if (now - lastAt < MIN_INTERVAL_MS || (detail === lastMsg && now - lastAt < DEDUPE_MS)) return;
    lastAt = now;
    lastMsg = detail;
    report(t("app.unexpectedError", { error: detail }));
  };

  const onRejection = (ev: PromiseRejectionEvent): void => {
    // O WebView já registra no console (o console.error original fica como está).
    show(ev.reason);
  };
  const onError = (ev: Event): void => {
    // Erro de script chega como ErrorEvent; erro de recurso é Event simples, disparado no elemento
    // e sem bolha (só chegaria aqui em captura, que não usamos).
    if (!(ev instanceof ErrorEvent)) return;
    show(ev.error ?? ev.message);
  };

  win.addEventListener("unhandledrejection", onRejection);
  win.addEventListener("error", onError);
  return () => {
    win.removeEventListener("unhandledrejection", onRejection);
    win.removeEventListener("error", onError);
  };
}
