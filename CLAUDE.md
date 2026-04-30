# CLAUDE.md

Claude Code 에이전트가 이 저장소에서 작업할 때 가장 먼저 읽어야 하는 파일.

---

## 1. 이 저장소의 정체성

**Flutter 앱 공장 템플릿** — 솔로 개발자가 매번 새 앱을 출시할 때 파생 레포의 출발점이 되는 공통 뼈대.

**절대 룰**:
- 이 레포에서는 **직접 앱 개발 금지**. 'Use this template' → 파생 레포에서 작업.
- "fork" 단어 금지. **"파생 레포"**가 정답 (Use Template 방식이라 fork 아님).
- 특정 앱/회사/도메인 이름, 실제 비밀번호/API URL/DSN을 커밋 금지.
- `lib/features/`는 **스텁만** 유지 (도메인 코드는 파생 레포 영역).
- 코드 변경 시 관련 문서·온보딩·체크리스트 동기화 필수 (CLAUDE.md/README.md/kit README/recipes/.md 가이드).

---

## 2. FeatureKit 아키텍처 (5분 요약)

```
lib/
├── core/      # 모든 앱이 항상 쓰는 기반 (theme, storage, cache, i18n, widgets, utils, kits 계약)
├── kits/      # 선택형 기능 단위 (13개) — app_kits.yaml로 활성화 결정
├── common/    # 레거시 어댑터 (점진 이관 중) — providers, router, splash
└── features/  # 도메인 화면 (파생 레포에서 채움) — 여기 스텁만
```

**AppKit 계약** (`lib/core/kits/app_kit.dart`):
- `requires`: 의존 Kit 타입 — install 시 자동 검증
- `providerOverrides`: Riverpod override
- `routes`: GoRouter 라우트
- `bootSteps`: 스플래시 부트 단계
- `buildRedirect()` + `redirectPriority`: 인증/온보딩 등 라우팅 게이트
- `refreshListenable`: 라우터 리빌드 트리거

**조립 (3곳 동기화 필수)**:
1. `app_kits.yaml` — 활성 kit 선언 (진실의 출처)
2. `lib/main.dart` — `AppKits.install([...])` 리스트 (실제 코드)
3. (검증) `dart run tool/configure_app.dart` — 1과 2의 일치 리포트

---

## 3. 핵심 파일 매핑 (자주 찾는 것)

| 무엇을 찾을 때 | 파일 |
|--------------|------|
| 앱 부팅 시퀀스 | `lib/main.dart` (binding → Palette/Typeface install → AppConfig.init → 조건부 Sentry init → _bootstrap[PrefsStorage → AppKits.install → ProviderContainer → attachContainer → CrashService.init → SplashController → runApp]) |
| 라우팅 합성 | `lib/common/router/app_router.dart` (kit redirect 우선순위 정렬) |
| 전역 DI | `lib/common/providers.dart` |
| 앱 설정 | `lib/core/config/app_config.dart` (appSlug, baseUrl, supportEmail, privacyUrl 등) |
| 부팅 단계 인터페이스 | `lib/common/splash/boot_step.dart` |
| Kit 레지스트리 | `lib/core/kits/app_kits.dart` (install/rollback/dependency 검증) |
| 토큰 저장 | `lib/core/storage/token_storage.dart` (SecureStorage 래퍼) |
| 일반 설정 | `lib/core/storage/prefs_storage.dart` (SharedPreferences 래퍼) |
| 디자인 토큰 | `lib/core/theme/` (AppPalette/Registry · AppTypeface/Registry · spacing · typography) |
| HTTP 클라이언트 | `lib/kits/backend_api_kit/api_client.dart` (Dio + 3개 인터셉터) |
| 인증 상태 | `lib/kits/auth_kit/auth_state.dart`, `auth_service.dart` |
| 관측성 환경 | `lib/kits/observability_kit/observability_env.dart` (DSN/KEY 주입 확인) |
| Recipe (시작점) | `recipes/local-only-tracker.yaml`, `local-notifier-app.yaml`, `backend-auth-app.yaml` |
| 약관 동의 위젯 | `lib/core/widgets/terms_agreement_text.dart` (signup 하단 자동 노출, `AppConfig.termsUrl` null이면 이용약관 링크 숨김) |
| 인앱 리뷰 트리거 | `lib/core/review/review_trigger.dart` + `reviewTriggerProvider` (signal/openStoreListing, 정책: signal 5회 + 60일 쿨다운 + 연 3회) |
| auth 표준 화면 | `lib/kits/auth_kit/ui/password_reset/`, `ui/verify_email/` (라우트: `/forgot-password`, `/verify-email`) |
| ATT (iOS) | `lib/kits/ads_kit/att_permission_step.dart` — ads_kit 활성 시에만 작동 |
| UMP (광고 동의) | `lib/kits/ads_kit/ump_consent_step.dart` — GDPR 적용 지역 자동 폼 |

---

## 4. 동기화 규칙 (가장 자주 실수하는 곳)

### app_kits.yaml ↔ lib/main.dart
두 파일은 **수동으로** 일치시켜야 한다. 한 쪽만 수정하면 빌드는 되지만 의도와 다른 동작.

**옳은 흐름**:
1. `app_kits.yaml`에서 kit 추가/제거 (예: `local_db_kit:` 라인 추가)
2. `lib/main.dart`의 `AppKits.install([...])`에서 동일 변경 (`LocalDbKit(...)` 인스턴스 추가)
3. `dart run tool/configure_app.dart` 실행 → `Status: OK` 확인

**불일치 시 출력 예** (의존성 문제):
```
--- Dependency Issues ---
  ✗ auth_kit requires backend_api_kit, which is not enabled
Status: ISSUES FOUND
```
→ `app_kits.yaml`에 빠진 의존을 추가하거나, 의존 kit을 함께 비활성화.

### kit 추가/제거 시 함께 살필 것
- 해당 kit의 README "제거" 섹션 (보통 권한·providers 정리 가이드 포함)
- `AndroidManifest.xml` / `Info.plist`의 권한 선언
- `features/`에서 해당 kit의 provider/위젯을 import하는 코드

---

## 5. 명령어 참조

```bash
# 의존성 설치
flutter pub get

# 분석/테스트 (커밋 전 필수)
flutter analyze    # very_good_analysis 룰셋 + 큐레이션 disable (ADR-022, analysis_options.yaml)
flutter test --reporter=expanded

# 구성 검증
dart run tool/configure_app.dart
dart run tool/configure_app.dart --audit   # CI: 불일치 시 exit 1

# 로컬 실행 (관측성 활성화 예)
flutter run \
  --dart-define=SENTRY_DSN=$(grep SENTRY_DSN .env | cut -d= -f2) \
  --dart-define=POSTHOG_KEY=$(grep POSTHOG_KEY .env | cut -d= -f2)

# 코드 생성 (Drift 등)
dart run build_runner build --delete-conflicting-outputs

# l10n
flutter gen-l10n

# 테스트 커버리지 측정 (월 1회 권장, 게이트 아님)
./scripts/coverage.sh           # 측정 + HTML 리포트 + 브라우저 자동 오픈
./scripts/coverage.sh --no-open # CI/원격 환경에서 측정만
```

---

## 6. 상태관리·UI 컨벤션 (요약)

- **Riverpod + MVVM**: ConsumerWidget + StateNotifier, providers는 모듈별로 분리.
- **로딩 UX**: `docs/conventions/loading-ux.md` 규약 (skeletonizer 사용, 무한 스피너 금지).
- **네이밍**: `docs/conventions/naming.md` (snake_case 파일, PascalCase 클래스, lowerCamelCase 변수).
- **에러 처리**: `ApiException` 표준화, 사용자 메시지는 i18n ARB로.
- **i18n**: 새 문자열은 `lib/core/i18n/app_en.arb` + `app_ko.arb` 양쪽에 추가 후 `flutter gen-l10n`.

상세는 `docs/conventions/` 참조.

---

## 7. 자주 막히는 지점 (Claude가 빠지는 함정)

1. **`AppKits.install` 누락** — 새 kit 만들고 main.dart에 안 끼우면 모든 라우트/provider가 사라진 듯 보임.
2. **`AppKits.attachContainer` 호출 순서** — ProviderContainer 생성 직후 호출해야 bootStep 내부에서 `container.read` 가능.
3. **kit 간 import** — kit끼리 직접 import 금지. `requires`로 명시하고 provider로 접근.
4. **observability DSN 미주입** — `--dart-define` 없으면 Debug 폴백으로 동작 (로컬 콘솔만). Sentry/PostHog 안 작동한다고 착각하기 쉬움.
5. **redirectPriority 충돌** — UpdateKit(1) → AuthKit(10) → OnboardingKit(50) 순. 새 게이트 추가 시 우선순위 충돌 주의.
6. **i18n 누락** — 한쪽 ARB만 추가하고 `gen-l10n` 안 돌리면 빌드 실패.
7. **Drift 마이그레이션 fingerprint** — 스키마 변경 시 `test/kits/local_db_kit/migration_fingerprint_test.dart`도 갱신.
8. **`AppPaletteRegistry.install` / `AppTypefaceRegistry.install` 누락** — main.dart에서 둘 다 install 안 하면 첫 `current` 호출 시 StateError. `DefaultPalette()` / `DefaultTypeface()`가 안전한 기본값.
9. **폰트 패밀리만 바꾸고 자산 미등록** — `MyAppTypeface.fontFamily = 'Pretendard'`로 적었는데 `assets/fonts/` + `pubspec.yaml fonts` 셋업 누락 시 시스템 폰트로 silently fallback.

---

## 8. 작업 시 체크리스트

코드 변경 시:
- [ ] 새 의존성 추가했는가? → `pubspec.yaml` + 관련 README "의존" 섹션 갱신
- [ ] kit 추가/제거? → `app_kits.yaml` + `lib/main.dart` + recipes/ 갱신
- [ ] 권한 추가? → `AndroidManifest.xml` + `Info.plist` + kit README "의존" 섹션
- [ ] i18n 문자열? → ko/en ARB 모두 + `flutter gen-l10n`
- [ ] DB 스키마 변경? → 마이그레이션 step + fingerprint 테스트 갱신
- [ ] 폰트 추가? → `assets/fonts/` + `pubspec.yaml fonts` + `MyAppTypeface` + `AppTypefaceRegistry.install`
- [ ] 새 kit/모듈? → README 표준 양식 준수 (`docs/conventions/kits.md`)
- [ ] `flutter analyze` + `flutter test` 그린
- [ ] `dart run tool/configure_app.dart` Status: OK

---

## 9. 참조 문서 우선순위

빠른 컨텍스트가 필요할 때 이 순서로:

1. **이 파일 (CLAUDE.md)** — 5분 요약
2. **README.md** — 파생 레포 생성 후 빠른 시작
3. **`docs/journey/README.md`** — Developer Journey 책 목차 (0~7단계)
4. **`docs/philosophy/README.md`** — ADR 인덱스 (설계 결정 21개)
5. **`docs/journey/architecture.md`** — 모듈 구조 10분 요약
6. **`docs/architecture/featurekit-contract.md`** — AppKit 계약 전체 명세
7. **`docs/conventions/`** — 코딩 규약 (naming · MVVM · error · loading · i18n · testing)
8. **`docs/features/{kit_name}.md`** — 특정 Kit 사용법 · 파생 레포 체크리스트
9. **`docs/api-contract/`** — 백엔드와의 1:1 계약 (template-spring 쌍)
10. **`docs/infra/`** — 배포 · 보안 · CI/CD · Secrets

**특정 문제 발생 시**:
- 에러 증상 → `docs/journey/dogfood-pitfalls.md`
- 자주 묻는 질문 → `docs/journey/dogfood-faq.md`
- 용어 → `docs/reference/glossary.md`

---

## 10. 문서 작성 스타일

`docs/` 하위 모든 마크다운 문서에 적용한다. 자세한 규칙은 **`docs/STYLE_GUIDE.md`** (§1~§10) 참조.

- **해요체**: `~예요`, `~해요`, `~이에요` 기본. 학술체 (`~하여야 한다`) · 명령조 (`~하라`) 금지. 자연스러울 때 합쇼체 (`~합니다`) 혼용 허용.
- **ADR 8섹션 구조**: 결론부터 / 왜 고민 / 대안들 / 결정 / 가져온 것 / 교훈 / Prior Art / Code References — 엄격.
- **상대경로 링크**: 내부 참조는 상대경로만. Code References 만 GitHub 절대 URL.
- **독자 Level**: 0 (입문) · 1 (주니어) · 2 (실무 중급) · 3 (설계 관심자). 문서별 타겟 명시.
- **사람에게 설명하듯이**: 독자가 처음 이 개념을 접한다고 가정. "이렇게 하면 돼요", "이 때문에 ~해요".
- **독자 = 파생 레포 개발자**: 템플릿 내부를 처음 보는 개발자가 바로 이해 · 실행 가능하게.
- **용어 고정**: `파생 레포` (fork 금지), `Kit`, `AppKit`, `Provider` 등 — `docs/reference/glossary.md` 참조.

---

## 11. 자주 쓰는 메모리 패턴

이 레포는 사용자 auto-memory에서 다음 항목을 참조한다:
- 사용자는 솔로 Flutter 개발자, 직설적·빠른 진행 선호
- 앱 공장 전략: 직접 개발 X, 파생 레포가 출발점
- 운영 로드맵: Phase 1(관측) 완료, Phase 2a(배포+보안) 진행 중
- 용어: "fork" 금지, "파생 레포"가 정답
- 문서 일관성: 코드 변경 시 모든 관련 문서 동기화
- 템플릿 스코프: 모든 앱 공통 영역만 템플릿 책임. 도메인은 파생 레포.

이 원칙들은 코드 변경/평가/제안의 모든 단계에서 우선 적용한다.
