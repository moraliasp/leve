// @ts-expect-error sem o pacote @types/node
import process from "node:process";
import { describe, expect, it } from "vitest";
import { latestWins } from "../src/reload";

/** `run` controlável: cada chamada fica pendente até `finish()`. */
function setup(): { request: () => void; runs: () => number; finish: () => Promise<void> } {
  const pending: (() => void)[] = [];
  let runs = 0;
  const request = latestWins(() => {
    runs++;
    return new Promise<void>((resolve) => pending.push(resolve));
  });
  return {
    request,
    runs: () => runs,
    finish: async () => {
      pending.shift()?.();
      await new Promise((r) => setTimeout(r));
    },
  };
}

describe("uma de cada vez, a última vence", () => {
  it("pedido livre roda na hora", () => {
    const s = setup();
    s.request();
    expect(s.runs()).toBe(1);
  });

  it("pedidos durante a execução viram uma só, depois dela", async () => {
    const s = setup();
    s.request();
    s.request();
    s.request();
    s.request();
    expect(s.runs()).toBe(1);
    await s.finish();
    expect(s.runs()).toBe(2);
    await s.finish();
    expect(s.runs()).toBe(2);
  });

  it("sem pedido no meio, nada roda depois", async () => {
    const s = setup();
    s.request();
    await s.finish();
    expect(s.runs()).toBe(1);
    s.request();
    expect(s.runs()).toBe(2);
  });

  it("`null` não ocupa a vez", () => {
    let runs = 0;
    const request = latestWins(() => {
      runs++;
      return null;
    });
    request();
    request();
    expect(runs).toBe(2);
  });

  it("marca feita e nada a fazer ao terminar: para", async () => {
    let finish = (): void => {};
    let runs = 0;
    let doc = true;
    const request = latestWins(() => {
      runs++;
      return doc ? new Promise<void>((r) => (finish = r)) : null;
    });
    request();
    request();
    doc = false;
    finish();
    await new Promise((r) => setTimeout(r));
    expect(runs).toBe(2);
  });

  it("depois de uma falha, a marca roda e a fila continua", async () => {
    const rejected: unknown[] = [];
    const onRejection = (e: unknown): void => {
      rejected.push(e);
    };
    process.on("unhandledRejection", onRejection);
    let runs = 0;
    let fail = (_: Error): void => {};
    const request = latestWins(() => {
      runs++;
      return runs === 1 ? new Promise<void>((_, reject) => (fail = reject)) : Promise.resolve();
    });
    request();
    request();
    fail(new Error("leitura"));
    await new Promise((r) => setTimeout(r));
    process.off("unhandledRejection", onRejection);
    expect(runs).toBe(2);
    expect(rejected).toHaveLength(1);
  });
});
