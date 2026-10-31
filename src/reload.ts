/**
 * Uma execução de cada vez, a última vence: pedido durante uma execução só marca, e ao terminar
 * roda mais uma, que já vê o estado mais novo. Vários pedidos no meio caem nessa marca única.
 * `run` devolve `null` quando não há o que fazer. Rejeição de `run` segue para quem a trata
 * (a barra, por `installErrorReporting`); a marca roda mesmo assim.
 */
export function latestWins(run: () => Promise<unknown> | null): () => void {
  let running = false;
  let again = false;
  const request = (): void => {
    if (running) {
      again = true;
      return;
    }
    const started = run();
    if (!started) return;
    running = true;
    void started.finally(() => {
      running = false;
      if (again) {
        again = false;
        request();
      }
    });
  };
  return request;
}
