# FixMySearch — Deploy Guide

## Estrutura do projeto

```
fixmysearch/
├── api/
│   ├── fix.js              ← Reformulação (Haiku 5.5 + cota + histórico)
│   ├── me.js               ← Plano e uso do usuário logado
│   ├── checkout.js         ← Cria sessão de assinatura no Stripe
│   ├── portal.js           ← Portal de cancelamento/gestão do Stripe
│   ├── history.js          ← Últimas 50 buscas (Pro)
│   └── stripe-webhook.js   ← Confirma/cancela assinatura (Edge Runtime)
├── lib/
│   └── supabase.js         ← Helpers de Auth + banco (sem dependências)
├── supabase/
│   └── schema.sql          ← Tabelas, RLS e trigger de novo usuário
├── public/
│   └── index.html          ← Frontend
├── vercel.json
├── package.json
└── README.md
```

**Cotas:** Free = 5 buscas/24h por conta (anônimo = 10/24h por IP). Pro = R$19/mês com fair-use de 200/dia. Histórico e exportação são recursos Pro.

---

## Passo a passo para colocar no ar

### 1. Crie sua conta Anthropic e pegue a API Key
- Acesse: https://console.anthropic.com
- Vá em "API Keys" → "Create Key"
- Guarde a chave (começa com `sk-ant-...`)
- Custo estimado: ~$0,0002 por busca com Claude Haiku 5.5

### 2. Crie o projeto no Supabase (login + banco)
- Acesse: https://supabase.com → "New project"
- No **SQL Editor**, rode o conteúdo de `supabase/schema.sql`
- Em **Authentication → URL Configuration**:
  - `Site URL`: `https://seudominio.com.br`
  - `Redirect URLs`: `https://seudominio.com.br/**` e `http://localhost:3000/**` (os parâmetros de login usam wildcard)
- Em **Settings → API**, copie:
  - `Project URL` → `SUPABASE_URL`
  - `anon public` → `SUPABASE_ANON_KEY`
  - `service_role` → `SUPABASE_SERVICE_ROLE_KEY` (nunca expor no frontend)
- Para produção, configure um SMTP próprio (ex.: Resend) em **Authentication → SMTP**. O email padrão do Supabase tem limite baixo de envios.

### 3. Crie o produto no Stripe
- Acesse: https://dashboard.stripe.com
- **Product catalog** → crie "FixMySearch Pro" por **R$19/mês** (recorrente)
- Copie o **Price ID** (`price_...`) → `STRIPE_PRICE_ID`
- Em **Developers → API keys**, copie a **Secret key** → `STRIPE_SECRET_KEY`
- Em **Settings → Billing → Customer portal**, ative o portal (necessário para o botão "Gerenciar assinatura")

### 4. Suba o projeto no GitHub
```bash
git init
git add .
git commit -m "first commit"
git remote add origin https://github.com/SEU_USUARIO/fixmysearch.git
git push -u origin main
```

### 5. Deploy no Vercel (grátis)
- Acesse: https://vercel.com → "Add New Project" → importe o repositório
- Em **Environment Variables**, adicione todas as variáveis da tabela abaixo
- Clique em "Deploy"

### 6. Conecte o domínio
- Registro.br → `fixmysearch.com.br` (~R$40/ano) ou Namecheap → `fixmysearch.com`
- No painel Vercel → seu projeto → "Domains" → adicione o domínio
- HTTPS é automático (Let's Encrypt)
- Atualize `APP_URL` no Vercel para o domínio final e faça redeploy

### 7. Configure o webhook do Stripe
- No Stripe: **Developers → Webhooks → Add endpoint**
- URL: `https://seudominio.com.br/api/stripe-webhook`
- Eventos: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
- Copie o **Signing secret** (`whsec_...`) → `STRIPE_WEBHOOK_SECRET` no Vercel
- Faça redeploy para carregar a variável

### 8. Preencha as chaves públicas no frontend
No `public/index.html`, no início do `<script>`:
```js
const SUPABASE_URL = 'https://SEU_PROJETO.supabase.co';
const SUPABASE_ANON_KEY = 'SUA_ANON_KEY';
```
A `anon key` é pública por design; a segurança vem das regras de RLS. **Nunca** coloque a `service_role` aqui.

### Teste de ponta a ponta
- Use as chaves de **teste** do Stripe e o cartão `4242 4242 4242 4242`
- Chame o `/api/me` ou faça uma busca logado para ver a cota sendo aplicada
- Após pagar, o webhook deve atualizar `profiles.plan` para `pro` em segundos
- Cancele pelo portal e confirme que o plano volta para `free`

---

## Custos mensais estimados

| Item | Custo |
|------|-------|
| Vercel (hosting) | Grátis até 100GB bandwidth |
| Supabase (Auth + Postgres) | Grátis até 50k usuários ativos/mês |
| Gemini Flash (camada grátis) | R$0 até o limite diário do Google |
| Anthropic API (Haiku 5.5) | ~R$0,0012/busca · 1.000 buscas = ~R$1,20 |
| Domínio .com.br | R$3,33/mês (R$40/ano) |
| **Total inicial** | **~R$5/mês** |

Com 10 usuários Pro pagando R$19 = R$190/mês → lucro desde o início.

---

## Variáveis de ambiente necessárias

| Variável | Valor |
|----------|-------|
| `GEMINI_API_KEY` | chave do Google AI Studio (camada grátis, recomendado para começar) |
| `ANTHROPIC_API_KEY` | sk-ant-... (pago; alternativa ao Gemini) |
| `AI_PROVIDER` | `gemini` (padrão se houver `GEMINI_API_KEY`) ou `anthropic` |
| `GEMINI_MODEL` | `gemini-flash-lite-latest` (opcional) |
| `SUPABASE_URL` | https://SEU_PROJETO.supabase.co |
| `SUPABASE_ANON_KEY` | chave anon public (também usada no frontend) |
| `SUPABASE_SERVICE_ROLE_KEY` | chave service_role (somente servidor) |
| `STRIPE_SECRET_KEY` | sk_... (use `sk_test_...` primeiro) |
| `STRIPE_PRICE_ID` | price_... do plano R$19/mês |
| `STRIPE_REPORT_PRICE_ID` | price_... do relatório único R$9,90 |
| `STRIPE_WEBHOOK_SECRET` | whsec_... do endpoint do webhook |
| `APP_URL` | https://seudominio.com.br |
| `ALLOWED_ORIGIN` | https://seudominio.com.br (opcional, CORS) |
| `IP_HASH_SALT` | string aleatória (opcional, privacidade do limite anônimo) |

---

## Observações

- O limite anônimo é aplicado por IP **hasheado** (sem armazenar o IP puro) para proteger o custo da API.
- O cache de reformulações é em memória por instância. Se o tráfego crescer, troque por Upstash/Vercel KV.
- O webhook usa o Edge Runtime porque precisa do corpo bruto da requisição para validar a assinatura do Stripe.
- O modo `free` do Supabase inclui Auth e Postgres, mas recomenda-se SMTP próprio para os magic links.
