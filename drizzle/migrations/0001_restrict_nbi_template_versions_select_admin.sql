DROP POLICY IF EXISTS "read nbi_template_versions" ON public.nbi_template_versions;
CREATE POLICY "read nbi_template_versions" ON public.nbi_template_versions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));