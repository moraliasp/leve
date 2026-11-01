import { join, resolve } from "node:path";

export const RAIZ = resolve(import.meta.dirname, "../..");
export const WIN = process.platform === "win32";
export const BINARIO = process.env.LEVE_BIN ?? join(RAIZ, "src-tauri", "target", "debug", WIN ? "leve.exe" : "leve");
export const EXEMPLO = join(RAIZ, "docs", "exemplo.md");
