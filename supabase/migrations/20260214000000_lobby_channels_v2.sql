ALTER TABLE public.channels
ADD COLUMN IF NOT EXISTS sort_order INTEGER;

INSERT INTO public.channels (name, description, emoji) VALUES
  ('hiring', '구인 공고를 올려주세요 💼', '💼'),
  ('looking', '구직/이직 중이라면 글 남겨주세요 🔍', '🔍'),
  ('til', '오늘 배운 것/팁 공유 📝', '📝')
ON CONFLICT (name) DO NOTHING;

UPDATE public.channels
SET
  description = CASE name
    WHEN 'general' THEN '자유롭게 대화하세요 💬'
    WHEN 'introductions' THEN '자기소개를 해주세요 👋'
    WHEN 'projects' THEN '프로젝트를 공유해주세요 🚀'
    WHEN 'hiring' THEN '구인 공고를 올려주세요 💼'
    WHEN 'looking' THEN '구직/이직 중이라면 글 남겨주세요 🔍'
    WHEN 'til' THEN '오늘 배운 것/팁 공유 📝'
    ELSE description
  END,
  emoji = CASE name
    WHEN 'general' THEN '💬'
    WHEN 'introductions' THEN '👋'
    WHEN 'projects' THEN '🚀'
    WHEN 'hiring' THEN '💼'
    WHEN 'looking' THEN '🔍'
    WHEN 'til' THEN '📝'
    ELSE emoji
  END,
  sort_order = CASE name
    WHEN 'general' THEN 10
    WHEN 'introductions' THEN 20
    WHEN 'projects' THEN 30
    WHEN 'hiring' THEN 40
    WHEN 'looking' THEN 50
    WHEN 'til' THEN 60
    ELSE sort_order
  END
WHERE name IN ('general', 'introductions', 'projects', 'hiring', 'looking', 'til');
