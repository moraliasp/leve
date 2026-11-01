# Instalar o Leve

Os instaladores ainda saem sem assinatura (macOS até a Moralia ter conta Apple Developer própria; Windows sem certificado), então o sistema avisa na primeira abertura. É esperado e acontece uma vez. No Linux não há aviso de sistema: a origem se confere pelo `SHA256SUMS.txt` e pela attestation da release.

## Por gerenciador de pacotes

Homebrew já publicado (tap próprio, [`moraliasp/homebrew-tap`](https://github.com/moraliasp/homebrew-tap)). winget em breve: o pacote `Moralia.Leve` está em revisão no `microsoft/winget-pkgs`, e a linha abaixo só funciona depois de aceito.

macOS, pelo tap próprio da Moralia:

```bash
brew install --cask moraliasp/tap/leve
```

Windows, com o instalador por usuário:

```powershell
winget install Moralia.Leve
```

O app é o mesmo da release, com o mesmo aviso na primeira abertura (abaixo). No macOS o Homebrew mantém a quarentena de propósito, então o passo do **Abrir Mesmo Assim** vale também para quem instala pelo `brew`, e pode voltar depois de um `brew upgrade`. Se já houver um Leve em Aplicativos, o `brew install` fica com ele em vez de instalar por cima: o app, a liberação do Gatekeeper e a versão continuam como estão, e o atualizador do app segue cuidando das versões novas. Pelo winget vai o instalador por usuário (`-setup.exe`); o `.msi` continua só na release.

## macOS

1. Baixe o `.dmg`: `Leve_x.y.z_universal.dmg` até a 0.5.0; nas versões seguintes, o do seu Mac, `Leve_x.y.z_aarch64.dmg` para Apple silicon (chip Apple M…, no menu Apple > Sobre Este Mac) ou `Leve_x.y.z_x64.dmg` para Intel. Abra e arraste **Leve** para **Aplicativos**.
2. Dê duplo-clique em Leve. Vai aparecer "Não foi possível verificar se 'Leve' está livre de malware". Clique em **OK** (ou **Concluído**).
3. Abra **Ajustes do Sistema › Privacidade e Segurança**, role até o fim: "Leve foi bloqueado para proteger o Mac". Clique em **Abrir Mesmo Assim** e confirme com a senha ou Touch ID.
4. Da segunda vez em diante abre normalmente. Para abrir um `.md` com duplo-clique, use **Abrir com › Leve** uma vez (ou "Sempre abrir com", em Obter Informações › Abrir com › Alterar Tudo).

Alternativa pelo Terminal, para quem prefere:

```bash
xattr -dr com.apple.quarantine /Applications/Leve.app
```

## Windows

1. Execute `Leve_x.y.z_x64-setup.exe` (instala só para o seu usuário, não pede administrador). O `.msi` faz o mesmo para instalação por TI.
2. O SmartScreen mostra "O Windows protegeu o computador". Clique em **Mais informações** e depois em **Executar assim mesmo**.
3. O instalador associa `.md`, `.markdown`, `.mdown` e `.mkd` ao Leve.

## Linux

Pacotes x86_64, compilados no Ubuntu 22.04, para distribuições com glibc 2.35 ou mais nova (em tese Ubuntu 22.04, Debian 12, Fedora 36, Linux Mint 21 e posteriores). **Ainda não testados numa máquina Linux real:** o CI compila, confere o pacote e abre o AppImage sem tela por 15 s, mas leitura, duplo-clique, diálogo e atualização não foram exercitados num desktop. Relatos em [issues](https://github.com/moraliasp/leve/issues).

**AppImage** (qualquer distribuição, sem instalar):

```bash
chmod +x Leve_x.y.z_amd64.AppImage
./Leve_x.y.z_amd64.AppImage documento.md
```

Se ele não abrir por falta de FUSE, instale `libfuse2` (no Ubuntu 24.04, `libfuse2t64`) ou rode com `--appimage-extract-and-run`. Para o duplo-clique em `.md` abrir no Leve, use um integrador de AppImage (Gear Lever, AppImageLauncher) ou prefira o `.deb`.

**.deb** (Debian, Ubuntu e derivados):

```bash
sudo apt install ./Leve_x.y.z_amd64.deb
```

O `apt` puxa o WebKitGTK e o GTK se faltarem. O pacote instala o Leve no menu de aplicativos e o registra para `text/markdown`; para torná-lo o padrão, use **Abrir com › Leve** e marque "sempre", ou `xdg-mime default Leve.desktop text/markdown`.

**.rpm** (Fedora, openSUSE e derivados; desde a 0.4.0):

```bash
sudo dnf install ./Leve-x.y.z-1.x86_64.rpm
```

O mesmo binário do `.deb`. O `dnf` (no openSUSE, `sudo zypper install`) puxa `webkit2gtk4.1` e `gtk3` se faltarem; no Fedora com GNOME eles costumam já estar instalados, e o Leve ocupa uns 4 MB. Registra o Leve para `text/markdown`, como o `.deb`, e se atualiza pelo próprio Leve.

**Flatpak** (Fedora, openSUSE e qualquer distribuição com Flatpak; desde a 0.4.0). Baixe `Leve_x.y.z_x86_64.flatpak` da release e instale para o seu usuário:

```bash
flatpak install --user --bundle Leve_x.y.z_x86_64.flatpak
flatpak run br.com.moralia.leve documento.md
```

Na primeira vez o `flatpak` adiciona o Flathub e baixa o runtime do GNOME (algumas centenas de MB, compartilhados com outros apps GNOME). O Leve aparece no menu de aplicativos e é registrado para `text/markdown`. Para atualizar, baixe o `.flatpak` da versão nova, desinstale a atual e instale a nova (o `flatpak` recusa instalar o arquivo por cima, mesmo com `--reinstall`); as preferências e os arquivos recentes ficam em `~/.var/app/br.com.moralia.leve`, porque o `uninstall` sem `--delete-data` não apaga essa pasta:

```bash
flatpak uninstall --user br.com.moralia.leve
flatpak install --user --bundle Leve_x.y.z_x86_64.flatpak
```

O arquivo não se atualiza sozinho nem pela loja. Para remover: `flatpak uninstall --user br.com.moralia.leve`.

No Flathub, em breve (a linha abaixo só funciona depois de aceito; aí a atualização passa a vir pela loja e pelo `flatpak update`):

```bash
flatpak install flathub br.com.moralia.leve
```

O Flatpak é compilado a partir do fonte sobre o runtime do GNOME e roda no sandbox com leitura (só leitura) da pasta pessoal, para achar imagens e links relativos do documento; arquivo de fora da pasta pessoal abre pelo portal, sem os vizinhos. O menu Verificar atualizações do Leve não atualiza o Flatpak: ele indica a loja ou o `flatpak update`. Abrir no editor só oferece o aplicativo padrão: os editores instalados no sistema ficam fora do sandbox.

No Fedora e no openSUSE, até essa versão sair, use o AppImage.

## Comando `leve` no terminal

`leve arquivo.md` abre o arquivo no Leve (caminho relativo vale a partir da pasta atual do terminal); `leve` sozinho abre ou traz o Leve para a frente.

**macOS:** **Leve › Instalar comando 'leve' no terminal…** (ou **Preferências › Integração**). O app grava um script curto que chama `open -b br.com.moralia.leve`:

- em `/usr/local/bin/leve`, se der para gravar ali sem senha;
- senão em `~/.local/bin/leve` ou `~/bin/leve`, se uma dessas pastas estiver no `PATH` do seu shell;
- senão o app pergunta e grava `/usr/local/bin/leve` pedindo a senha de administrador do macOS.

Ele não sobrescreve um `leve` que não tenha sido instalado por ele. Para remover: `rm "$(command -v leve)"`.

**Windows:** o executável é `leve.exe`, na pasta de instalação (padrão `%LOCALAPPDATA%\Leve`). Ponha essa pasta no `PATH` do seu usuário uma vez (PowerShell):

```powershell
[Environment]::SetEnvironmentVariable("Path", [Environment]::GetEnvironmentVariable("Path", "User") + ";$env:LOCALAPPDATA\Leve", "User")
```

Abra um terminal novo e use `leve arquivo.md`. Se instalou em outra pasta, troque o caminho.

**Linux:** o pacote `.deb` instala `/usr/bin/leve`, já no `PATH`. O AppImage não: crie um link, por exemplo `ln -s ~/Applications/Leve.AppImage ~/.local/bin/leve`.

## Abrir no editor

**Arquivo › Abrir no editor** (⌘E / Ctrl+E) abre o documento ativo no editor escolhido em **Preferências › Integração › Editor**: VS Code, Cursor, Zed, Sublime Text, TextEdit (macOS) ou Bloco de Notas (Windows), ou o aplicativo padrão para `.md`. A lista mostra só o que está instalado. Se o aplicativo padrão para `.md` for o próprio Leve, escolha um editor.

## Conferir a versão

**Ajuda › Sobre o Leve** (no macOS, **Leve › Sobre o Leve**) mostra a versão, a licença e o link do repositório.

## Atualizações

**Leve › Verificar atualizações…** (no Windows e no Linux, **Ajuda › Verificar atualizações…**) procura uma versão nova nas releases do GitHub, pergunta antes de baixar e reinicia o app ao terminar. Em **Preferências › Atualizações** dá para ligar a checagem diária (desligada por padrão). O pacote baixado é conferido pela assinatura do atualizador antes de instalar. No Linux, o AppImage se substitui no lugar (precisa de permissão de escrita no arquivo); o `.deb` é reinstalado pelo `dpkg` e o `.rpm` pelo `rpm -U`, e o sistema pede a senha de administrador (`pkexec`).

## Dados do app

A lista de arquivos liberados para os Recentes fica em `grants.json`, em `~/Library/Application Support/br.com.moralia.leve/` (macOS), `%LOCALAPPDATA%\br.com.moralia.leve\` (Windows) ou `~/.local/share/br.com.moralia.leve/` (Linux). Preferências, abas e posições de leitura ficam no armazenamento do WebView do app. **Preferências › Esquecer arquivos autorizados…** limpa a lista.
