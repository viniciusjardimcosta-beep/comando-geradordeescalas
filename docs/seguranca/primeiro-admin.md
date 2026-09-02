# Primeiro usuário administrador — comportamento documentado (Bloco 13B.4)

Classificação: **P3 — intencional**. Nenhuma alteração de comportamento foi feita.

## Onde ocorre

Trigger `on_auth_user_created` em `auth.users` → função `public.handle_new_user()`.
Ao criar o perfil, a função avalia:

```sql
SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO is_first_user;
...
INSERT INTO public.user_roles (user_id, role)
VALUES (NEW.id, CASE WHEN is_first_user THEN 'admin' ELSE 'user' END);
```

## Por que existe

O sistema é instalado sem nenhum administrador. Sem essa regra não haveria
como criar o primeiro papel `admin` pela própria aplicação — seria necessária
intervenção manual no banco em toda implantação.

## Pré-condição

O papel `admin` só é concedido quando a tabela `public.profiles` está
**completamente vazia**. Com um único perfil existente, todo novo cadastro
recebe `user`.

## Risco residual

Se **todos** os perfis fossem apagados, o próximo cadastro receberia `admin`.
Isso não é alcançável pela aplicação:

- não há rota, tela ou função que apague perfis em massa;
- as policies de `public.profiles` não permitem exclusão pelo usuário comum;
- o `DELETE` em massa exigiria acesso administrativo direto ao banco
  (service role / operador de infraestrutura), que já é um nível de acesso
  superior ao de administrador da aplicação.

Ou seja: quem conseguisse provocar o cenário já teria privilégio total.

## Regras de manutenção

- `handle_new_user()` não deve ser alterada para "corrigir" este ponto.
- Papéis continuam exclusivamente em `public.user_roles` (nunca em `profiles`).
- A verificação de administrador continua via `public.has_role(auth.uid(), 'admin')`.

## Superfície `anon` (auditoria do mesmo bloco)

Auditoria em 01/09/2026: **nenhuma** tabela do schema `public` possui GRANT
para o papel `anon` (`information_schema.role_table_grants` retornou zero
linhas para `grantee = 'anon'`). Não há, portanto, o que revogar — nenhuma
migration foi necessária. Leitura/escrita anônima permanece bloqueada tanto
por ausência de GRANT quanto por RLS.
