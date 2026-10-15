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
- js/script.js: funções e armazenamento local.

## Uso offline

Abra index.html diretamente em um navegador de computador compatível com localStorage, IndexedDB e dialog. Mantenha css e js junto do HTML. Não requer dependências externas nem servidor. Links para prontuários externos precisam de acesso ao destino. A compatibilidade do armazenamento de arquivos locais depende do navegador.

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

## Validação desta separação

Sintaxe JavaScript verificada. Funções de exportação e restauração JSON e conversão de anexos comparadas com o original e preservadas. Teste em navegador não executado neste ambiente.
