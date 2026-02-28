-- Life Deck: Candid Courage Fund 지원용 공개 노트 4종
-- category='life-deck', public=true, session_id=NULL

-- 01: 나는 누구인가
INSERT INTO public.notes (title, content, slug, category, emoji, "public", session_id, created_at)
SELECT
  '나는 누구인가',
  E'*Life Deck 01*\n\n내용을 작성해 주세요.',
  'life-deck-01',
  'life-deck',
  '🪪',
  true,
  NULL,
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.notes WHERE slug = 'life-deck-01'
);

-- 02: 어떻게 살아왔는가
INSERT INTO public.notes (title, content, slug, category, emoji, "public", session_id, created_at)
SELECT
  '어떻게 살아왔는가',
  E'*Life Deck 02*\n\n내용을 작성해 주세요.',
  'life-deck-02',
  'life-deck',
  '🛤️',
  true,
  NULL,
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.notes WHERE slug = 'life-deck-02'
);

-- 03: 어떻게 살 것인가
INSERT INTO public.notes (title, content, slug, category, emoji, "public", session_id, created_at)
SELECT
  '어떻게 살 것인가',
  E'*Life Deck 03*\n\n내용을 작성해 주세요.',
  'life-deck-03',
  'life-deck',
  '🧭',
  true,
  NULL,
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.notes WHERE slug = 'life-deck-03'
);

-- 04: 용기자금이 필요한 이유
INSERT INTO public.notes (title, content, slug, category, emoji, "public", session_id, created_at)
SELECT
  '용기자금이 필요한 이유',
  E'*Life Deck 04*\n\n내용을 작성해 주세요.',
  'life-deck-04',
  'life-deck',
  '🔥',
  true,
  NULL,
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.notes WHERE slug = 'life-deck-04'
);
