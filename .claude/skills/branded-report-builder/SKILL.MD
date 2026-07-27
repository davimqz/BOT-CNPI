---
name: branded-report-builder
description: Use this skill whenever building or editing the branded trademark-search report ("Consultor de Marca"), the alert e-mail template, or the white-label customization system (office identity, logo, accent color, e-mail signature). Trigger for tasks like generating an HTML/PDF availability report for a searched brand, building the "Editor de Template" screen, wiring up e-mail template variables like {marca}/{status}/{processo}, or anything about making reports/e-mails look consistent and on-brand for a law office client. Use even if the user just says "gera o relatório da consulta" or "personaliza o e-mail de alerta" without naming this skill.
---

# Relatório "Consultor de Marca" e sistema white-label

## Por que isso existe

O relatório e o e-mail de alerta são gerados a partir do mesmo conjunto de dados (resultado de uma consulta ou de uma detecção de mudança), mas em dois formatos e dois momentos diferentes. Sem uma especificação central, é fácil os dois divergirem visualmente ao longo do tempo (um recebe uma atualização de estilo, o outro não) — esta skill existe para que ambos consumam a mesma fonte de verdade de identidade visual e estrutura.

## Estrutura confirmada do relatório

O relatório de consulta ("Consultor de Marca") segue esta estrutura, nesta ordem, confirmada a partir do software de referência:

1. **Cabeçalho**: nome/logo do "Consultor de Marca" (ou da identidade branded, se configurada) + data/hora da consulta.
2. **Bloco de veredito**: o nome pesquisado em destaque, entre aspas, com um selo grande de status:
   - Verde + ícone de check = "Marca Disponível" (nenhum registro conflitante encontrado)
   - Vermelho + ícone de proibido = "Marca Indisponível" (existem registros ativos com esse nome)
   - Um resumo em texto ("Existe(m) N marca(s) ativa(s) com este nome no INPI." ou "Nenhuma marca registrada com este nome foi encontrada no INPI.")
   - Indicação do tipo de busca usada (badge "Pesquisa Radical" ou "Pesquisa Exata")
3. **Quatro contadores-resumo** lado a lado: Total encontradas, Marcas ativas, Marcas inativas, Verificar (casos ambíguos que merecem revisão manual).
4. **Tabela de resultados** (só aparece se houver resultados): Nome da marca, Nº processo, Status no INPI (texto do despacho mais recente), Classe NCL, Titular, Situação (badge Ativo/Inativo).
5. **Rodapé**: data/hora da consulta + aviso legal padrão — algo como *"Este relatório é informativo. Consulte um advogado especialista em propriedade intelectual antes de depositar o pedido de registro."* Mantenha esse disclaimer sempre visível; ele existe para proteger juridicamente quem está prestando o serviço, não é só um detalhe estético.

Gere o mesmo relatório em HTML e em PDF a partir de uma única fonte (um template, renderizado para os dois formatos) — não mantenha dois templates separados que podem divergir.

## Sistema de personalização (white-label)

Estes campos devem ser configuráveis por usuário/escritório e aplicados tanto no relatório quanto no e-mail:

- **Identidade do escritório**: nome, telefone, e-mail, site.
- **Logo**: via URL ou upload direto; com opção de ocultar completamente (nem todo mundo quer logo no relatório).
- **Cor de destaque**: campo hex livre, mais uma paleta de sugestões rápidas (ouro, azul, verde, roxo, rosa, vermelho) para quem não quer escolher um hex manualmente.
- **Texto do rodapé do relatório**: sobrescreve (ou complementa) o disclaimer padrão.
- **Formato padrão ao abrir**: HTML, PDF ou Ambos — isso é preferência de fluxo de trabalho, não afeta o conteúdo do relatório em si.

## Template de e-mail de alerta

O e-mail de notificação (disparado quando o monitoramento detecta mudança) usa variáveis dinâmicas no texto, que devem ser suportadas em pelo menos estes três campos:

- **Assunto**: ex. `"🔔 ALERTA INPI — {marca}: {status}"`
- **Cabeçalho** (título exibido no topo do e-mail)
- **Texto introdutório** (parágrafo antes dos dados da marca)

Variáveis confirmadas: `{marca}` (nome da marca), `{status}` (novo status/despacho), `{processo}` (número do processo). Ao implementar o motor de template, use um mecanismo de substituição simples e explícito (não um template engine pesado) — são poucas variáveis, bem definidas, e a simplicidade aqui reduz risco de bug de renderização em produção.

Depois do texto introdutório, o e-mail deve embutir os mesmos dados estruturados do relatório (nome, processo, status, classe, titular) — reaproveitando o mesmo componente de renderização usado no relatório, não uma versão redigitada à parte.

## Assinatura de e-mail

Suporte três modalidades, com o usuário escolhendo qual usar:
- Texto simples
- HTML
- Imagem

A assinatura escolhida é anexada automaticamente a todo e-mail enviado para clientes — implemente isso como uma etapa final de composição do e-mail, não algo que cada ponto de disparo de e-mail precisa lembrar de incluir manualmente.

## Sempre ofereça prévia antes de salvar

O editor de template deve ter botões de "Prévia HTML" e "Prévia PDF" que renderizam o resultado com os dados de exemplo, antes do usuário salvar a configuração — personalização visual é um domínio onde o usuário só sabe se gostou depois de ver o resultado real, não a configuração abstrata.
