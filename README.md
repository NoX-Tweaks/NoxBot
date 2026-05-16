# Bot Nox Tweaks

Bot em JavaScript pronto para SquareCloud com:

- Sistema de ticket com multiplos modelos, painel, cargo staff, assumir, fechar e transcript em `.txt`
- Aparencia de cada painel de ticket configuravel: cor, titulo, descricao, foto ou GIF
- Sistema de logs: entrada/saida, call, mensagens editadas/apagadas, tickets, seguranca e moderacao
- Sistema de autocargo configuravel pelo menu
- Sistema de seguranca ativavel pelo menu
- Sistema de embed pelo menu
- Menu completo pelo comando `nt!menu`
- Comando `nt!perm` para liberar acesso ao menu por lista de permissao
- Status: assistindo `Nox Tweaks`

## Como rodar

1. Instale as dependencias:

```bash
npm install
```

2. Copie `.env.example` para `.env` e coloque o token:

```env
DISCORD_TOKEN=seu_token
```

3. Inicie:

```bash
npm start
```

## Comandos

- `nt!menu` abre o painel principal.
- `nt!help` mostra a lista de comandos usando o prefixo atual.
- `nt!bot-call` abre um seletor para escolher a call e entrar mutado ou desmutado.
- `nt!embed editar <id_mensagem>` abre o editor visual de uma embed.
- `nt!addemoji <emoji_ou_url> [nome]` adiciona emoji de outro servidor ou URL.
- `nt!perm add @usuario` libera um usuario para usar o menu.
- `nt!perm remove @usuario` remove o acesso.
- `nt!perm list` mostra usuarios liberados.

Somente usuarios adicionados com `nt!perm add @usuario` conseguem usar o menu. Dono do servidor e administradores podem gerenciar o `nt!perm`, mas tambem precisam estar na lista para abrir o painel.

## Onde salva

O banco principal e o MongoDB configurado em `MONGO_URI`.

O arquivo `data/guilds.json` fica como fallback automatico caso o MongoDB caia. Ele salva:

- canais de logs
- usuarios com permissao no menu
- prefixo personalizado
- autocargo
- configuracoes e modelos de ticket
- seguranca ativada/desativada
- embed personalizada

## Banco de Dados

Na SquareCloud, configure estas variaveis:

```env
DISCORD_TOKEN=token_do_bot
MONGO_URI=url_do_mongodb
MONGO_DB_NAME=nox_bot
MONGO_TLS=true
```

Se seu MongoDB exigir certificados, envie estes arquivos para a pasta `certs`:

- `ca-certificate.crt`
- `certificate.pem`
- `private-key.key`

O bot detecta esses arquivos sozinho. Opcionalmente, voce pode configurar os caminhos manualmente:

```env
MONGO_TLS=true
MONGO_CA_FILE=./certs/ca-certificate.crt
MONGO_CERT_FILE=./certs/certificate.pem
MONGO_KEY_FILE=./certs/private-key.key
```

Se nao exigir certificado, deixe `MONGO_TLS=false` e os caminhos vazios.

Se aparecer erro de `self-signed certificate` e voce nao conseguir enviar o `ca-certificate.crt` para a hospedagem, use:

```env
MONGO_TLS=true
MONGO_TLS_ALLOW_INVALID_CERTIFICATES=true
```

O recomendado e usar o `ca-certificate.crt`; a opcao acima serve como atalho quando a hospedagem nao encontra o certificado.

## Estrutura

- `index.js`: inicia o cliente Discord.
- `src/events`: registra eventos do Discord.
- `src/handlers`: comandos por prefixo e interacoes de menu.
- `src/systems`: sistemas de ticket e seguranca.
- `src/ui`: menus, embeds e modais.
- `src/database`: leitura e escrita do JSON.
- `src/config`: configuracao padrao do servidor.
- `src/utils`: permissoes, logs e helpers.

## SquareCloud

Envie estes arquivos para a SquareCloud e configure a variavel `DISCORD_TOKEN` no painel. O arquivo `squarecloud.app` ja esta pronto.
