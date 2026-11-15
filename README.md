# Gothic Rádio

Player instalável baseado no `index.html` fornecido pelo proprietário, com o fluxo de login por janela auxiliar preservado. A interface não exibe o provedor nem o nome da pasta.

## Desenvolvimento

```sh
bun install --frozen-lockfile
bun run dev
bun run test
bun run build
```

O build em `dist/` contém o player, o manifesto com ícones e o service worker. Publique os arquivos em HTTPS. Os caminhos são relativos, inclusive para hospedagem em subpastas. O botão **Instalar** abre a instalação nativa quando disponível e mostra instruções nos outros navegadores.

## Memória

O catálogo inicial inclui 140.121 faixas do arquivo fornecido pelo proprietário, distribuídas em JSON compactos. Ele é carregado uma vez e salvo no dispositivo; os arquivos de áudio não estão incluídos. Depois da primeira carga ou de uma sincronização, o catálogo completo é salvo em IndexedDB, com cópia rápida em localStorage quando há espaço. A abertura seguinte restaura o catálogo sem consultar a API. A última faixa, posição, volume, modo aleatório e favoritas também são lembrados. Uma atualização com erro mantém a lista anterior. O navegador ainda pode apagar dados locais; não se trata de um backup remoto.

A lista de músicas é independente da sessão de login. Carregar um áudio ainda não guardado no cache pode exigir internet e renovação do acesso. Não embarque tokens ou credenciais na publicação. Os endereços da janela de login são os do arquivo fornecido e precisam continuar disponíveis.

## Validação

`bun run test` executa a lógica musical e os testes do player de produção, incluindo reabertura sem sessão, restauração por IndexedDB com localStorage cheio, lista preservada após falha, armazenamento corrompido e validação da origem da janela de login.
