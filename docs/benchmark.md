# Benchmark do Leve

Quanto tempo o Leve leva para abrir um documento, quanta memória ocupa e quanto pesa. Os números saem de um script (`scripts/bench.mjs`) que qualquer pessoa pode rodar de novo. O método está abaixo, e o porquê de cada escolha está em [`decisoes.md`](decisoes.md), no registro "Benchmark reproduzível, com gancho opt-in".

## Resultado (2026-10-27)

**Máquina:** Apple M5 Pro, 48 GB, macOS 26.7.2 (25G325). **App:** Leve 0.3.0, commit `0f14986`, o `Leve.app` universal de dentro do `Leve_0.3.0_universal.dmg` da pre-release [v0.3.0-rc.1](https://github.com/moraliasp/leve/releases/tag/v0.3.0-rc.1) (o mesmo build que vai para quem baixa).

São 10 execuções por documento, mais uma de aquecimento que é descartada. Cada célula traz a **mediana / p90**. A memória é lida 10 s depois do layout. Nesta rodada a janela ficou à vista em todas as execuções (o 1º quadro chegou em 10 de 10).

| Documento | Abertura até o layout (ms) | Até o 1º quadro (ms) | `leve:render` (ms) | `leve:layout` (ms) | Memória total (MB) | App | WebContent | GPU | Networking | RSS somado (MB) |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| `docs/exemplo.md` (4,2 kB) | 647 / 683 | 686 / 723 | 22 / 24 | 72 / 78 | 171,1 / 189,2 | 33,0 / 33,3 | 110,4 / 128,6 | 22,9 / 23,2 | 4,7 / 4,8 | 301,2 / 307,1 |
| sintético 1 MB (1.001.174 B) | 1025 / 1038 | 1067 / 1079 | 216 / 219 | 451 / 513 | 275,7 / 278,5 | 31,9 / 32,3 | 219,5 / 222,8 | 19,3 / 19,5 | 4,7 / 4,8 | 704,7 / 708,2 |
| sintético 5 MB (5.001.860 B) | 2440 / 2956 | 2490 / 2995 | 795 / 1134 | 1857 / 2374 | 772,8 / 910,2 | 40,9 / 41,9 | 710,9 / 844,5 | 19,1 / 19,3 | 4,7 / 4,7 | 1.333,1 / 1.346,4 |

| Tamanho (release v0.3.0-rc.1) | Bytes | MB |
|---|--:|--:|
| `Leve.app` universal (soma dos arquivos, medido aqui) | 9.980.793 | 10,0 |
| `Leve_0.3.0_universal.dmg` | 6.464.452 | 6,5 |
| `Leve_0.3.0_x64-setup.exe` | 2.822.592 | 2,8 |
| `Leve_0.3.0_x64_en-US.msi` | 3.395.584 | 3,4 |
| `Leve_0.3.0_amd64.deb` | 4.241.134 | 4,2 |
| `Leve_0.3.0_amd64.AppImage` (leva WebKitGTK e GTK dentro) | 82.737.656 | 82,7 |

Contra a 0.2.0, o `.dmg` universal caiu de 8,0 para 6,5 MB, o `setup.exe` de 3,6 para 2,8 MB e o `.msi` de 4,2 para 3,4 MB (Mermaid sem ELK e TLS do sistema no atualizador, ver `decisoes.md`).

### Rodada anterior (0.2.0, 2026-10-26)

Build local aarch64 (`0ca42eb`), não universal, e com a janela coberta na maior parte das execuções, então **não se compara direto** com a tabela acima: o binário é outro e janela coberta não pinta, o que reduz a memória do WebContent. Ficam aqui para histórico.

| Documento | Abertura até o layout (ms) | Até o 1º quadro (ms) | `leve:render` (ms) | `leve:layout` (ms) | Memória total (MB) | App | WebContent | GPU | Networking | RSS somado (MB) |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| `docs/exemplo.md` (4,2 kB) | 579 / 651 | — (0/10) | 22 / 25 | 67 / 75 | 132,7 / 133,2 | 30,5 / 30,9 | 78,4 / 79,0 | 18,9 / 19,1 | 4,7 / 4,8 | 293,2 / 293,8 |
| sintético 1 MB (1.001.174 B) | 1001 / 1175 | 1091 / 1208 (3/10) | 220 / 286 | 455 / 557 | 233,7 / 273,3 | 30,2 / 32,0 | 180,7 / 218,5 | 17,7 / 19,4 | 4,8 / 4,8 | 684,5 / 703,5 |
| sintético 5 MB (5.001.860 B) | 2779 / 3720 | 2811 / 4631 (9/10) | 937 / 1321 | 2142 / 2946 | 612,6 / 907,5 | 40,9 / 41,4 | 551,1 / 843,4 | 19,2 / 20,4 | 4,8 / 5,5 | 1.197,1 / 1.342,7 |

### Como ler

- **Abertura até o layout:** vai do `open` até o fim do `leve:layout` do documento pedido. Nesse ponto o documento já foi renderizado, sanitizado, posto no DOM e teve o layout calculado (o `applyPending` lê posições). É o número principal.
- **Até o 1º quadro:** o primeiro `requestAnimationFrame` depois do layout. O WebKit não pinta janela coberta por outras; na rodada da 0.2.0 a máquina estava em uso e o quadro só chegou nas execuções com a janela à vista (entre parênteses, quantas). Ele chega 30 a 50 ms depois do layout.
- **Memória total:** soma do `phys_footprint` (o "Memória" do Monitor de Atividade) do processo do app e dos processos do WebKit atribuídos a ele. O RSS somado conta mais de uma vez as páginas compartilhadas do WebKit e serve só de referência.
- O documento de 5 MB passa de 2 MiB e abre em modo documento grande: sem links automáticos, sem realce e com sumário até h2 (`src/limits.ts`). O de 1 MB abre no modo normal, e o realce dele continua em segundo plano depois do layout.
- **A memória depende de a janela estar à vista e do realce em segundo plano.** Nesta rodada a janela ficou à vista em todas as execuções, por isso `docs/exemplo.md` deu 171 MB (na 0.2.0, com a janela coberta, 133 MB) e o WebContent sobe junto. No 1 MB, uma execução em dez leu 550 MB (causa não investigada; a mediana e o p90 não a mostram). No 5 MB a memória se divide em dois grupos, ~600 MB e ~890 MB, também sem causa confirmada. Os números não representam o pior caso.
- Os 171,1 MB de `docs/exemplo.md` não se comparam direto com os 134 MB de "Modo documento grande" (`decisoes.md`): aqui o total soma app, WebContent, GPU e Networking (o WebContent sozinho dá 110,4 MB), e lá o registro é do WebContent sozinho, medido à mão por outro método.

## Método

`node scripts/bench.mjs [--runs 10] [--warmup 1] [--settle 10000] [--app <Leve.app>] [--json <arquivo>]`, depois de `pnpm tauri build`. Só no macOS.

1. **Documentos.** `docs/exemplo.md` do repositório, mais dois gerados pelo script com semente fixa (`generateDoc` em `scripts/bench-lib.mjs`, determinístico): 1.000.000 e 5.000.000 bytes, ou um pouco acima. A mistura imita um documento técnico: títulos h1 a h4, parágrafos com URL solta, listas, tabelas, citações e ~10% de blocos `ts`, sem imagem, Mermaid nem matemática.
2. **Abertura.** Cada execução é um processo novo: `open -n -F --env LEVE_BENCH=1 --env HOME=<tmp> --env CFFIXED_USER_HOME=<tmp> --stdout <tmp>/log -a Leve.app <doc>`. O arquivo chega pelo LaunchServices (`RunEvent::Opened`), como num duplo-clique, e o perfil começa vazio (sem abas salvas, sem Recentes, janela no tamanho padrão). O cache de disco do sistema fica quente: não se roda `purge`, que pede `sudo`. Por isso a primeira execução de cada documento é descartada como aquecimento. "A frio" quer dizer processo e perfil novos, não disco frio.
3. **Marco.** Com `LEVE_BENCH=1`, o app imprime no stdout uma linha `LEVE_BENCH {json}` ao fim do layout e outra no primeiro quadro (`src/bench.ts`, `bench_report` em `src-tauri/src/bench.rs`), com o relógio de parede. O script subtrai o instante em que chamou o `open`. Sem a variável, o gancho não faz nada.
4. **Memória.** 10 s depois do layout, o script soma o `footprint -p <pid>` do processo principal e dos processos `com.apple.WebKit.WebContent`, `.GPU` e `.Networking` cujo processo responsável é o app. No macOS esses três são serviços XPC filhos do launchd (ppid 1), não do app. O kernel guarda o "processo responsável" de cada um, e é por ele que o Monitor de Atividade os agrupa sob o app. O script o lê com `scripts/bench-responsavel.swift` (`responsibility_get_pid_responsible_for_pid`), compilado numa pasta temporária. Só leitura.
5. **Fim de cada execução.** `SIGTERM` no app, espera os processos do WebKit saírem e apaga o perfil temporário. O script recusa rodar com outro Leve aberto, porque a instância única mandaria o arquivo para ele. No fim, o socket da instância única (`/tmp/br_com_moralia_leve_si.sock`) volta ao estado em que estava.
6. **Estatística.** Mediana e p90 pelo posto mais próximo (sempre um valor medido), em `scripts/bench-lib.mjs`, com testes em `tests/bench.test.ts`.

Não usa rede, não envia tecla nem clique e não grava fora da pasta temporária, que é apagada no fim. O perfil do Leve instalado na máquina não é lido nem tocado: conferido com `find -newer` nas pastas `~/Library/{WebKit,Application Support,Caches}/br.com.moralia.leve` depois da rodada.

## O que não foi medido

- **Windows e Intel.** O script só roda no macOS em Apple silicon. No Windows, os processos `msedgewebview2.exe` são descendentes do app na árvore de processos comum, e a atribuição seria pelo processo pai. Falta escrever e rodar numa máquina Windows.
- **Disco frio.** Precisaria de `sudo purge` antes de cada execução.
- **Outros visualizadores.** Abertura e memória só do Leve: não baixamos nem executamos binários de terceiros. A comparação do README é só do tamanho dos instaladores publicados no GitHub.
- **Pior caso de memória.** O realce do documento de 1 MB e a janela sempre à vista mudam o número (ver "Como ler"). Uma rodada com a máquina parada e a janela na frente daria números mais altos e mais estáveis.
