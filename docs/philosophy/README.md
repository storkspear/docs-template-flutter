<a id="repository-philosophy--책-안내"></a>

# Repository Philosophy — 책 안내

이 문서는 `template-flutter` 이 **왜 현재의 구조를 가지게 되었는지** 설명하는 **ADR (Architecture Decision Record) 카드** 모음이에요.

각 ADR 은 여러 앱을 혼자 개발하고 운영할 때 생기는 문제와 그때 선택한 방법을 기록해요. 결정 당시의 배경과 현재 구현을 구분해서 읽으면 다른 앱에 적용할 범위를 판단하기 쉬워요.

---

<a id="프롤로그--배경-및-철학"></a>

## 프롤로그 — 배경 및 철학

### 맥락: 앱 공장 전략

이 레포는 한 사람이 여러 앱을 만들고 개선하는 작업 방식을 전제로 해요. [`template-spring`](https://github.com/storkspear/template-spring) 과 함께 쓰는 앱에서는 같은 개발자가 프론트엔드와 백엔드를 운영해요.

이 작업 방식에서 다음 세 가지를 설계 기준으로 삼아요.

<a id="제약-1--운영-가능성이-최우선"></a>

#### 제약 1 — 운영 가능성이 최우선

앱이 늘어나면 프로젝트 설정, 대시보드, 정산, 스토어 등록 정보를 관리하는 일도 늘어나요. 예를 들어 앱마다 다음 항목을 확인해야 할 수 있어요.

- Firebase 프로젝트와 플랫폼별 앱 설정
- Sentry 프로젝트와 오류 알림
- AdMob 설정과 정산 정보
- Play Console·App Store Connect 의 앱 등록 정보

크래시와 사용자 문의에 대응하고 업데이트를 배포할 시간도 필요해요. 그래서 이 프로젝트는 운영자가 유지할 수 있는 구조를 설계 기준으로 삼아요. 새 기술을 추가할 때는 얻는 효과와 관리할 일을 함께 비교해요.

<a id="제약-2--시간이-가장-희소한-자원"></a>

#### 제약 2 — 시간이 가장 희소한 자원

무료 플랜과 공통 도구를 활용하면 초기 비용을 줄일 수 있지만, 실제 비용은 앱 수와 사용량에 따라 달라져요. 이 프로젝트는 반복 작업에 드는 개발 시간을 특히 아끼려 해요.

이 비대칭성이 설계에 직접 반영돼요.

- 매번 재구현되는 공통 작업 (인증, 테마, 네트워크, 캐시, i18n, 관측성) 은 **반드시 한 번만 잘 만들고 재사용**
- 앱 이름·식별자 변경 같은 반복 설정은 `factory` 와 스크립트로 처리해요. 외부 콘솔 설정과 앱 고유 값은 별도로 확인해요.
- 문서 작성에 들어가는 시간도 비용이므로, 코드 자체가 읽기 쉽게 (**"코드가 문서"** 원칙)

시간을 아끼는 모든 설계 결정이 여기서 출발해요.

<a id="제약-3--복권-사기-모델"></a>

<a id="제약-3-복권-사기-모델"></a>

#### 제약 3 — 새 앱을 반복해서 시도할 수 있어야 해요

앱의 시장 반응을 미리 확정하기는 어려워요. 이 템플릿은 공통 기반을 재사용해 새 앱을 시험하고 수정하는 비용을 줄이는 데 초점을 둬요.

인증·테마·네트워크 같은 기반을 재사용하면 앱 고유의 기능과 출시 검증에 집중할 수 있어요. 새 앱에 필요한 기능과 외부 연동은 각각 구현하고 확인해야 해요.

### 이 세 제약이 모든 ADR 의 공통 전제

각 ADR 은 운영 부담, 반복 작업 시간, 새 앱을 시험하는 비용 가운데 어떤 문제를 줄이려는지 함께 설명해요. 같은 선택도 앱의 요구와 운영 조건에 따라 다시 검토할 수 있어요.

예를 들어:

- ADR-001 이 "Use this template + cherry-pick" 을 선택한 이유는 제약 2 (공통 코드 재사용) 때문
- ADR-003 이 "FeatureKit 동적 레지스트리" 를 선택한 이유는 제약 3 (앱마다 필요 기능이 다름 → 선택 조립)
- [ADR-019](./adr-019-solo-friendly.md)는 운영 부담과 반복 작업을 함께 줄이기 위해 관리형 서비스와 직접 운영의 시간·비용을 비교해요.

각 ADR을 읽을 때는 운영에 필요한 시간, 반복 작업의 비용, 새 앱을 시험하는 데 드는 부담을 함께 살펴보세요. 같은 기술도 프로젝트의 제약에 따라 다른 선택을 할 수 있어요.

---

## 이 문서의 사용법

각 ADR 은 하나의 설계 결정을 다뤄요. 처음에는 레포 구조부터 읽고, 작업 중에는 질문에 맞는 ADR 을 찾아보면 돼요.

### 독자별 추천 경로

**처음 이 레포를 만난 분**  
위 프롤로그 → 테마 1 의 ADR 부터 순서대로 읽기. 테마 1 만 읽어도 "이 레포가 어떻게 생긴 건지" 대부분 이해돼요.

**Flutter 를 사용해 본 분**

각 ADR 의 상태와 결정, 현재 구현부터 확인해요. 필요한 부분만 골라 읽고 대안과 한계로 이어서 볼 수 있어요.

**"왜 이렇게 만들었는지" 가 궁금한 분**  
각 ADR 의 **왜 이런 고민이 시작됐나? + 고민했던 대안들 + 교훈** 을 읽으세요. 결정의 **배경과 시행착오** 가 담겨 있어요.

**특정 문제에 부딪혀서 해결책 찾는 분**  
아래 "어떤 질문에 어떤 ADR?" 매핑 표로 바로 점프하세요.

### 어떤 질문에 어떤 ADR?

| 이 질문이 궁금하다면 | 이 ADR 을 읽으세요 |
|---|---|
| "파생 레포끼리 공통 코드를 어떻게 동기화하지?" | [`ADR-001: GitHub Template + cherry-pick`](./adr-001-template-cherry-pick.md) |
| "`core/`, `kits/`, `common/`, `features/` 는 어떻게 다른가?" | [`ADR-002: 3계층 모듈 구조`](./adr-002-layered-modules.md) |
| "Kit 은 왜 런타임에 조립되는가?" | [`ADR-003: FeatureKit 동적 레지스트리`](./adr-003-featurekit-registry.md) |
| "왜 `app_kits.yaml` 과 `main.dart` 두 곳에 kit 선언?" | [`ADR-004: 수동 동기화 + CI 검증`](./adr-004-manual-sync-ci-audit.md) |
| "상태 관리는 왜 Riverpod + MVVM?" | [`ADR-005: Riverpod + Notifier`](./adr-005-riverpod-mvvm.md) |
| "왜 서비스는 인터페이스 + Debug 구현체 패턴?" | [`ADR-006: 인터페이스 기반 서비스 교체`](./adr-006-debug-fallback.md) |
| "ApiClient ↔ AuthService 순환 의존을 어떻게?" | [`ADR-007: Late Binding`](./adr-007-late-binding.md) |
| "스플래시 중 뭘 하는가?" | [`ADR-008: 부팅 단계 추상화`](./adr-008-boot-step.md) |
| "백엔드 응답 스키마가 왜 이렇게?" | [`ADR-009: 1:1 계약 (template-spring 과)`](./adr-009-backend-contract.md) |
| "401 받으면 자동으로 refresh 되는 원리는?" | [`ADR-010: QueuedInterceptor`](./adr-010-queued-interceptor.md) |
| "인터셉터가 3개인 이유는?" | [`ADR-011: 인터셉터 체인 (Auth / Error / Logging)`](./adr-011-interceptor-chain.md) |
| "앱마다 유저 테이블이 따로인가?" | [`ADR-012: 앱별 독립 유저 + JWT appSlug`](./adr-012-per-app-user.md) |
| "토큰은 어디에 저장?" | [`ADR-013: SecureStorage + 원자적 저장`](./adr-013-token-atomic-storage.md) |
| "캐시 정책은 어떻게 선택?" | [`ADR-014: 정책 기반 캐싱`](./adr-014-cached-repository.md) |
| "테마 색상을 런타임에 바꿀 수 있나?" | [`ADR-015: Palette 레지스트리`](./adr-015-palette-registry.md) |
| "i18n 은 언제부터 해야 하나?" | [`ADR-016: 처음부터 (ARB + gen_l10n)`](./adr-016-i18n-from-start.md) |
| "로딩 UI 는 어떻게 통일하나?" | [`ADR-017: 4가지 로딩 UX 패턴`](./adr-017-loading-ux.md) |
| "라우팅 게이트 우선순위는?" | [`ADR-018: Kit 별 redirectPriority`](./adr-018-redirect-priority.md) |
| "결정 내릴 때 어떤 기준으로 판단?" | [`ADR-019: 솔로 친화적 운영`](./adr-019-solo-friendly.md) |
| "보안은 뭐부터 지켜야 하나?" | [`ADR-020: 이중 난독화 + SSL 핀닝 + Keychain`](./adr-020-security-hardening.md) |
| "같은 템플릿으로 여러 유형의 앱을 만들 수 있나?" | [`ADR-021: Multi-Recipe 구성`](./adr-021-multi-recipe.md) |
| "정적 분석 룰셋은 어디까지 엄격하게?" | [`ADR-022: very_good_analysis + 큐레이션`](./adr-022-very-good-analysis.md) |
| "폰트도 앱별로 교체 가능한가?" | [`ADR-023: Typeface 레지스트리`](./adr-023-typeface-registry.md) |

### ADR 카드의 읽는 법

ADR 에서는 결정의 상태, 배경, 선택한 방법, 대안과 한계, 관련 구현을 확인해요. 모든 문서에 같은 절 수나 교훈 개수를 요구하지는 않아요. 상세 작성 기준은 [스타일 가이드](../STYLE_GUIDE.md) 를 따라요.

- **상태**: 결정이 유지·변경·폐기되었는지 확인해요.
- **배경과 결정**: 어떤 문제를 풀기 위해 무엇을 선택했는지 읽어요.
- **대안과 한계**: 다른 선택을 하지 않은 이유와 현재 방식의 제약을 살펴봐요.
- **근거와 구현**: 관련 자료와 코드에서 실제 적용 범위를 확인해요.

각 섹션은 독립적으로 읽을 수 있도록 쓰여 있어요.

---

## 전체 ADR 목록 (테마별)

<a id="테마-1--레포지토리-구조의-기반"></a>

### 테마 1 — 레포지토리 구조의 기반

**이 테마가 답하는 물음**: "솔로 개발자가 여러 Flutter 앱을 감당 가능한 레포지토리 구조는 어떤 모양인가?"

```
ADR-001 (GitHub Template + cherry-pick)
  "파생 레포는 본인 도메인, 공통은 템플릿 원본. 수동 전파가 오히려 안전"
   │
   │ 레포 안 구조는?
   ▼
ADR-002 (3계층 모듈 구조)
  "core / kits / common / features — 책임별 분리"
   │
   │ 선택적 기능은 어떻게 조립?
   ▼
ADR-003 (FeatureKit 동적 레지스트리)
  "AppKit 계약에 맞춰 Dart 에서 조립하고 YAML 선언을 함께 관리"
   │
   │ 위 3가지를 실제로 지키려면?
   ▼
ADR-004 (YAML ↔ Dart 수동 동기화 + CI 검증)
  "configure_app.dart --audit 로 CI 에서 실수 차단"
```

- [`ADR-001 · GitHub Template Repository 패턴 + cherry-pick 전파`](./adr-001-template-cherry-pick.md)
- [`ADR-002 · 3계층 모듈 구조 (core / kits / common / features)`](./adr-002-layered-modules.md)
- [`ADR-003 · FeatureKit 동적 레지스트리 (AppKit 계약)`](./adr-003-featurekit-registry.md)
- [`ADR-004 · app_kits.yaml ↔ main.dart 수동 동기화 + CI 검증`](./adr-004-manual-sync-ci-audit.md)

<a id="테마-2--상태-관리--아키텍처"></a>

### 테마 2 — 상태 관리 & 아키텍처

**이 테마가 답하는 물음**: "솔로 개발자가 감당 가능한 상태 관리와 DI 구조는 무엇인가?"

- [`ADR-005 · Riverpod + MVVM (Notifier + ConsumerWidget)`](./adr-005-riverpod-mvvm.md)
- [`ADR-006 · 인터페이스 기반 서비스 교체 + Debug 폴백`](./adr-006-debug-fallback.md)
- [`ADR-007 · Late Binding 으로 순환 의존 해결`](./adr-007-late-binding.md)
- [`ADR-008 · 부팅 단계 추상화 (BootStep + SplashController)`](./adr-008-boot-step.md)

<a id="테마-3--네트워크--백엔드-계약"></a>

### 테마 3 — 네트워크 & 백엔드 계약

**이 테마가 답하는 물음**: "template-spring 과 어떻게 쌍을 이루며, HTTP 계층은 어떻게 추상화하는가?"

- [`ADR-009 · 백엔드 응답 1:1 계약 ({data, error} + PageResponse)`](./adr-009-backend-contract.md)
- [`ADR-010 · QueuedInterceptor 로 401 자동 갱신`](./adr-010-queued-interceptor.md)
- [`ADR-011 · 3층 인터셉터 체인 (Auth / Error / Logging)`](./adr-011-interceptor-chain.md)
- [`ADR-012 · 앱별 독립 유저 + JWT appSlug 클레임`](./adr-012-per-app-user.md)

<a id="테마-4--데이터--저장소"></a>

### 테마 4 — 데이터 & 저장소

**이 테마가 답하는 물음**: "민감도가 다른 데이터를 어디에 어떻게 저장하는가?"

- [`ADR-013 · 토큰 저장 원자성 + SecureStorage vs SharedPreferences`](./adr-013-token-atomic-storage.md)
- [`ADR-014 · 정책 기반 캐싱 (CachedRepository)`](./adr-014-cached-repository.md)

<a id="테마-5--ui--ux"></a>

### 테마 5 — UI & UX

**이 테마가 답하는 물음**: "앱마다 다른 브랜딩과 UX 를 어떻게 변주 가능하게 만드는가?"

- [`ADR-015 · 팔레트 런타임 교체 (AppPalette + Registry)`](./adr-015-palette-registry.md)
- [`ADR-016 · i18n 처음부터 (ARB + gen_l10n)`](./adr-016-i18n-from-start.md)
- [`ADR-017 · 4가지 로딩 UX 패턴`](./adr-017-loading-ux.md)
- [`ADR-018 · Kit 별 라우팅 우선순위 (redirectPriority)`](./adr-018-redirect-priority.md)
- [`ADR-023 · 폰트 런타임 교체 (AppTypeface + Registry)`](./adr-023-typeface-registry.md)

<a id="테마-6--운영--배포"></a>

### 테마 6 — 운영 & 배포

**이 테마가 답하는 물음**: "개발 · 배포 · 보안을 솔로 한 사람이 굴리는 원칙은?"

- [`ADR-019 · 솔로 친화적 운영 (개발용 폴백 · 시간과 비용의 비교)`](./adr-019-solo-friendly.md)
- [`ADR-020 · 이중 난독화 + SSL 핀닝 + Keychain 정책`](./adr-020-security-hardening.md)
- [`ADR-021 · Multi-Recipe 구성 (local-only / local-notifier / backend-auth / social-auth)`](./adr-021-multi-recipe.md)
- [`ADR-022 · very_good_analysis 도입 + 컨텍스트 기반 큐레이션`](./adr-022-very-good-analysis.md)

---

## 템플릿 유지 규칙 (절대 금지)

다음 중립성 규칙은 템플릿 레포에 적용해요. 앱 고유 도메인과 설정은 파생 레포에서 관리해요.

- **특정 앱 / 도메인 / 팀 / 회사 이름** 을 코드나 문서에 박지 않아요. 템플릿이 중립적이어야 어느 도메인으로든 가지를 뻗을 수 있어요.
- **특정 인프라 자격증명, Bundle ID, 프로젝트 ID** 를 커밋하지 않아요. Firebase project-ref, Google Client ID, Sentry DSN 등은 파생 레포의 `.env` 에서만 존재해야 해요.
- **실제 비즈니스 로직** 을 이 레포에 쓰지 않아요 — 그건 파생 레포의 역할이에요. 여기에는 뼈대, Kit 계약, 공통 인프라만 둬요.
- **구체적인 스펙 문서** (특정 앱이 언급되는 요구사항 / API 문서 등) 를 여기 두지 않아요.
- **운영 환경 변수 파일** (`.env`, `.env.prod`) 을 커밋하지 않아요. 운영용 값은 GHA Repository Secrets 만 사용해요.

배경은 [ADR-001](./adr-001-template-cherry-pick.md) 에서 확인해요.

---

## 관련 문서

- [`Architecture 한눈 요약`](../journey/architecture.md) — 실제 구조의 상세 레퍼런스
- [`FeatureKit Contract`](../architecture/featurekit-contract.md) — AppKit 인터페이스 전체 명세
- [`Conventions`](../conventions/README.md) — 코딩 규약
- [`STYLE_GUIDE`](../STYLE_GUIDE.md) — 문서 작성 스타일 가이드

---

<a id="-책-목차--journey-1단계"></a>

## 📖 책 목차 — Journey 1단계

[`Developer Journey`](../journey/README.md) 의 **1단계 — 이 레포가 뭐야?** 입니다.

| 방향 | 문서 | 한 줄 |
|---|---|---|
| ← 이전 | (없음, 첫 단계) | 레포 루트 `README.md` 의 빠른 시작이 선행 |
| → 다음 | [`Architecture 한눈 요약`](../journey/architecture.md) | 같은 1단계, 모듈 구조 한눈 요약 |

**막혔을 때**: [`도그푸딩 함정`](../journey/dogfood-pitfalls.md) / [`FAQ`](../journey/dogfood-faq.md)  
**왜 이렇게?**: 이 문서가 "왜" 의 본진이에요. 더 깊은 인프라 결정은 [`Android Deployment`](../infra/android-deployment.md) 등 `infra/` 폴더의 5개 문서에 있어요.
