# Avaliador de Anúncios – UpSeller, TikTok Shop & Shein

Extensão para Chrome que lê a página aberta do painel do vendedor e dá uma
nota de 0 a 100 para cada anúncio, apontando o que melhorar.

Ela **não usa senha nem API**: só lê o que já aparece na tela enquanto você
está logada. Nada é enviado para fora do seu navegador.

## Como instalar em outro perfil do Chrome

1. Baixe esta pasta `extensao/` para o computador (no GitHub: botão **Code → Download ZIP**, depois descompacte).
2. Abra o Chrome no perfil que você usa para as contas de marketplace
   (clique na foto do perfil no canto superior direito → escolha o perfil ou **Adicionar** um novo).
3. Nesse perfil, acesse `chrome://extensions`.
4. Ligue o **Modo do desenvolvedor** (canto superior direito).
5. Clique em **Carregar sem compactação** e selecione a pasta `extensao`.
6. Fixe o ícone da extensão clicando no quebra-cabeça 🧩 da barra do Chrome.

A extensão só existe no perfil onde você instalou; os outros perfis não são afetados.

## Como usar

### Pelo UpSeller (recomendado — todas as lojas num lugar só)

1. No UpSeller, vá em **Produtos → Gestão de Anúncios** e clique em **Ativo** na linha do
   marketplace (Mercado Livre, Shopee, Shein, TikTok Shop, Temu ou Kwai Shop).
2. Deixe as variantes recolhidas e escolha uma quantidade por página que mostre todos os anúncios.
3. Clique no ícone da extensão → **Analisar esta página**.
4. Repita para cada marketplace.

Também funciona em **Análises → Vendas por Anúncio** (unidades vendidas, faturamento
e preço médio dos anúncios que venderam no período).

Anúncios publicados há menos de 14 dias (coluna "Atualizado/Publicado") não recebem
alertas de vendas ou conversão — só um aviso de que são novos.

Pelo UpSeller a extensão também lê loja, preço com desconto, visitas, curtidas e
número de variantes, e avisa anúncios com muitas visitas e nenhuma venda.

### Direto no painel do marketplace

O **TikTok Shop** não mostra vendas e visitas por anúncio dentro do UpSeller. Para
ter esses dados, analise pela Central do vendedor do TikTok (*Produtos → Gerenciar
produtos*): a extensão lê itens vendidos, visualizações, promoção e ID de cada produto.

1. Entre no painel do vendedor:
   - **TikTok Shop**: Central do vendedor → *Produtos → Gerenciar produtos*
   - **Shein**: Seller Hub → *Produtos → Lista de produtos*
2. Clique no ícone da extensão → **Analisar esta página**.
3. Veja a nota de cada anúncio (os piores aparecem primeiro) e os problemas encontrados.
4. **Exportar CSV** gera uma planilha que abre no Excel ou no Google Planilhas.

Também funciona na página de **edição de um anúncio**: aí ela confere ainda a
quantidade de imagens e o tamanho da descrição.

> Dica: se a lista tiver várias páginas, aumente a quantidade de itens por
> página no painel (ex.: 100) antes de analisar.

## Planilha de títulos

Depois de analisar, **Planilha de títulos** baixa um CSV só com os anúncios cujo
título precisa de ajuste: loja, ID do anúncio, SKU, título atual, **título
sugerido** e o que revisar manualmente.

- Títulos todos em MAIÚSCULAS são convertidos automaticamente
  (mantendo siglas e tamanhos como UV50+, FPS, RN, P, M, G).
- Títulos duplicados, longos, curtos ou com palavras repetidas são apenas
  marcados em "Revisar manualmente" — a extensão não inventa informação.

Revise a coluna "Título sugerido" antes de aplicar pelo **Editar em Massa** do UpSeller.

## O que é avaliado

| Severidade | Regra |
|---|---|
| 🔴 Crítico | Sem estoque · preço zerado/ausente · status reprovado/suspenso/com violação · anúncio sem imagens (edição) |
| 🟠 Alerta | Título curto (< 25) ou longo (> 60 no Mercado Livre, > 120 na Shopee, > 150 nos demais) · 30+ visitas e nenhuma venda · conversão abaixo de 0,5% (com 200+ visitas) · preço com desconto maior que o original · título em MAIÚSCULAS · palavra repetida 3+ vezes · estoque baixo (< 5) · anúncio inativo · título duplicado · menos de 5 imagens ou descrição curta (edição) |
| 🔵 Info | Nenhuma venda · nenhuma visita · anúncio em rascunho |

Cada crítico tira 30 pontos, cada alerta 10 e cada info 2. Os limites são
boas práticas gerais, não regras oficiais das plataformas — ajuste em
`src/rules.js` (objeto `LIMITS`).

## Se não encontrar os anúncios

A extensão identifica as colunas pelos nomes dos cabeçalhos (Produto, Preço,
Estoque, Vendidos, Status, SKU — em português, inglês ou espanhol). Se o
painel mudar de layout, ajuste os padrões em `COLUMN_PATTERNS` dentro de
`src/extractor.js` e clique em ↻ (recarregar) na extensão em `chrome://extensions`.

## Desenvolvimento

```sh
npm test   # testes das regras de avaliação (Node 20+)
```
