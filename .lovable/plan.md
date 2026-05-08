## Problema

A última migração de "correção de segurança" revogou `EXECUTE` das funções `public.has_role(uuid, app_role)` e `public.get_user_status(uuid)` para os roles `anon` e `authenticated`.

Essas funções são `SECURITY DEFINER` e são usadas **dentro das próprias policies RLS** (em `profiles`, `user_roles`, e outras tabelas). Sem `EXECUTE`, qualquer `SELECT` do usuário logado falha com:

```
403 — permission denied for function has_role
```

Resultado prático: após o login, o `AuthProvider` não consegue ler `profiles` nem `user_roles`, então `loading` nunca termina de forma útil e nenhuma tela do `/app/*` renderiza dados.

Essa revogação foi um falso positivo do scanner: funções `SECURITY DEFINER` são, por definição, expostas a roles de cliente — a segurança vem do corpo da função, não da ausência de `EXECUTE`.

## Solução

Nova migração que restaura o `EXECUTE` para `authenticated` (e `anon` quando aplicável):

```sql
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_status(uuid) TO authenticated;
```

Não devolvo `EXECUTE` para `anon` por padrão (não há fluxo anônimo no app); se algo quebrar para visitante deslogado, adiciono na sequência.

## Memória de segurança

Atualizo `@security-memory` para que o próximo scan **não** marque novamente esse `EXECUTE` como vulnerabilidade, registrando que essas funções são `SECURITY DEFINER` usadas pelas policies RLS e portanto precisam continuar executáveis pelo role `authenticated`.

## Verificação

1. Após a migração, recarregar `/app/importar` no preview.
2. Confirmar nas requests de rede que `/profiles` e `/user_roles` retornam 200.
3. Confirmar que a UI sai do spinner e mostra a aba Importar.

## Fora de escopo

- Nenhuma mudança em código React/TS.
- Nenhuma mudança nas policies RLS em si.
- Nenhuma mudança no `AuthProvider`.
