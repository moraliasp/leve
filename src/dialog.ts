import { $ } from "./dom";

/**
 * Confirmação no próprio app (`#confirm`, mesmo estilo do Sobre): Esc e "Cancelar" devolvem
 * falso; só o botão de ação devolve verdadeiro. Igual no app e no navegador.
 */
export function confirmDialog(title: string, message: string, ok: string): Promise<boolean> {
  const dlg = $<HTMLDialogElement>("confirm");
  $("confirm-title").textContent = title;
  $("confirm-text").textContent = message;
  $("confirm-ok").textContent = ok;
  dlg.returnValue = "";
  return new Promise((resolve) => {
    dlg.addEventListener("close", () => resolve(dlg.returnValue === "ok"), { once: true });
    dlg.showModal();
  });
}
