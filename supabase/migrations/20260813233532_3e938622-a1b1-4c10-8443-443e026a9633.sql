UPDATE public.nbi_documents d
SET snapshot = coalesce(d.snapshot,'{}'::jsonb) || jsonb_build_object(
  'homologacao', jsonb_build_object(
    'ambiente','homologacao',
    'valido_para_uso_oficial', false,
    'classificado_em', now(),
    'bloco','12F',
    'evidencia', CASE WHEN d.numero='002' THEN 'regressao_bloco_12E_geracao_incompleta' ELSE 'homologacao_aprovada' END,
    'observacao', CASE WHEN d.numero='002'
      THEN 'Documento de homologacao — geracao incompleta, numero reservado, sem arquivo. Evidencia historica da falha corrigida no Bloco 12E. NAO VALIDO PARA USO OFICIAL.'
      ELSE 'Documento de homologacao — evidencia de teste aprovado. NAO VALIDO PARA USO OFICIAL.' END
  )),
  titulo = CASE WHEN coalesce(d.titulo,'') LIKE '[HOMOLOGACAO]%' THEN d.titulo
                ELSE '[HOMOLOGACAO] ' || coalesce(d.titulo,'NBI') END,
  updated_at = now()
FROM public.profiles p
WHERE p.id = d.user_id AND p.email LIKE 'homologacao%';