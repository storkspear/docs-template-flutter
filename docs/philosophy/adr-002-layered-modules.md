<a id="layered_modules"></a>

# Layered_Modules

**Status**: Accepted. 현재 유효 (2026-07-29 기준). `lib/` 하위 4개 최상위 폴더 (`core/` · `kits/` · `common/` · `features/`). `core/` 47 dart 파일, `kits/` 15개 Kit · 95 dart 파일 (kit_manifest·README 포함 125 파일).

> **적용 룰**: 본문의 "kit 간 직접 import 금지" 는 아래 세 줄로 읽어요.
> - `kit_manifest.requires` 에 **선언한 kit** 의 **type import** 는 허용 (`ApiException` · `ErrorCode` 같은 타입은 provider 로 접근 불가)
> - 다른 kit 의 **인스턴스 접근** 은 provider 경유 (`ref.read(...)`)
> - **미선언 kit cross-import 는 절대 금지** (recipe 채택 시 컴파일 실패)
>
> 본문은 결정 당시의 근거를 담고, 규칙의 진실의 출처는 [`conventions/kits.md` §3](../conventions/kits.md#3-kit-의존-관계-규칙) 이에요.

## 결론부터

공통 기반은 `core/`, 선택 기능은 `kits/`, 앱 전체 연결은 `common/`, 앱별 화면은 `features/`에 두어요. 실제 조립은 `main.dart`와 `app.dart`가 맡아요. Kit가 공통 provider에 접근하는 허용 경로가 있으므로, 의존 규칙은 단순한 한 줄 화살표보다 허용 범위를 함께 읽어야 해요.

## 왜 이런 고민이 시작됐나?

ADR-001 은 "템플릿 레포는 중립적, 도메인은 파생 레포" 원칙을 선언했어요. 하지만 실제로 `lib/` 폴더 하나에 **공통 코드와 도메인 코드가 뒤섞이면** 이 원칙이 현실에서 깨져요.

세 가지 압력이 동시에 붙어요.

**압력 A — 무엇이 템플릿 자산인지 한눈에 보여야**  
파생 레포 개발자가 "템플릿이 제공한 것 / 내가 추가한 것" 을 **폴더 수준에서 구분** 할 수 있어야 해요. 한 폴더에 섞이면 cherry-pick 전파 시 뭘 가져와야 할지 판단이 어려워요.

**압력 B — 선택적 기능의 tree-shaking**  
ADR-003 의 FeatureKit 이 동작하려면 **미선언 Kit 의 코드가 최종 바이너리에서 제거** 돼야 해요. 이건 Kit 코드가 다른 어느 코드에서도 **import 되지 않아야** 가능. Kit 과 Kit 외 코드의 경계가 명확해야 해요.

**압력 C — 공통 위젯의 재사용성**  
`PrimaryButton` · `AppTextField` 같은 디자인 시스템 위젯은 **모든 앱 · 모든 화면** 에서 쓰여요. 이건 Kit 이 아니라 **기반 레이어** 에 있어야 해요.

이 결정이 답해야 했던 물음이에요.

> **"항상 쓰는 것" · "선택 가능한 것" · "파생 레포만의 것"** 을 폴더 경계로 명확히 분리하려면 어떤 구조가 필요한가?

## 고민했던 대안들

<a id="option-1--feature-first-화면별-폴더"></a>

### Option 1 — Feature-first (화면별 폴더)

`lib/auth/`, `lib/home/`, `lib/settings/` 처럼 **화면 단위** 로 폴더 구성. 각 폴더 안에 view · viewmodel · repository · model 모두.

- **장점**: 한 화면 작업 시 파일을 한 폴더에서만 찾음. Clean Architecture 스타일.
- **단점 1**: "테마 · i18n · 디자인 시스템" 처럼 **공통 자산** 이 들어갈 자리가 어색해짐. `lib/common/` 이 또 생겨 결국 계층이 섞임.
- **단점 2**: FeatureKit 처럼 **선택적 기능** 경계가 모호해짐. 화면 폴더는 보통 필수 기능이라 tree-shaking 에 불리.
- **단점 3**: 파생 레포의 도메인 화면이 **템플릿 화면과 폴더 수준으로 섞임** → 순수성 경계 모호.
- **탈락 이유**: 압력 A · B 위반.

<a id="option-2--clean-architecture-4계층-domain-data-presentation-infrastructure"></a>

### Option 2 — Clean Architecture 4계층 (`domain/`, `data/`, `presentation/`, `infrastructure/`)

DDD 스타일 정석 구조.

- **장점**: 의존 방향이 엄격. 테스트 용이성 높음.
- **단점 1**: **Kit 개념과 맞물리지 않음**. "auth 의 domain 층 / presentation 층" 을 앱 공장 맥락에서 선택적으로 켜고 끌 수 없음.
- **단점 2**: 보일러플레이트 폭증 — ViewModel 1개당 entity · repository · usecase · presenter 4~5 파일. 솔로에겐 비싸.
- **단점 3**: 공통 위젯 · 디자인 토큰이 어느 계층에도 잘 안 맞음 (UI 계층? infrastructure?).
- **탈락 이유**: 엔터프라이즈 팀용 구조. 솔로 인디 앱 공장에는 과잉.

<a id="option-3--3계층--features--채택"></a>

### Option 3 — 3계층 + features ★ (채택)

**수평 분할**: 어떤 앱이든 쓰는 공통 기반 (`core`), 선택 가능한 기능 단위 (`kits`), 파생 레포의 도메인 (`features`). 추가로 레거시 · 어댑터용 `common`.

- **압력 A 만족**: 폴더 이름만 봐도 "템플릿 자산 / 파생 레포 자산" 구분 가능.
- **압력 B 만족**: `kits/auth_kit/` 이 `AppKits.install` 에 없으면 import 자체가 사라져 tree-shaking. 다른 kits 간 직접 import 도 규약으로 금지.
- **압력 C 만족**: 디자인 시스템 · i18n · 공통 위젯은 전부 `core/` 하위에 자연스럽게 자리.

## 결정

### 의존 방향 (단방향)

```text
기본 방향 (단방향)
  features  →  common  →  kits  →  core

허용 예외 (역방향으로 열어둔 한 파일)
  kits/       →  common/providers.dart

(Kit 간 직접 import 금지 — provider 로만 접근)
```

- `core/` 는 **어디에도 의존하지 않음** — Flutter SDK + 외부 패키지만. `BootStep` 계약도 `core/kits/boot_step.dart` 에 있어요. `core/` → `common/` · `kits/` 역방향은 **0건** 이고 `test/core/layer_rule_test.dart` 가 이를 검사해요.
- `kits/` 는 `core/` 에 의존하고, **`common/` 은 `providers.dart` 한 파일만** 예외로 의존해요 (전역 DI). 지금 `lib/kits/` 하위 **11개 파일 · 11건** 이 여기 해당해요. 그 밖의 `common/` 파일 (`router/` · `splash/` 등) 이나 다른 kits 를 직접 import 하면 규약 위반이에요 — 같은 테스트가 검사해요.
- `common/` 은 `core/` + `kits/` 에 의존. DI · 라우팅 · 스플래시처럼 **여러 Kit 을 조립** 하는 지점.
- `features/` 는 모든 레이어에 의존 가능. 하지만 **템플릿 원본은 스텁만** (ADR-001).

> 예외가 `providers.dart` 한 파일에만 열려 있는 이유는 성격이 "조립물" 이 아니라 **DI 진입점** 이기 때문이에요 — Kit 이 전역 Provider 를 읽는 통로라 위치만 `common/` 일 뿐 역할은 기반 레이어예요. 계약 성격인 `BootStep` 은 `core/kits/` 로 옮겨 예외에서 뺐어요. 규칙의 진실의 출처는 [`conventions/kits.md` §3](../conventions/kits.md#3-kit-의존-관계-규칙) 이에요.

<a id="core-구성-모든-앱-필수--47-파일"></a>

### core/ 구성 (모든 앱 필수 · 47 파일)

| 폴더 | 역할 |
|------|------|
| `analytics/` | `AnalyticsService` · `CrashService` 추상 + Debug 구현체 |
| `cache/` | `CacheStore` · `CachedRepository` (ADR-014) |
| `config/` | `AppConfig` 싱글톤 (slug · baseUrl · env 등) |
| `i18n/` | gen_l10n 결과물 + ARB (ADR-016) |
| `kits/` | `AppKit` 계약 + `AppKits` 레지스트리 (ADR-003) |
| `review/` | 인앱 리뷰 트리거 |
| `storage/` | `SecureStorage` · `PrefsStorage` · `TokenStorage` (ADR-013) |
| `theme/` | `AppPalette` · 디자인 토큰 · ColorScheme (ADR-015) |
| `utils/` | `FormValidators` · `Debouncer` · `DateFormatter` 등 |
| `widgets/` | `PrimaryButton` · `AppTextField` · `LoadingView` 등 (ADR-017) |

<a id="kits-구성-선택--15개"></a>

### kits/ 구성 (선택 · 15개)

각 Kit 폴더 구조:

```
lib/kits/<kit_name>/
├── <kit_name>.dart            # AppKit 구현 + export
├── kit_manifest.yaml          # 의존성 선언 (requires) + 플러그인 목록
├── <service>_service.dart     # 핵심 서비스 로직
├── README.md                  # Kit 자체 문서
└── ui/                        # (UI 가 있는 Kit 만) screens + view_models
```

15개 Kit: `auth_kit`, `backend_api_kit`, `file_kit`, `observability_kit`, `notifications_kit`, `local_db_kit`, `update_kit`, `onboarding_kit`, `nav_shell_kit`, `charts_kit`, `ads_kit`, `background_kit`, `permissions_kit`, `device_info_kit`, `payment_kit`.

### common/ 구성 (리팩터 잔여)

| 파일 | 역할 | 이관 예정 |
|------|------|----------|
| `providers.dart` | 전역 DI 정의 | 유지 |
| `router/app_router.dart` | GoRouter 조립 + Kit redirect 합성 | 유지 |
| `splash/splash_controller.dart` | BootStep 순차 실행 (ADR-008) | 유지 |
| `splash/boot_step.dart` | `core/kits/boot_step.dart` 의 re-export | 파생 레포 호환용으로 유지 |

`common/` 은 **점진 이관 중** 이에요. 일부는 `core/` 로 흡수, 일부는 별도 경계 유지.

### features/ 구성 (파생 레포 영역)

```
lib/features/
├── home/         # 템플릿은 스텁 (더미 홈 화면)
└── settings/     # 템플릿은 스텁 (프로필 · 로그아웃 · 탈퇴 샘플)
```

파생 레포가 자기 도메인 화면을 추가하는 공간. 예: `lib/features/workout/`, `lib/features/diary/`.

### 설계 선택 포인트

**포인트 1 — `AppKit` 계약 파일은 `core/kits/` 에 둠**  
`AppKit` 추상 클래스는 모든 Kit 이 extends 하는 대상이에요. 이걸 `kits/` 안에 두면 "Kit 이 Kit 에 의존" 이 되어 의존 방향 규칙이 깨져요. 그래서 `core/kits/app_kit.dart` 에 배치 — 계약은 core, 구현은 kits.

**포인트 2 — `features/` 를 템플릿에 "스텁만" 두는 이유**  
`lib/features/home/home_screen.dart` 가 실제 기능을 가지면 **템플릿이 "홈 앱 템플릿" 이 돼버려요**. 다른 유형의 앱을 만들 때 이 스텁이 방해가 돼요. 그래서 정말 최소한의 "Hello World + 로그아웃 버튼" 수준으로만 유지.

**포인트 3 — Kit 간 직접 import 금지**  
`auth_kit` 이 `backend_api_kit` 의 `ApiClient` 를 쓰려면 `import '../backend_api_kit/api_client.dart'` 가 아니라 `container.read(apiClientProvider)` 로 접근. 이유: Kit 이 꺼졌을 때 (미활성화) import 가 남아있으면 tree-shaking 이 안 돼요. Provider 경유는 런타임 의존이라 컴파일 시점엔 제거 가능.

**포인트 4 — `common/` 이 "임시 폴더" 가 아니라 명시적 역할**  
이름상 "common 뭐든지 들어감" 으로 느껴지지만, 실제로는 **여러 Kit 을 조립하는 지점** 전용. providers.dart (전역 DI) · app_router.dart (Kit redirect 합성) · splash (BootStep 순차 실행) 셋만. 새 파일 추가 시 "이건 진짜 common 인가? core 아닌가?" 를 먼저 자문.

## 이 선택이 가져온 것

### 긍정적 결과

소스와 테스트를 같은 책임별 경로로 나누면 변경 위치를 찾기 쉬워요. core·kits 와 앱 고유 features 의 경계를 확인하면서 템플릿 변경을 전파할 수 있어요. 다만 폴더 위치만으로 모든 변경의 성격이 결정되거나 native SDK 가 제거되지는 않아요. 파생 레포에 복사된 공통 코드도 각 레포에서 별도로 반영해야 해요.

### 부정적 결과

새 기능을 어디에 둘지 판단해야 하고, common 이 여러 책임을 모으는 장소가 되지 않도록 관리해야 해요. Kit 간 의존성은 manifest 와 import 규칙으로 드러내요. 선언된 의존까지 모두 Provider 로 감싸야 한다는 뜻은 아니에요. 템플릿의 features 는 시작 방법을 보여주되 특정 앱의 기능을 포함하지 않도록 유지해요.

## 교훈

<a id="교훈-1--의존-방향-이-전부다"></a>

### 교훈 1 — "의존 방향" 이 전부다

의존 방향은 실제 import 를 기준으로 확인해요. 현재 `test/core/layer_rule_test.dart` 는 core 의 상위 계층 의존을 막고, kits 에서 common 으로 향하는 의존은 `providers.dart` 만 허용해요.

<a id="교훈-2--common-같은-모호한-이름은-조심"></a>

### 교훈 2 — `common/` 같은 모호한 이름은 조심

common 은 Kit 를 앱으로 연결하는 조립 영역이에요. 재사용 가능한 기반 기능은 core 에 두고, 여러 Kit 를 연결하는 코드는 common 에 남겨요. common 전체를 core 로 흡수하는 중이라는 설명은 현재 책임 분리와 맞지 않아요.

<a id="교훈-3--템플릿-features-는-적게--대표적-으로"></a>

### 교훈 3 — 템플릿 `features/` 는 "적게 · 대표적" 으로

스텁은 화면 등록과 상태 연결을 시작할 수 있을 만큼의 예를 제공해요. 모든 앱의 완성형 화면을 템플릿에 넣거나, 화면·ViewModel 수를 고정할 필요는 없어요. 구체적인 기능 작성 과정은 튜토리얼에서 설명해요.

## 관련 사례 (Prior Art)

- [Google "Recommended Flutter architecture"](https://docs.flutter.dev/app-architecture) — Flutter 공식 아키텍처 가이드. 본 ADR 은 이를 참고하되 "Kit 선택성" 을 추가
- [Android Modularization Guide](https://developer.android.com/topic/modularization) — 동일한 `core / feature / common` 3계층 패턴
- [Nx Monorepo Library Types](https://nx.dev/concepts/more-concepts/library-types) — feature / ui / data / util 분할 기준 참조
- [Clean Architecture in Flutter (Reso Coder)](https://resocoder.com/flutter-clean-architecture-tdd/) — Option 2 (Clean Arch) 상세
- [Swift Package Manager Library Types](https://developer.apple.com/documentation/packagedescription/product/library) — 바이너리 / 소스 / 리소스 분리

## Code References

**디렉토리 구조**
- [`lib/core/`](https://github.com/storkspear/template-flutter/tree/main/lib/core) — 47 dart 파일 기반 레이어
- [`lib/kits/`](https://github.com/storkspear/template-flutter/tree/main/lib/kits) — 15개 Kit · 95 dart 파일 (kit_manifest·README 포함 125 파일)
- [`lib/common/`](https://github.com/storkspear/template-flutter/tree/main/lib/common) — providers · router · splash
- [`lib/features/`](https://github.com/storkspear/template-flutter/tree/main/lib/features) — 파생 레포 영역 (스텁 `home/` + `settings/`)

**AppKit 계약 (core 에 둠)**
- [`lib/core/kits/app_kit.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/core/kits/app_kit.dart) — core 에 위치한 이유: Kit 이 Kit 에 의존하지 않기 위해
- [`lib/core/kits/app_kits.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/core/kits/app_kits.dart)

**Kit 조립 지점 (common)**
- [`lib/common/providers.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/common/providers.dart) — 여러 Kit 의 Provider 를 하나로 묶음
- [`lib/common/router/app_router.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/common/router/app_router.dart) — Kit redirect 합성

**관련 ADR**:
- [`ADR-001 · GitHub Template + cherry-pick`](./adr-001-template-cherry-pick.md) — `features/` 를 스텁으로 유지하는 이유
- [`ADR-003 · FeatureKit 동적 레지스트리`](./adr-003-featurekit-registry.md) — `kits/` 가 선택 조립되는 원리
- [`ADR-006 · 인터페이스 기반 서비스 교체`](./adr-006-debug-fallback.md) — `core/analytics/` 의 추상 + Debug 구조
- [`ADR-014 · 정책 기반 캐싱`](./adr-014-cached-repository.md) — `core/cache/` 의 구현
