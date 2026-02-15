-- Portfolio notes: Experience & Projects
-- These are public notes visible to all visitors

UPDATE public.notes
SET
  title = 'Experience',
  content = E'## 한화 (현 한화에어로스페이스) — 방산\n\n> 하드웨어부터 소프트웨어까지 혼자 만들어본 경험이 개발자로서의 기반이 됐다.\n\n회로 설계 → PCB 제작 → 펌웨어 개발 → 완제품 조립/시험 → MIL-STD 인증까지 풀사이클. 소프트웨어 신뢰성시험, 환경안전 관리, 사업 수주 제안서 작성.\n\n`Embedded` `Hardware` `Firmware` `MIL-STD` `신뢰성시험`\n\n---\n\n## 한화시스템\n\n> AI 쪽으로 전환하면서 연구부터 제품화(사내벤처)까지 경험했다.\n\nAI 논문·기술 조사 및 보고, 데이터셋 구축 지원. 자율 무인 수상정 연구. EO 기반 TensorFlow 자율주행 PoC 개발. 사내벤처 — Edge 디바이스(Jetson)에서 다중 카메라 실시간 영상 감지 AI 개발. 해양·우주/위성 사업 수주 참여, AI 기술 세미나.\n\n`TensorFlow` `Edge AI` `Jetson` `실시간 영상감지` `사내벤처`\n\n---\n\n## 아이넥스코퍼레이션 — 의료기기\n\n> 고객 접점에서 직접 뛰며 제품을 설명하고, 현장 문제를 디버깅하고, 제품개발 전반을 관리했다.\n\n대장/위내시경 제품개발 관리, 국책과제 사업 수주, CS 지원, RA 인허가 지원. [SIDDS 2024 학회 발표](https://www.mt.co.kr/future/2024/04/23/2024042316345762856) (내시경 AI 효과성 검증).\n\n`Medical Device` `RA` `국책과제` `제품개발` `학회발표`',
  category = 'portfolio',
  emoji = '💼',
  "public" = true,
  session_id = NULL
WHERE slug = 'experience' AND "public" = true;

INSERT INTO public.notes (title, content, slug, category, emoji, "public", session_id, created_at)
SELECT
  'Experience',
  E'## 한화 (현 한화에어로스페이스) — 방산\n\n> 하드웨어부터 소프트웨어까지 혼자 만들어본 경험이 개발자로서의 기반이 됐다.\n\n회로 설계 → PCB 제작 → 펌웨어 개발 → 완제품 조립/시험 → MIL-STD 인증까지 풀사이클. 소프트웨어 신뢰성시험, 환경안전 관리, 사업 수주 제안서 작성.\n\n`Embedded` `Hardware` `Firmware` `MIL-STD` `신뢰성시험`\n\n---\n\n## 한화시스템\n\n> AI 쪽으로 전환하면서 연구부터 제품화(사내벤처)까지 경험했다.\n\nAI 논문·기술 조사 및 보고, 데이터셋 구축 지원. 자율 무인 수상정 연구. EO 기반 TensorFlow 자율주행 PoC 개발. 사내벤처 — Edge 디바이스(Jetson)에서 다중 카메라 실시간 영상 감지 AI 개발. 해양·우주/위성 사업 수주 참여, AI 기술 세미나.\n\n`TensorFlow` `Edge AI` `Jetson` `실시간 영상감지` `사내벤처`\n\n---\n\n## 아이넥스코퍼레이션 — 의료기기\n\n> 고객 접점에서 직접 뛰며 제품을 설명하고, 현장 문제를 디버깅하고, 제품개발 전반을 관리했다.\n\n대장/위내시경 제품개발 관리, 국책과제 사업 수주, CS 지원, RA 인허가 지원. [SIDDS 2024 학회 발표](https://www.mt.co.kr/future/2024/04/23/2024042316345762856) (내시경 AI 효과성 검증).\n\n`Medical Device` `RA` `국책과제` `제품개발` `학회발표`',
  'experience',
  'portfolio',
  '💼',
  true,
  NULL,
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.notes WHERE slug = 'experience' AND "public" = true
);

UPDATE public.notes
SET
  title = 'Projects',
  content = E'## Solace — 나를 위한 1인 감성 SNS\n\n🏆 **Build with TRAE @Seoul 해커톤 최우수상** (ByteDance, 2026.01)\n\nAI 페르소나들과 소통하며 위로받는 나만의 소셜 네트워크.\n\n🔗 [dearsolace.kr](https://dearsolace.kr)\n\n`Vibe Coding` `AI` `SNS`\n\n---\n\n## cozac.dev — macOS 포트폴리오 사이트\n\nmacOS/iOS에서 영감을 받은 인터랙티브 포트폴리오 웹사이트. 윈도우 매니저, Dock, 다양한 앱(Notes, Finder, Messages, Lobby 등)을 웹에서 구현.\n\n🔗 [cozac.dev](https://cozac.dev)\n\n`Next.js` `TypeScript` `Supabase` `Tailwind CSS`',
  category = 'portfolio',
  emoji = '🚀',
  "public" = true,
  session_id = NULL
WHERE slug = 'projects' AND "public" = true;

INSERT INTO public.notes (title, content, slug, category, emoji, "public", session_id, created_at)
SELECT
  'Projects',
  E'## Solace — 나를 위한 1인 감성 SNS\n\n🏆 **Build with TRAE @Seoul 해커톤 최우수상** (ByteDance, 2026.01)\n\nAI 페르소나들과 소통하며 위로받는 나만의 소셜 네트워크.\n\n🔗 [dearsolace.kr](https://dearsolace.kr)\n\n`Vibe Coding` `AI` `SNS`\n\n---\n\n## cozac.dev — macOS 포트폴리오 사이트\n\nmacOS/iOS에서 영감을 받은 인터랙티브 포트폴리오 웹사이트. 윈도우 매니저, Dock, 다양한 앱(Notes, Finder, Messages, Lobby 등)을 웹에서 구현.\n\n🔗 [cozac.dev](https://cozac.dev)\n\n`Next.js` `TypeScript` `Supabase` `Tailwind CSS`',
  'projects',
  'portfolio',
  '🚀',
  true,
  NULL,
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.notes WHERE slug = 'projects' AND "public" = true
);
