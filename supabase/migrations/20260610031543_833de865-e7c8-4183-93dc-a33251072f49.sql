CREATE POLICY "auth read swipe images" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'copy-swipes');
CREATE POLICY "auth upload swipe images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'copy-swipes');
CREATE POLICY "auth update swipe images" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'copy-swipes');
CREATE POLICY "auth delete swipe images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'copy-swipes');