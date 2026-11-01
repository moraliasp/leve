#!/usr/bin/env bash
# Teste de ponta a ponta no Linux (sob Xvfb): manda tecla ao app pelo servidor X, como um teclado
# físico, e troca o layout. O WebDriver entrega a tecla direto à página e não passa pelos aceleradores
# do GTK nem pelo layout; este script passa (tests/e2e/teclas.ts chama; docs/decisoes.md, "Teste de
# ponta a ponta"). Usa XTEST (`xdotool key`, sem `--window`): a tecla vai a quem tem o foco do X.
#   teclas-linux.sh foco            leva o foco do X à janela do Leve
#   teclas-linux.sh tecla ctrl+f    acorde: modificadores (ctrl, shift, alt, altgr) e uma tecla; a
#                                   tecla é o caractere que o layout produz (`[`, `]`, `/`, letra)
#   teclas-linux.sh layout abnt2    us | abnt2 (`setxkbmap br abnt2`)
set -euo pipefail

acao="${1:?uso: teclas-linux.sh foco|tecla|layout [argumento]}"
arg="${2:-}"

# Janela visível do processo `leve`; sem pid, a que tem "leve" na classe ou no nome.
janela() {
  local pid wid=""
  pid="$(pgrep -nx leve || true)"
  if [ -n "$pid" ]; then
    wid="$(xdotool search --onlyvisible --pid "$pid" 2>/dev/null | head -n 1 || true)"
  fi
  if [ -z "$wid" ]; then
    wid="$(xdotool search --onlyvisible --class leve 2>/dev/null | head -n 1 || true)"
  fi
  if [ -z "$wid" ]; then
    wid="$(xdotool search --onlyvisible --name 'Leve|exemplo' 2>/dev/null | head -n 1 || true)"
  fi
  [ -n "$wid" ] || { echo "janela do Leve não encontrada (pid='$pid')" >&2; exit 1; }
  echo "$wid"
}

# Sem gerenciador de janelas não há `windowactivate` (EWMH): o foco do X vai direto à janela.
focar() {
  local wid
  wid="$(janela)"
  xdotool windowactivate --sync "$wid" 2>/dev/null || true
  xdotool windowfocus --sync "$wid" 2>/dev/null || xdotool windowfocus "$wid"
  echo "janela=$wid foco=$(xdotool getwindowfocus 2>/dev/null || echo '?')"
}

# `ctrl+shift+]` → `ctrl+shift+bracketright`: os nomes de keysym que o xdotool entende.
keysym() {
  case "$1" in
    ctrl | control) echo ctrl ;;
    shift) echo shift ;;
    alt) echo alt ;;
    altgr) echo ISO_Level3_Shift ;;
    '[') echo bracketleft ;;
    ']') echo bracketright ;;
    '/') echo slash ;;
    '?') echo question ;;
    *) echo "$1" ;;
  esac
}

case "$acao" in
  foco)
    focar
    ;;
  tecla)
    [ -n "$arg" ] || { echo "falta o acorde" >&2; exit 1; }
    IFS='+' read -r -a partes <<< "$arg"
    acorde=""
    for p in "${partes[@]}"; do
      acorde="${acorde:+$acorde+}$(keysym "$p")"
    done
    focar > /dev/null
    xdotool key --delay 60 "$acorde"
    # Dá tempo ao GTK e ao WebKit de processar antes da conferência seguinte.
    sleep 0.3
    echo "tecla $acorde"
    ;;
  layout)
    case "$arg" in
      us) setxkbmap us ;;
      abnt2) setxkbmap br abnt2 ;;
      *) echo "layout desconhecido: $arg" >&2; exit 1 ;;
    esac
    # O GDK relê o mapa do teclado pelo evento do X, no laço principal do app.
    sleep 0.7
    echo "layout $arg: $(setxkbmap -query | tr '\n' ' ')"
    ;;
  *)
    echo "ação desconhecida: $acao" >&2
    exit 1
    ;;
esac
