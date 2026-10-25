# Instalar o Leve

Os instaladores ainda saem sem assinatura (macOS até a Moralia ter conta Apple Developer própria; Windows sem certificado), então o sistema avisa na primeira abertura. É esperado e acontece uma vez.

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

## Conferir a versão

**Ajuda › Sobre o Leve** (no macOS, **Leve › Sobre o Leve**) mostra a versão, a licença e o link do repositório.

## Atualizações

**Leve › Verificar atualizações…** (no Windows, **Ajuda › Verificar atualizações…**) procura uma versão nova nas releases do GitHub, pergunta antes de baixar e reinicia o app ao terminar. Em **Preferências › Atualizações** dá para ligar a checagem diária (desligada por padrão). O pacote baixado é conferido pela assinatura do atualizador antes de instalar.

## Dados do app

A lista de arquivos liberados para os Recentes fica em `grants.json`, em `~/Library/Application Support/br.com.moralia.leve/` (macOS) ou `%LOCALAPPDATA%\br.com.moralia.leve\` (Windows). Preferências, abas e posições de leitura ficam no armazenamento do WebView do app. **Preferências › Esquecer arquivos autorizados…** limpa a lista.
