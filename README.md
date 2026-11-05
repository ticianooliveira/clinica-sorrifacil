# Pacientes Sorrifácil

Sistema local de acompanhamento clínico odontológico.

## Funcionalidades

- Cadastro e edição de pacientes.
- Evoluções clínicas, prioridades, próximas etapas e solicitações.
- Anexos de imagens, vídeos e documentos, com visualização e zoom.
- Relatórios gerais, individuais, de materiais e prontuários incompletos.
- Prévia, impressão e exportação de relatórios em formato .doc baseado em HTML.
- Exportação e restauração de cópia de segurança JSON com pacientes, evoluções e anexos.

## Arquivos

- index.html: estrutura da interface.
- css/style.css: estilos da interface.
- js/script.js: funções clínicas e armazenamento local.
- js/offline-tools.js: conexão com pasta, cópias JSON e biblioteca de catálogos PDF.

## Uso offline e navegadores

Abra index.html diretamente no Chrome, Edge ou Firefox. Mantenha css e js junto do HTML. Não requer dependências externas nem servidor. Links para prontuários externos precisam de acesso ao destino. No Firefox, use uma janela normal (não privativa) para que localStorage e IndexedDB preservem pacientes, anexos e catálogos.

O cadastro, as evoluções, os anexos, os catálogos, os relatórios, a cópia de segurança e a restauração funcionam nos três navegadores. A conexão automática com uma pasta pelo botão Pasta de dados depende da File System Access API, que o Firefox não oferece. Nesse navegador, transfira os dados pelos botões Baixar cópia e Restaurar. Chrome e Edge continuam oferecendo também a gravação automática na pasta conectada.

## Dados e migração

O código distribuído não contém pacientes pré-cadastrados. Os dados clínicos ficam no navegador: cadastros e evoluções no localStorage (acompanhamentoClinicoV1); anexos no IndexedDB (AcompanhamentoClinicoArquivos, coleção arquivos).

Antes de substituir a versão antiga, mudar o caminho ou trocar de navegador/computador:

1. Abra a versão em uso e baixe uma cópia de segurança JSON.
2. Guarde essa cópia fora da pasta do repositório.
3. Abra a nova versão e use Relatórios > Cópia de segurança > Restaurar.
4. Confira os pacientes, evoluções e anexos após a importação.

A restauração substitui os dados atuais. A cópia JSON inclui os anexos em base64. Mantenha cópias periódicas: limpar os dados do navegador pode apagá-los. Sincronizar a pasta de código pelo Seafile não sincroniza automaticamente o banco do navegador.

## GitHub

Envie apenas o código e a documentação. Não envie cópias JSON nem documentos clínicos. O .gitignore evita a inclusão inicial de extensões comuns de dados e anexos; ele não remove arquivos já rastreados pelo Git. O sistema atual não possui autenticação nem criptografia própria.

## Pasta de dados e gravação automática

No Chrome ou Edge de computador, abra Relatórios e clique em Conectar / autorizar pasta. Escolha uma pasta de dados fora do repositório. O navegador precisa oferecer a API File System Access; se ela não estiver disponível, os botões manuais de baixar/restaurar JSON continuam disponíveis.

São reconhecidos arquivos backup-acompanhamento*.json e dados-sorrifacil.json. O arquivo mais recente é escolhido pela data de modificação. Na primeira conexão, confirme se deseja carregá-lo. Depois, o sistema grava um arquivo completo chamado dados-sorrifacil.json após as alterações, com intervalo de cerca de 1,5 segundo. Backups manuais datados continuam disponíveis; o arquivo automático não substitui cópias históricas.

A pasta pode ser lembrada no IndexedDB, mas a permanência da permissão depende do navegador. Ao reabrir com permissão, o JSON mais recente é carregado automaticamente, desde que não existam alterações locais pendentes. Se a permissão precisar ser renovada, clique em Conectar / autorizar pasta. Use Salvar agora antes de fechar e confira a mensagem de conclusão. Arquivos grandes levam mais tempo para gravar.

Se o JSON da pasta mudar, a gravação automática pausa. Use Carregar dados para usar o JSON ou Salvar agora para gravar a versão local após confirmar. Não há mesclagem de dados entre computadores; use um por vez e aguarde o Seafile concluir a sincronização antes de trocar. A verificação de alterações reduz conflitos, mas não fornece bloqueio distribuído entre computadores.

## Catálogos PDF

Abra Catálogos PDF e adicione os arquivos locais uma vez. Eles ficam no IndexedDB deste navegador, disponíveis offline. Use Exibir aqui para abrir vários lado a lado ou Abrir em aba para abrir cada catálogo em uma aba separada.

A busca pelo nome filtra a lista de catálogos. Para buscar dentro do conteúdo, use a lupa do leitor PDF ou Ctrl + F no PDF aberto em sua própria aba. A interface do leitor depende do navegador; PDFs que contêm apenas imagens precisam de OCR. Não há pesquisa unificada em todos os PDFs.

As cópias JSON baixadas manualmente incluem pacientes, evoluções, anexos e catálogos. Backups antigos sem a propriedade catalogs são aceitos e preservam os catálogos já guardados no navegador. Backups novos substituem também a biblioteca de catálogos ao restaurar.

## Verificação

Sintaxe dos dois arquivos JavaScript verificada. Testes com pasta simulada cobriram a seleção do JSON mais recente, a gravação, a compatibilidade estrutural com backups antigos, rejeição de dados inválidos e a pausa em caso de alteração externa. Teste de interface em navegador não executado neste ambiente. Confira a restauração e os anexos no seu navegador antes de adotar a versão.

## Trocar a pasta de dados

Em Relatórios, clique em Trocar pasta. O seletor sempre abre, mesmo que a pasta atual já tenha permissão. Cancelar mantém a pasta anterior. A troca preserva os dados locais e não importa um JSON automaticamente: use Salvar agora na pasta para gravar os dados atuais no novo destino ou Carregar dados da pasta para usar o JSON desse destino. Os arquivos da pasta anterior não são movidos nem apagados. A mensagem de estado mostra o nome da pasta atual.

## Salvamento de catálogos grandes

O salvamento automático agora usa o formato folder-files-v1. dados-sorrifacil.json contém pacientes, evoluções e referências dos anexos e catálogos. Os binários são gravados separadamente em arquivos-sorrifacil/anexos e arquivos-sorrifacil/catalogos. Isso evita montar uma única string JSON enorme com todos os PDFs em base64.

Mantenha dados-sorrifacil.json e a pasta arquivos-sorrifacil juntos. Para trocar de computador, sincronize ou copie ambos. PDFs inalterados são reutilizados. Arquivos antigos não são apagados automaticamente, para não quebrar referências de cópias anteriores; a pasta pode crescer após substituições e restaurações.

O botão Cópia de segurança ainda baixa um JSON completo e autocontido. A exportação é montada em partes, e a importação lê cada item separadamente. A memória disponível continua sendo um limite para coleções muito grandes, mas não é criada uma única string para a soma de todos os PDFs. JSONs antigos em base64 continuam aceitos. Para carregar manualmente o JSON leve do formato folder-files-v1, conecte antes a pasta que contém os arquivos referenciados.

Testes adicionais com arquivos simulados verificaram a escrita separada de PDF e anexo, recuperação dos bytes, reutilização dos arquivos, exportação JSON completa e leitura incremental. Interface não testada em navegador neste ambiente.
