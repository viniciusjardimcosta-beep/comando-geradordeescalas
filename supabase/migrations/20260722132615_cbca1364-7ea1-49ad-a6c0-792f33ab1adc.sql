
CREATE POLICY "nbi own read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'nbi-documentos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "nbi own insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'nbi-documentos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "nbi own update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'nbi-documentos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "nbi own delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'nbi-documentos' AND auth.uid()::text = (storage.foldername(name))[1]);
