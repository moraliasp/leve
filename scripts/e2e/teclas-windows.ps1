# Teste de ponta a ponta no Windows: manda tecla ao app por SendInput, por scan code (como um teclado
# físico: o sistema traduz a tecla pelo layout ativo), e liga o layout. O WebDriver entrega a tecla
# direto à página e não passa pelo AcceleratorKeyPressed do WebView2 (src-tauri/src/accel.rs) nem pelo
# layout; este script passa (tests/e2e/teclas.ts chama; docs/decisoes.md, "Teste de ponta a ponta").
#   teclas-windows.ps1 foco            traz a janela do Leve para frente e clica no documento
#   teclas-windows.ps1 tecla ctrl+f us   acorde: modificadores (ctrl, shift, alt, altgr) e uma tecla; a
#                                      tecla é o caractere que o layout produz (`[`, `]`, `/`, letra)
#   teclas-windows.ps1 layout abnt2    us | abnt2 (pt-BR ABNT2, 00010416)
param(
  [Parameter(Mandatory = $true, Position = 0)][ValidateSet('foco', 'tecla', 'layout')][string]$Acao,
  [Parameter(Position = 1)][string]$Arg = '',
  # Layout em uso (só `tecla`): cada chamada é um processo novo, então quem chama diz qual é.
  [Parameter(Position = 2)][string]$Layout = 'us'
)
$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class Win {
  [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx, dy; public uint mouseData, dwFlags, time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort wVk, wScan; public uint dwFlags, time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Explicit)] public struct INPUTUNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public INPUTUNION u; }
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct GUITHREADINFO {
    public int cbSize; public uint flags; public IntPtr hwndActive, hwndFocus, hwndCapture, hwndMenuOwner, hwndMoveSize, hwndCaret; public RECT rcCaret;
  }

  [DllImport("user32.dll", SetLastError = true)] public static extern uint SendInput(uint n, INPUT[] inputs, int size);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool attach);
  [DllImport("user32.dll")] public static extern bool GetGUIThreadInfo(uint tid, ref GUITHREADINFO info);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr LoadKeyboardLayout(string klid, uint flags);
  [DllImport("user32.dll")] public static extern IntPtr GetKeyboardLayout(uint tid);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
}
'@

# Scan codes (conjunto 1) por posição física; `ext` marca as teclas estendidas (E0).
# Letras e dígitos são iguais nos dois layouts; a pontuação muda de lugar no ABNT2 (a tecla extra
# à esquerda do Shift direito, 0x73, é a da barra).
$letras = @{
  'q' = 0x10; 'w' = 0x11; 'e' = 0x12; 'r' = 0x13; 't' = 0x14; 'y' = 0x15; 'u' = 0x16; 'i' = 0x17; 'o' = 0x18; 'p' = 0x19
  'a' = 0x1E; 's' = 0x1F; 'd' = 0x20; 'f' = 0x21; 'g' = 0x22; 'h' = 0x23; 'j' = 0x24; 'k' = 0x25; 'l' = 0x26
  'z' = 0x2C; 'x' = 0x2D; 'c' = 0x2E; 'v' = 0x2F; 'b' = 0x30; 'n' = 0x31; 'm' = 0x32
  '1' = 0x02; '2' = 0x03; '3' = 0x04; '4' = 0x05; '5' = 0x06; '6' = 0x07; '7' = 0x08; '8' = 0x09; '9' = 0x0A; '0' = 0x0B
  'esc' = 0x01; 'enter' = 0x1C; 'space' = 0x39
}
$pontuacao = @{
  'us'   = @{ '[' = 0x1A; ']' = 0x1B; '/' = 0x35; ',' = 0x33; '.' = 0x34; '-' = 0x0C; '=' = 0x0D }
  'abnt2' = @{ '[' = 0x1B; ']' = 0x2B; '/' = 0x73; ',' = 0x33; '.' = 0x34; '-' = 0x0C; '=' = 0x0D }
}
$KLID = @{ 'us' = '00000409'; 'abnt2' = '00010416' }
$LANGID = @{ 'us' = 0x0409; 'abnt2' = 0x0416 }

function Texto([IntPtr]$h) {
  $c = New-Object System.Text.StringBuilder 256
  $t = New-Object System.Text.StringBuilder 256
  [void][Win]::GetClassName($h, $c, 256)
  [void][Win]::GetWindowText($h, $t, 256)
  "0x{0:X} classe='{1}' título='{2}'" -f [int64]$h, $c, $t
}

function JanelaLeve {
  $p = Get-Process -Name leve -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero } | Select-Object -First 1
  if (-not $p) { throw 'janela do Leve não encontrada (processo leve sem janela)' }
  $p.MainWindowHandle
}

function ThreadDe([IntPtr]$h) { $pid2 = 0; [Win]::GetWindowThreadProcessId($h, [ref]$pid2) }

# SetForegroundWindow só vale para quem está em primeiro plano; anexar a entrada ao thread de quem
# está contorna a restrição sem tocar uma tecla (um Alt avulso abriria a barra de menus).
function TrazerParaFrente([IntPtr]$h) {
  [void][Win]::ShowWindow($h, 9)
  $fg = [Win]::GetForegroundWindow()
  if ($fg -eq $h) { return }
  $eu = [Win]::GetCurrentThreadId()
  $outro = if ($fg -ne [IntPtr]::Zero) { ThreadDe $fg } else { 0 }
  $alvo = ThreadDe $h
  if ($outro -ne 0 -and $outro -ne $eu) { [void][Win]::AttachThreadInput($eu, $outro, $true) }
  if ($alvo -ne 0 -and $alvo -ne $eu) { [void][Win]::AttachThreadInput($eu, $alvo, $true) }
  [void][Win]::BringWindowToTop($h)
  [void][Win]::SetForegroundWindow($h)
  if ($outro -ne 0 -and $outro -ne $eu) { [void][Win]::AttachThreadInput($eu, $outro, $false) }
  if ($alvo -ne 0 -and $alvo -ne $eu) { [void][Win]::AttachThreadInput($eu, $alvo, $false) }
  for ($i = 0; $i -lt 20 -and [Win]::GetForegroundWindow() -ne $h; $i++) { Start-Sleep -Milliseconds 100 }
}

function Clicar([IntPtr]$h) {
  $r = New-Object Win+RECT
  [void][Win]::GetWindowRect($h, [ref]$r)
  $x = [int]($r.Left + ($r.Right - $r.Left) * 0.6)
  $y = [int]($r.Top + ($r.Bottom - $r.Top) * 0.5)
  [void][Win]::SetCursorPos($x, $y)
  Start-Sleep -Milliseconds 100
  [Win]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero) # botão esquerdo para baixo
  [Win]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero) # e para cima
  Start-Sleep -Milliseconds 200
}

function Tecla([int]$scan, [bool]$ext, [bool]$up) {
  $i = New-Object Win+INPUT
  $i.type = 1 # INPUT_KEYBOARD
  $i.u.ki.wVk = 0
  $i.u.ki.wScan = [uint16]$scan
  $f = 0x0008 # KEYEVENTF_SCANCODE: o sistema acha a tecla virtual pelo layout ativo
  if ($ext) { $f = $f -bor 0x0001 }
  if ($up) { $f = $f -bor 0x0002 }
  $i.u.ki.dwFlags = [uint32]$f
  $n = [Win]::SendInput(1, @($i), [System.Runtime.InteropServices.Marshal]::SizeOf([type][Win+INPUT]))
  if ($n -ne 1) { throw "SendInput falhou (erro $([System.Runtime.InteropServices.Marshal]::GetLastWin32Error()))" }
  Start-Sleep -Milliseconds 40
}

# Nome do modificador/tecla → (scan, estendida). AltGr = Alt direito (E0 38).
function Resolver([string]$nome, [string]$layout) {
  switch ($nome) {
    'ctrl'  { return @(0x1D, $false) }
    'shift' { return @(0x2A, $false) }
    'alt'   { return @(0x38, $false) }
    'altgr' { return @(0x38, $true) }
  }
  if ($letras.ContainsKey($nome)) { return @($letras[$nome], $false) }
  if ($pontuacao[$layout].ContainsKey($nome)) { return @($pontuacao[$layout][$nome], $false) }
  throw "tecla desconhecida: '$nome'"
}

switch ($Acao) {
  'foco' {
    $h = JanelaLeve
    TrazerParaFrente $h
    Clicar $h
    $fg = [Win]::GetForegroundWindow()
    Write-Output ("primeiro plano: " + (Texto $fg))
    $info = New-Object Win+GUITHREADINFO
    $info.cbSize = [System.Runtime.InteropServices.Marshal]::SizeOf([type][Win+GUITHREADINFO])
    [void][Win]::GetGUIThreadInfo((ThreadDe $fg), [ref]$info)
    Write-Output ("foco: " + (Texto $info.hwndFocus))
    if ($fg -ne $h) { throw 'a janela do Leve não ficou em primeiro plano' }
  }
  'layout' {
    if (-not $KLID.ContainsKey($Arg)) { throw "layout desconhecido: '$Arg'" }
    $h = JanelaLeve
    TrazerParaFrente $h
    $hkl = [Win]::LoadKeyboardLayout($KLID[$Arg], 0)
    if ($hkl -eq [IntPtr]::Zero) { throw "LoadKeyboardLayout($($KLID[$Arg])) falhou" }
    # O layout é por thread: o que recebe a tecla é o thread da janela com o foco (o WebView2 no
    # Leve), então o pedido vai ao que tem o foco, à janela ativa e à janela do app.
    $fg = [Win]::GetForegroundWindow()
    $tid = ThreadDe $fg
    $info = New-Object Win+GUITHREADINFO
    $info.cbSize = [System.Runtime.InteropServices.Marshal]::SizeOf([type][Win+GUITHREADINFO])
    [void][Win]::GetGUIThreadInfo($tid, [ref]$info)
    $alvos = @($info.hwndFocus, $info.hwndActive, $fg, $h) | Where-Object { $_ -ne [IntPtr]::Zero } | Select-Object -Unique
    foreach ($a in $alvos) { [void][Win]::PostMessage($a, 0x0050, [IntPtr]::Zero, $hkl) } # WM_INPUTLANGCHANGEREQUEST
    $esperado = $LANGID[$Arg]
    $ok = $false
    for ($i = 0; $i -lt 30 -and -not $ok; $i++) {
      Start-Sleep -Milliseconds 100
      $atual = [Win]::GetKeyboardLayout($tid).ToInt64()
      $ok = (($atual -band 0xFFFF) -eq $esperado)
    }
    $thFoco = if ($info.hwndFocus -ne [IntPtr]::Zero) { ThreadDe $info.hwndFocus } else { 0 }
    Write-Output ("layout pedido '{0}' hkl=0x{1:X}; thread da janela 0x{2:X}; thread do foco {3} layout=0x{4:X}" -f $Arg, $hkl.ToInt64(), [Win]::GetKeyboardLayout($tid).ToInt64(), $thFoco, [Win]::GetKeyboardLayout($thFoco).ToInt64())
    if (-not $ok) { throw "o layout '$Arg' não ficou ativo no thread do app" }
  }
  'tecla' {
    if (-not $Arg) { throw 'falta o acorde' }
    $layout = $Layout
    if (-not $pontuacao.ContainsKey($layout)) { throw "layout desconhecido: '$layout'" }
    $h = JanelaLeve
    TrazerParaFrente $h
    $partes = $Arg -split '\+'
    $teclas = @($partes | ForEach-Object { , (Resolver $_ $layout) })
    foreach ($t in $teclas) { Tecla $t[0] $t[1] $false }
    Start-Sleep -Milliseconds 40
    for ($i = $teclas.Count - 1; $i -ge 0; $i--) { Tecla $teclas[$i][0] $teclas[$i][1] $true }
    Start-Sleep -Milliseconds 300
    Write-Output "tecla $Arg (layout $layout)"
  }
}
