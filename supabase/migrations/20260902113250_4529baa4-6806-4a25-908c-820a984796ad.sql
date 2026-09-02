-- Bloco 13B.4 — remoção de superfície desnecessária do papel anon.
-- Nenhuma policy do schema public concede acesso a anon (verificado em
-- pg_policies: zero linhas para anon/public), e nenhum fluxo público usa
-- acesso anônimo direto às tabelas — webhooks e rotinas servidoras usam
-- service_role. Grants de authenticated e service_role permanecem intactos.
-- Sequences, funções, auth e storage NÃO são tocados.

REVOKE SELECT, INSERT, UPDATE, DELETE ON public.asaas_subscriptions FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.billing_events FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.billing_subject_state FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.escala_ordinaria_membros FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.escalas_geradas FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.escalas_ordinarias FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.ferias_militares FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.militares FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.nbi_auditoria FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.nbi_documents FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.nbi_fundamentos FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.nbi_numeracao FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.nbi_numeracao_log FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.nbi_settings FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.nbi_siglas_institucionais FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.nbi_substituicoes FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.nbi_template_versions FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.nbi_templates FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.nexano_subscriptions FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.profiles FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.stripe_subscriptions FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.user_roles FROM anon;