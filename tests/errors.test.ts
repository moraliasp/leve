import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEDUPE_MS, MAX_ERROR_CHARS, MIN_INTERVAL_MS, describeError, installErrorReporting } from "../src/errors";

const rejection = (reason: unknown): Event => {
  // jsdom não tem PromiseRejectionEvent: um Event com `reason` basta para o handler.
  const ev = new Event("unhandledrejection");
  Object.defineProperty(ev, "reason", { value: reason });
  return ev;
};
const scriptError = (msg: string): ErrorEvent => new ErrorEvent("error", { message: msg, error: new Error(msg) });

describe("installErrorReporting", () => {
  let report: ReturnType<typeof vi.fn<(msg: string) => void>>;
  let uninstall: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-25T12:00:00Z"));
    report = vi.fn<(msg: string) => void>();
    uninstall = installErrorReporting(report);
  });
  afterEach(() => {
    uninstall();
    vi.useRealTimers();
  });

  it("rejeição não tratada chama report com o texto de i18n", () => {
    window.dispatchEvent(rejection(new Error("falhou")));
    expect(report).toHaveBeenCalledWith("Erro inesperado: falhou");
  });

  it("erro de script no window chama report", () => {
    window.dispatchEvent(scriptError("quebrou"));
    expect(report).toHaveBeenCalledWith("Erro inesperado: quebrou");
  });

  it("erro de recurso (<img>) não chama report", () => {
    const img = document.createElement("img");
    document.body.append(img);
    img.dispatchEvent(new Event("error"));
    window.dispatchEvent(new Event("error"));
    expect(report).not.toHaveBeenCalled();
    img.remove();
  });

  it("ErrorEvent sem error e sem mensagem útil é ruído", () => {
    window.dispatchEvent(new ErrorEvent("error", { message: "ResizeObserver loop completed with undelivered notifications." }));
    window.dispatchEvent(new ErrorEvent("error", { message: "Script error." }));
    window.dispatchEvent(new ErrorEvent("error", { message: "  " }));
    expect(report).not.toHaveBeenCalled();
    // Sem `error` mas com mensagem de verdade ainda chega ao leitor.
    window.dispatchEvent(new ErrorEvent("error", { message: "x is not defined" }));
    expect(report).toHaveBeenCalledWith("Erro inesperado: x is not defined");
  });

  it("limita a frequência: um aviso a cada intervalo", () => {
    for (let i = 0; i < 10; i++) window.dispatchEvent(rejection(new Error(`e${i}`)));
    expect(report).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(MIN_INTERVAL_MS);
    window.dispatchEvent(rejection(new Error("depois")));
    expect(report).toHaveBeenCalledTimes(2);
    expect(report).toHaveBeenLastCalledWith("Erro inesperado: depois");
  });

  it("deduplica a mesma mensagem dentro da janela", () => {
    window.dispatchEvent(rejection(new Error("igual")));
    vi.advanceTimersByTime(MIN_INTERVAL_MS + 1);
    window.dispatchEvent(rejection(new Error("igual")));
    expect(report).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(DEDUPE_MS);
    window.dispatchEvent(rejection(new Error("igual")));
    expect(report).toHaveBeenCalledTimes(2);
  });

  it("trunca mensagem longa", () => {
    window.dispatchEvent(rejection(new Error("x".repeat(500))));
    expect(report.mock.calls[0][0]).toBe(`Erro inesperado: ${"x".repeat(MAX_ERROR_CHARS - 1)}…`);
  });
});

describe("describeError", () => {
  it("aceita string, objeto e valor sem JSON", () => {
    expect(describeError("texto\n  quebrado")).toBe("texto quebrado");
    expect(describeError({ code: 1 })).toBe('{"code":1}');
    expect(describeError(undefined)).toBe("undefined");
    const ciclo: Record<string, unknown> = {};
    ciclo.self = ciclo;
    expect(describeError(ciclo)).toBe("[object Object]");
  });
});
