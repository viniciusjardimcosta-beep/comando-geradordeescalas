## Problema

O site fica carregando infinitamente (preview e publicado). A causa está nos logs de rede:

```
GET /rest/v1/profiles → 403
{"code":"42501","message":"permission denied for function has_role"}
```

Na última correção de segurança, executei `REVOKE EXECUTE ... FROM authenticated` nas funções `public.has_role(uuid, app_role)` e `public.get_user_status(uuid)`. Isso quebrou o app inteiro porque essas funções são chamadas pelas **políticas RLS** das tabelas `profiles`, `user_roles`, `militares`, `escalas_geradas`, etc. Quando o PostgREST executa um SELECT como `authenticated`, o planner avalia o `USING (...)` da policy e precisa ter permissão de EXECUTE na função — mesmo sendo SECURITY DEFINER.

Resultado: TODA leitura de tabela com RLS retorna 403 → `AuthProvider` nunca carrega `profile`/`isAdmin` → app fica preso na tela de loading.

## Correção

Migration única revertendo o REVOKE:

```sql
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_user_status(uuid) TO authenticated, anon;
```

Isso restaura o funcionamento. O alerta original do scanner ("SECURITY DEFINER function executable by authenticated") era falso-positivo no nosso caso: essas funções são desenhadas para serem usadas dentro de policies RLS e precisam ser executáveis pelo role autenticado. Vou registrar isso na `security-memory` para o scanner não reclamar de novo.

## Passos

1. Criar migration que faz o GRANT EXECUTE de volta para `authenticated` e `anon`.
2. Atualizar a security-memory marcando essas duas funções como intencionalmente executáveis (são helpers de RLS).