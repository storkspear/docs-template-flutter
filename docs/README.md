<a id="template-flutter--docs"></a>

# template-flutter — Docs

이 문서는 `template-flutter` 로 파생 레포를 만들고 운영하는 개발자를 위한 안내예요. 처음에는 개발 여정을 따라 읽고, 작업 중에는 필요한 규약과 기능 문서를 찾아볼 수 있도록 나눴어요.

> 이 템플릿은 [`template-spring`](https://github.com/storkspear/template-spring) 과 함께 쓰도록 API 응답, 에러 코드, 인증 흐름을 맞추고 있어요. 두 레포를 함께 운영하는 앱 공장 전략이 기준이며, 서버가 필요 없는 앱은 로컬 전용 recipe 를 사용할 수 있어요.

---

## 시작하기

처음 이 레포를 만났다면 **여정 문서부터** 읽어주세요. 어디서부터 시작할지, 다음은 뭘 읽을지가 단계별로 안내돼요.

- [`Developer Journey — 전체 읽기 순서`](./journey/README.md)

그다음에는 작업에 필요한 영역을 골라 읽으면 돼요.

---

<a id="철학--설계-결정-philosophy"></a>

## 철학 & 설계 결정 (philosophy/)

ADR 은 설계 당시의 문제, 선택한 방법, 대안을 기록해요. 여러 앱을 혼자 개발하고 운영할 때 공통으로 필요한 구조와 각 앱에서 따로 결정할 부분을 설명해요.

- [`Philosophy — ADR 전체 인덱스`](./philosophy/README.md)
- 테마별 ADR 카드 — 테마 1 (레포 구조) · 테마 2 (상태관리) · 테마 3 (네트워크) · 테마 4 (저장소) · 테마 5 (UI·UX) · 테마 6 (운영·배포)

## 개발 여정 (journey/)

파생 레포 개발자가 시간 순서로 따라가는 문서들이에요.

- [`Architecture`](./journey/architecture.md) — 모듈 구조 한눈 요약
- [`Onboarding`](./journey/onboarding.md) — 파생 레포 최초 셋업
- [`Build First App`](./journey/build-first-app.md) — 목록 조회 기능을 만드는 단계별 예제
- [`Deployment`](./journey/deployment.md) — 파생 레포 첫 운영 배포
- [`Dogfood FAQ`](./journey/dogfood-faq.md) — 자주 묻는 질문
- [`Dogfood Pitfalls`](./journey/dogfood-pitfalls.md) — 자주 막히는 함정 모음

<a id="아키텍처-architecture--시스템-구조"></a>

## 아키텍처 (architecture/) — 시스템 구조

구조 레퍼런스 문서예요. "어떻게 생겼는지" 빠르게 파악하고 싶을 때 참고합니다.

- [`Module Dependencies`](./architecture/module-dependencies.md) — core / kits / common / features 의존 방향
- [`FeatureKit Contract`](./architecture/featurekit-contract.md) — AppKit 인터페이스 전체 명세
- [`Boot Sequence`](./architecture/boot-sequence.md) — 앱 시작 시 순서도

<a id="컨벤션-conventions--코드-작성-규약"></a>

## 컨벤션 (conventions/) — 코드 작성 규약

- [`Overview`](./conventions/README.md)
- [`Architecture`](conventions/viewmodel-mvvm.md) — MVVM · 모듈 의존 방향 · 에러 처리 한눈
- [`Naming`](./conventions/naming.md) — 파일 · 클래스 · Provider 명명
- [`ViewModel + MVVM`](./conventions/viewmodel-mvvm.md) — Notifier · ConsumerWidget 패턴
- [`Error Handling`](./conventions/error-handling.md) — ApiException · safeErrorCode/Message · 인터셉터 순서
- [`Loading UX`](./conventions/loading-ux.md) — 4가지 로딩 패턴
- [`i18n`](./conventions/i18n.md) — ARB · gen_l10n 원칙
- [`Theme Tokens`](./conventions/theme-tokens.md) — Spacing · Typography · Palette 디자인 토큰
- [`Kits`](./conventions/kits.md) — FeatureKit 작성 · manifest · 의존 관계 룰
- [`API Contract`](api-contract/README.md) — 백엔드 응답 · 검색 · 에러 코드 계약
- [`Figma Handoff`](./conventions/figma-handoff.md) — Figma 디자인 핸드오프

<a id="기능-가이드-features--개별-kit-상세"></a>

## 기능 가이드 (features/) — 개별 Kit 상세

각 FeatureKit 의 계약 · 의존 · 사용법을 담아요. Kit 을 활성화하기 전에 해당 문서부터 읽어주세요.

- [`Kit 목록 + 의존 관계도`](./features/README.md)
- [`auth_kit`](./features/auth-kit.md) — JWT · 소셜 로그인
- [`backend_api_kit`](./features/backend-api-kit.md) — Dio · 3개 인터셉터
- [`payment_kit`](./features/payment-kit.md) — 결제 (Stripe 통합 골격, 파생 레포에서 SDK 추가)
- [`observability_kit`](./features/observability-kit.md) — Sentry · PostHog 번들
- [`notifications_kit`](./features/notifications-kit.md) — 로컬 · 푸시
- [`local_db_kit`](./features/local-db-kit.md) — Drift · 마이그레이션
- [`update_kit`](./features/update-kit.md) — 강제 업데이트
- [`onboarding_kit`](./features/onboarding-kit.md) — 다단계 위자드
- [`nav_shell_kit`](./features/nav-shell-kit.md) — 하단 탭 셸
- [`charts_kit`](./features/charts-kit.md) — fl_chart 래핑
- [`ads_kit`](./features/ads-kit.md) — AdMob · UMP · ATT
- [`background_kit`](./features/background-kit.md) — workmanager
- [`permissions_kit`](./features/permissions-kit.md) — 런타임 권한
- [`device_info_kit`](./features/device-info-kit.md) — 기기 정보
- [`file_kit`](./features/file-kit.md) — 파일 선택 · 업로드 · 다운로드

<a id="api-계약-api-contract--template-spring-과의-쌍"></a>

## API 계약 (api-contract/) — template-spring 과의 쌍

백엔드와 클라이언트가 함께 지키는 요청·응답 규약이에요. 필드나 의미를 바꿀 때는 양쪽 구현과 계약 문서를 함께 확인해요.

- [`Response Schema`](./api-contract/response-schema.md) — `{data, error}` 구조
- [`Search Request`](./api-contract/search-request.md) — SearchRequestBuilder 연산자
- [`Error Codes`](./api-contract/error-codes.md) — ErrorCode enum 동기화
- [`Auth Flow`](./api-contract/auth-flow.md) — JWT · appSlug 흐름
- [`User Profile`](./api-contract/user-profile.md) — `/users/me` 조회 · PATCH
- [`Devices`](./api-contract/devices.md) — 푸시 기기 등록 / 해제
- [`Notification Settings`](./api-contract/notification-settings.md) — 알림 종류별 채널 설정
- [`File API`](./api-contract/file-api.md) — 파일 업로드 · 조회 · 삭제 계약

<a id="인프라--운영-infra"></a>

## 인프라 / 운영 (infra/)

- [`Android Deployment`](./infra/android-deployment.md) — Fastlane · GHA · Play Internal
- [`iOS Deployment`](./infra/ios-deployment.md) — Fastlane · App Store Connect
- [`Security`](./infra/security.md) — R8 난독화 · SSL 핀닝 · Keychain 정책
- [`CI/CD`](./infra/ci-cd.md) — GitHub Actions 워크플로우
- [`Secrets Management`](./infra/secrets-management.md) — .env · GHA Secrets 구분

## 테스팅 (testing/)

- [`Testing Strategy`](./testing/testing-strategy.md) — 계층별 테스트 전략
- [`Contract Testing`](./testing/contract-testing.md) — Kit 계약 테스트

## 참조 (reference/)

- [`Scripts`](./reference/scripts.md) — `scripts/*.sh` 사용법
- [`Recipes`](./reference/recipes.md) — 4가지 recipe (local-only / local-notifier / backend-auth / social-auth)
- [`Glossary`](./reference/glossary.md) — 용어 사전 (파생 레포 · Kit · Recipe 등)
- [`Migration from Template`](./reference/migration-from-template.md) — cherry-pick 전파 규칙

---

## 문서 작성 규칙

이 레포의 `docs/` 는 [`STYLE_GUIDE.md`](./STYLE_GUIDE.md) 의 컨벤션을 따라요. 새 문서를 추가하거나 기존 문서를 수정할 때는 해당 가이드를 먼저 확인해주세요.

문서의 목적에 맞는 구조를 사용하고, 사실과 적용 조건을 먼저 분명히 해요. 문체와 링크 표기는 스타일 가이드의 공통 규칙을 따라요.

---

## 빠른 시작

```bash
# 1. Use this template → 새 레포 생성 후 클론
git clone git@github.com:<org>/<your-app>.git && cd <your-app>

# 2. factory CLI 등록 + rename + .env + pub get 한 번에
./factory install
<repo> local init <slug> com.<org>.<slug>

# 3. 구성 검증
dart run tool/configure_app.dart

# 4. 실행 — mock 자동 폴백 (백엔드/Firebase 없이 시연 가능)
<repo> local start

# 4-b. 실 OAuth 까지 검증할 때 (Firebase 자동화)
firebase login
<repo> dev init      # Firebase dev project + iOS/Android 앱 + plist/json
<repo> dev start
```

자세한 단계는 [`Build First App`](./journey/build-first-app.md) 과 [`Onboarding`](./journey/onboarding.md) 에서 확인해요.
