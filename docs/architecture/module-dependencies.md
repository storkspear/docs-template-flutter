# Module Dependencies

이 문서는 `lib/` 하위 모듈 간 **의존 방향 · 규칙 · 검증 메커니즘** 을 정리해요. 근거는 [`ADR-002 · 3계층 모듈 구조`](../philosophy/adr-002-layered-modules.md) 를 참조하세요.

---

## 의존 다이어그램

```text
                          ┌────────┐
                          │ main.  │
                          │ dart   │
                          └───┬────┘
                              │
              ┌───────────────▼───────────────┐
              │          app.dart              │
              └───────────────┬───────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
  ┌─────▼─────┐       ┌──────▼──────┐       ┌──────▼──────┐
  │ features/ │       │  common/    │       │  kits/      │
  │           │──────▶│             │──────▶│             │
  │ (도메인)   │       │ providers · │       │ (선택 기능)  │
  │           │       │ router ·    │       │             │
  │           │       │ splash      │       │             │
  └─────┬─────┘       └──────┬──────┘       └──────┬──────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
                       ┌──────▼──────┐
                       │   core/     │
                       │             │
                       │ theme · DI  │
                       │ storage ·   │
                       │ widgets ·   │
                       │ i18n 등     │
                       └─────────────┘
```

**단방향**: `features → common → kits → core`

> Kit은 공용 DI 진입점인 `common/providers.dart`를 import할 수 있어요. 그 밖의 common 파일로 역방향 의존하지 않아요. core는 상위 레이어를 import/export하지 않으며, `test/core/layer_rule_test.dart`가 이 두 규칙을 검사해요. BootStep 계약은 `core/kits/boot_step.dart`에 있고, `common/splash/boot_step.dart`는 파생 레포 호환용 re-export예요.

---

## 레이어별 역할

<a id="core-모든-앱-필수-기반-47-파일"></a>
<a id="core--모든-앱-필수-기반-47-파일"></a>

### `core/` — 모든 앱의 공통 기반

| 모듈 | 역할 |
|------|------|
| `analytics/` | AnalyticsService · CrashService 추상 + Debug ([`ADR-006`](../philosophy/adr-006-debug-fallback.md)) |
| `cache/` | CacheStore · CachedRepository ([`ADR-014`](../philosophy/adr-014-cached-repository.md)) |
| `config/` | AppConfig 싱글톤 |
| `i18n/` | gen_l10n 결과물 ([`ADR-016`](../philosophy/adr-016-i18n-from-start.md)) |
| `kits/` | AppKit 계약 · AppKits 레지스트리 ([`ADR-003`](../philosophy/adr-003-featurekit-registry.md)) · BootStep 계약 ([`ADR-008`](../philosophy/adr-008-boot-step.md)) |
| `review/` | 인앱 리뷰 트리거 |
| `storage/` | SecureStorage · PrefsStorage · TokenStorage ([`ADR-013`](../philosophy/adr-013-token-atomic-storage.md)) |
| `theme/` | AppPalette · 디자인 토큰 ([`ADR-015`](../philosophy/adr-015-palette-registry.md)) |
| `utils/` | FormValidators · Debouncer 등 순수 헬퍼 |
| `widgets/` | PrimaryButton · LoadingView · SkeletonLoading 등 공통 위젯 |

<a id="kits--선택-15개-features-인덱스featuresreadmemd"></a>
<a id="kits--선택-15개-features-인덱스"></a>

### `kits/` — 선택 15개 ([`Features 인덱스`](../features/README.md))

```text
auth_kit, backend_api_kit, file_kit, observability_kit, notifications_kit,
local_db_kit, update_kit, onboarding_kit, nav_shell_kit,
charts_kit, ads_kit, background_kit, permissions_kit, device_info_kit,
payment_kit
```

<a id="common--여러-kit-조립-지점"></a>

### `common/` — 여러 Kit 조립 지점

| 파일 | 역할 |
|------|------|
| `providers.dart` | 전역 DI — 여러 Kit 의 Provider 를 한 곳 ([`ADR-005`](../philosophy/adr-005-riverpod-mvvm.md), [`ADR-007`](../philosophy/adr-007-late-binding.md)) |
| `router/app_router.dart` | GoRouter 조립 + Kit redirect 합성 ([`ADR-018`](../philosophy/adr-018-redirect-priority.md)) |
| `splash/boot_step.dart` | `core/kits/boot_step.dart` 의 re-export (파생 레포 호환용) |
| `splash/splash_controller.dart` | 부팅 단계 순차 실행 |

<a id="features--파생-레포-도메인-영역"></a>

### `features/` — 파생 레포 도메인 영역

템플릿은 **스텁만** 담아요 — `home/` + `settings/`. 파생 레포가 채워요.

---

<a id="의존-규칙-금지--허용"></a>

## 의존 규칙 (금지 · 허용)

### 금지

- ❌ `core/` → `common/` · `kits/` · `features/` import/export
- ❌ `kits/<A>` → `requires`에 선언하지 않은 `kits/<B>` import — 숨은 의존성이 생기며 B의 파일·패키지를 제거하면 컴파일이 실패할 수 있어요([상세 규칙](../conventions/kits.md#3-kit-의존-관계-규칙)).
- ❌ `features/<A>` → `features/<B>` 직접 import (라우터 경유 권장)

### 허용

- ✅ `features/` → `common/` · `kits/` · `core/`
- ✅ `common/` → `kits/` · `core/`
- ✅ `kits/` → `core/`
- ✅ `kits/<A>` → `requires` 에 **선언한** `kits/<B>` 의 **type import** (`ApiException` 등 — 타입은 Provider 로 못 받아요. 인스턴스는 Provider 경유)
- ✅ 의존성을 선언한 Kit의 인스턴스는 provider를 통해 읽어요. `common/providers.dart`가 공용 DI 진입점이에요.
- ✅ `kits/<A>` → `kits/<B>` 의 **`requires: [B]`** 선언 ([`ADR-003`](../philosophy/adr-003-featurekit-registry.md))

---

## 의존성 검증

### 런타임

`AppKits.install([...])`은 Dart의 `AppKit.requires`를 검증해요. 누락되면 다음 형태의 `StateError`를 던져요. manifest 문자열을 검사하는 CLI 출력과는 별개예요.

```text
AuthKit requires BackendApiKit to be installed. Add it to AppKits.install([...]) before AuthKit.
```

### CI

```bash
dart run tool/configure_app.dart --audit
```

선언된 Kit과 manifest의 의존성 등에 오류가 있으면 exit 1로 실패해요. 이 도구는 `main.dart`의 실제 install 목록이나 Dart getter와 manifest가 같은지 비교하지 않아요. 그 대조는 별도로 해야 해요 ([ADR-004](../philosophy/adr-004-manual-sync-ci-audit.md)).

### 정적 분석

`flutter analyze`는 타입 오류와 사용하지 않는 import 등을 검사해요. Dart의 순환 import 자체를 금지하는 검사는 아니에요. 프로젝트의 일부 의존 규칙은 `test/core/layer_rule_test.dart`가 확인하고, Kit 사이의 설계 의존은 리뷰에서도 점검해요.

---

## tree-shaking

사용하지 않는 Kit은 실제 조립과 사용처에서 제거해요. release 빌드의 tree-shaking은 도달 가능한 Dart 코드를 기준으로 하므로, install 목록이나 YAML에서 빠졌다는 이유만으로 해당 코드가 모두 제거된다고 보지는 않아요.

- `main.dart` 의 `AppKits.install([...])` 에 해당 Kit 인스턴스가 **없어야** 해요
- `app_kits.yaml`은 의도한 조합을 기록해요. YAML 수정 자체가 컴파일이나 tree-shaking을 제어하지는 않아요.
- 다른 코드에서 해당 Kit 의 클래스 · Provider 를 **import 하지 말아야** 해요
- **쓰지 않는 네이티브 플러그인은 `pubspec.yaml`에서도 제거해요.** Dart tree-shaking만으로 플러그인의 플랫폼 코드·리소스까지 빠진다고 보장할 수 없어요. 제거 후에는 관련 Manifest·Info.plist 설정도 확인해요([Features 인덱스](../features/README.md)).

필요 없는 SDK와 플러그인 의존성을 제거한 뒤 실제 APK·IPA로 크기 차이를 확인해요. 절감량은 대상 플랫폼·빌드 모드·사용 기능에 따라 달라져요.

---

## 관련 문서

- [`ADR-002 · 3계층 모듈 구조`](../philosophy/adr-002-layered-modules.md)
- [`ADR-003 · FeatureKit 동적 레지스트리`](../philosophy/adr-003-featurekit-registry.md)
- [`featurekit-contract.md`](./featurekit-contract.md) — AppKit 인터페이스 전체 명세
- [`boot-sequence.md`](./boot-sequence.md) — 앱 시작 시 순서도
