# Environment UI — 기술 스택 다이어그램

이 문서는 template-flutter 의 기술 스택을 **한 장의 다이어그램**으로 요약해요. 버전·수치의 정본은 [`journey/architecture.md`](../journey/architecture.md) 의 기술 스택 절과 `pubspec.yaml` 이에요 — 여기서는 "무엇이 어느 층에 있는가" 의 큰 그림만 잡으면 돼요.

%%TECH_STACK_DIAGRAM%%

## 읽는 법

- **코어 → 저장 → 인증 → 플랫폼** 층은 모든 파생 레포가 공통으로 갖는 기반이에요. Kit 단위 조립이라 실제 포함 여부는 `app_kits.yaml` 로 결정돼요.
- **관측성 층(점선)** 은 선택 기능이에요 — `SENTRY_DSN` / `POSTHOG_KEY` 를 주입하지 않으면 완전히 비활성(Debug 폴백)이라 비용이 없어요.
- 맨 아래 화살표는 짝 백엔드 [`template-spring`](https://github.com/storkspear/template-spring) 과의 REST `{data, error}` 계약이에요 — 계약 상세는 [`api-contract/`](../api-contract/README.md) 에 있어요.

> 💡 이 다이어그램은 docs 뷰어에서만 렌더링돼요. GitHub 에서 raw 마크다운으로 보면 `%%TECH_STACK_DIAGRAM%%` 플레이스홀더만 보여요.

## 관련 문서

- [`Architecture`](../journey/architecture.md) — 모듈 구조 · 기술 스택 절 (이 다이어그램의 정본)
- [`FeatureKit Contract`](../architecture/featurekit-contract.md) — Kit 계약 전체 명세
- [`Kits 규약`](../conventions/kits.md) — Kit 조립 · 의존 규칙
