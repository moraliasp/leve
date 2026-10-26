# Instalar o Leve

Os instaladores ainda saem sem assinatura (macOS até a Moralia ter conta Apple Developer própria; Windows sem certificado), então o sistema avisa na primeira abertura. É esperado e acontece uma vez. No Linux não há aviso de sistema: a origem se confere pelo `SHA256SUMS.txt` e pela attestation da release.

## macOS

1. Abra o `.dmg` e arraste **Leve** para **Aplicativos**.
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

Pacotes x86_64, compilados no Ubuntu 22.04: rodam em distribuições com glibc 2.35 ou mais nova (Ubuntu 22.04, Debian 12, Fedora 36, Linux Mint 21 e posteriores).

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

Sem `.rpm` nem Flatpak por enquanto: no Fedora e no openSUSE, use o AppImage.

## Conferir a versão

**Ajuda › Sobre o Leve** (no macOS, **Leve › Sobre o Leve**) mostra a versão, a licença e o link do repositório.

## Atualizações

**Leve › Verificar atualizações…** (no Windows e no Linux, **Ajuda › Verificar atualizações…**) procura uma versão nova nas releases do GitHub, pergunta antes de baixar e reinicia o app ao terminar. Em **Preferências › Atualizações** dá para ligar a checagem diária (desligada por padrão). O pacote baixado é conferido pela assinatura do atualizador antes de instalar. No Linux, o AppImage se substitui no lugar (precisa de permissão de escrita no arquivo); o `.deb` é reinstalado pelo `dpkg` e o sistema pede a senha de administrador (`pkexec`).

## Dados do app

A lista de arquivos liberados para os Recentes fica em `grants.json`, em `~/Library/Application Support/br.com.moralia.leve/` (macOS), `%LOCALAPPDATA%\br.com.moralia.leve\` (Windows) ou `~/.local/share/br.com.moralia.leve/` (Linux). Preferências, abas e posições de leitura ficam no armazenamento do WebView do app. **Preferências › Esquecer arquivos autorizados…** limpa a lista.
