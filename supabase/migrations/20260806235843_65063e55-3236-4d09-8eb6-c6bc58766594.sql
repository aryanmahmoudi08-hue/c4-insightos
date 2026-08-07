CREATE POLICY "anon upload win proof" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'win-proof');

CREATE POLICY "members read win proof" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'win-proof');

CREATE POLICY "members delete win proof" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'win-proof');