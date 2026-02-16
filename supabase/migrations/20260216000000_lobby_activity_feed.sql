ALTER TABLE public.channels
ADD COLUMN IF NOT EXISTS sort_order INTEGER;

INSERT INTO public.channels (name, description, emoji, sort_order)
VALUES
  (
    'general',
    '방명록 겸 자유 대화 공간입니다. 답변은 비정기적으로 확인합니다 💬',
    '💬',
    10
  ),
  (
    'activity',
    'GitHub와 배포 활동이 자동으로 올라옵니다 ⚡',
    '⚡',
    20
  )
ON CONFLICT (name) DO UPDATE
SET
  description = EXCLUDED.description,
  emoji = EXCLUDED.emoji,
  sort_order = EXCLUDED.sort_order;
