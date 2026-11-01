// Windows: imprime o trecho de configuração do Tauri (para `tauri build --config`) que acrescenta a
// porta de depuração aos argumentos do WebView2 nas janelas do app. Só o build do teste usa isto.
// O WebView2 ignora a WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS do msedgedriver quando o app define os
// próprios argumentos, e o wry sempre define: sem isto o msedgedriver não acha o DevToolsActivePort.
// Os argumentos-base são os que o wry usa por padrão (wry `webview2/mod.rs`, `create_environment`).
import { readFileSync } from "node:fs";
import { join } from "node:path";

const conf = JSON.parse(readFileSync(join(import.meta.dirname, "../../src-tauri/tauri.conf.json"), "utf8"));
const BASE = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --autoplay-policy=no-user-gesture-required";
const windows = conf.app.windows.map((w) => ({ ...w, additionalBrowserArgs: `${BASE} --remote-debugging-port=0` }));
process.stdout.write(JSON.stringify({ app: { windows } }));
