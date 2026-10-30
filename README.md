# Bastidores — produção de eventos

Aplicativo web para Fran, Will e Gabi organizarem um evento, com dados compartilhados em um único servidor. Não exige cadastro nem senha.

## O que está pronto
- Produção: tarefas/etapas, descrição, responsável, prazo e status (A fazer, Em andamento, Concluída, Bloqueada).
- Palestrantes: contato, tema, links de perfil e portfólio, responsável, observações, próximo passo, prazo, valor/condições.
- Parceiros: contato, tipo de parceria/contrapartidas, links de perfil e proposta, responsável, observações, próximo passo, prazo, valor/condições.
- Curadoria (Em análise, Aprovado, Não aprovado) e negociação (Não iniciada, Em contato, Em negociação, Fechado, Não fechado) independentes.
- Dados do evento: nome, data e local.
- Busca, filtros, resumo de tarefas concluídas/atrasadas e negociações fechadas.
- Atualização entre navegadores conectados, via Server-Sent Events. Recarregamento automático ao reconectar.
- Proteção contra sobrescrita: se duas pessoas editarem o mesmo registro ao mesmo tempo, a segunda deve fechar e abrir o formulário para ler a versão atual. Seu texto não é descartado automaticamente.
- Exportação de todos os dados para JSON (cópia para consulta; não há importação pela interface nesta versão).
- Interface em português, adaptada a celular e tema claro/escuro. Identidade colorida: produção em roxo, palestrantes em azul e parceiros em verde; cores semânticas dos status preservadas.

## Uso em equipe: importante
Selecionar um nome NÃO autentica ninguém. Qualquer pessoa com acesso ao endereço pode ver, exportar, editar e excluir dados, ou selecionar qualquer um dos três nomes. Não há distinção de permissões, histórico completo de alterações nem recuperação de exclusões. Guarde apenas informações adequadas a esse nível de acesso. Se a URL for pública, isso vale também para pessoas fora da equipe que a descubram.

Para uso privado sem login no app, publique em uma rede privada/VPN ou use uma camada externa de controle de acesso. Se a equipe quiser acesso pela internet aberta, recomenda-se autenticação antes de inserir contatos pessoais, contratos ou condições sensíveis. O HTTPS deve ser fornecido pela hospedagem ou proxy reverso.

## Testar no computador
Requisito: Node.js 24 ou superior. Não há dependências para instalar.

1. Descompacte esta pasta.
2. Dentro dela, execute `npm start`.
3. Abra `http://localhost:3000`.
4. Selecione Fran, Will ou Gabi no topo e edite os detalhes do evento.

No mesmo Wi-Fi, outros dispositivos podem acessar `http://IP-DO-COMPUTADOR:3000` se a rede e o firewall permitirem. O computador precisa ficar ligado. `localhost` em outro dispositivo não aponta para o servidor. Para um endereço web permanente, use hospedagem.

## Publicar com Docker
Peça à pessoa responsável pela hospedagem para executar:

```sh
docker build -t bastidores .
docker volume create bastidores-data
docker run -d --name bastidores --restart unless-stopped \
  -p 3000:3000 -v bastidores-data:/app/data bastidores
```

Configure um domínio com HTTPS no proxy da hospedagem e encaminhe ao serviço na porta 3000. O proxy deve permitir conexões SSE de longa duração em `/api/live`, sem buffering (por exemplo, `proxy_buffering off` no Nginx).

**Persistência obrigatória:** mantenha o volume `/app/data` ou configure `DATA_DIR` para um disco persistente. Não publique em ambiente com disco temporário; nesse caso os dados podem sumir ao reiniciar/republicar. Esta versão usa uma única instância com SQLite e não deve rodar em várias réplicas independentes. Hospedagem apenas de arquivos estáticos não executa este servidor.

Variáveis:
- `PORT`: porta HTTP, padrão `3000`.
- `DATA_DIR`: pasta persistente do banco, padrão `./data`.

O aplicativo não é publicado automaticamente pelo recebimento deste arquivo. A contratação/configuração da hospedagem precisa ser feita separadamente.

## Backup e restauração técnica
Use “Exportar dados” para uma cópia legível em JSON. Para recuperação integral, faça backups regulares do SQLite usando a API de backup do SQLite ou interrompa o servidor e copie todo o diretório `DATA_DIR`. Para restaurar, com o servidor parado, reponha o diretório no volume persistente e reinicie. O arquivo principal é `bastidores.sqlite`; enquanto o servidor estiver ligado podem existir arquivos `-wal` e `-shm` que fazem parte da consistência do banco. Não copie apenas o arquivo principal durante a execução.

## Estrutura
- `server.mjs`: HTTP, validação, SQLite e comunicação em tempo real.
- `public/`: interface sem bibliotecas externas nem recursos de terceiros.
- `Dockerfile`: implantação com Node 24.
- `package.json`: comando `npm start`.

O protótipo `bastidores-demonstracao.html`, entregue separadamente, é apenas uma demonstração local. Os dados dessa demonstração não são compartilhados e não migram automaticamente para o servidor.

## Compatibilidade com prévias incorporadas
Os botões de salvamento usam ações JavaScript diretas, pois algumas prévias bloqueiam o envio nativo de formulários. A validação dos campos continua ativa. Quando o armazenamento do navegador estiver indisponível, a demonstração exibe um aviso: os dados continuam utilizáveis durante a sessão, mas são perdidos ao recarregar. A persistência do aplicativo hospedado usa o banco SQLite do servidor e independe do armazenamento local.
