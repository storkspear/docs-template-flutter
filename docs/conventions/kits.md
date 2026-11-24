# Kits 컨벤션

Kit를 추가하거나 제거할 때는 `main.dart`의 실제 조립과 `app_kits.yaml`의 선언을 함께 수정해요. 이 문서는 Kit의 의존성, provider 주입, 부팅 단계와 라우트 기여 규칙을 설명해요. 설정 검사 도구가 확인하는 범위와 사람이 대조해야 할 부분도 구분해요.

> 빠른 인덱스: [15개 kit 목록 + 의존 관계도](../features/README.md). 본 문서는 **kit 을 만드는 사람** 입장의 컨벤션이에요.

---

## 1. AppKit 계약 (5분 요약)

`AppKit`은 `lib/core/kits/app_kit.dart`에 정의된 추상 클래스예요. 각 Kit는 필요한 메서드만 재정의해요. 아래는 계약을 설명하는 발췌이며, `Override` 타입은 `package:riverpod/misc.dart`에서 가져와요.

```dart
abstract class AppKit {
  String get name;                              // 디버그/에러 메시지용
  List<Type> get requires => const [];          // 의존 Kit 타입
  int get redirectPriority => 100;              // 값이 작을수록 먼저 평가해요.
  List<Override> get providerOverrides => const [];
  List<RouteBase> get routes => const [];
  List<NavigatorObserver> get navigatorObservers => const [];
  List<BootStep> get bootSteps => const [];
  RedirectRule? buildRedirect() => null;
  Listenable? get refreshListenable => null;
  Future<void> onInit() async {}
  Future<void> onDispose() async {}
}
```

각 메서드의 역할:

| 메서드 | 언제 사용? |
|---|---|
| `name` | 에러 메시지에 노출 (예: `"AuthKit requires BackendApiKit"`) |
| `requires` | 다른 kit 의 타입을 선언. install 시점에 자동 검증 — 빠지면 `StateError` |
| `providerOverrides` | Riverpod provider 의 실제 구현체 주입. Debug 폴백을 운영용으로 교체할 때 사용 |
| `routes` | GoRouter 에 추가될 라우트. 여러 kit 의 routes 가 합쳐짐 |
| `navigatorObservers` | 화면 전환 hook (예: 분석 자동 추적) |
| `bootSteps` | 스플래시에서 실행할 초기화 작업. 순서대로 await |
| `buildRedirect()` | 라우팅 게이트 (예: 미인증 시 `/login` 으로). priority 순 평가, 첫 non-null 반환 적용 |
| `refreshListenable` | 라우터 재평가 트리거 (auth 상태 변경 등) |
| `onInit` / `onDispose` | install/rollback/resetForTest 시 호출 |

상세 설계는 [`ADR-003 · FeatureKit 동적 레지스트리`](../philosophy/adr-003-featurekit-registry.md), [`docs/architecture/featurekit-contract.md`](../architecture/featurekit-contract.md).

---

## 2. 동기화 3종 (가장 자주 실수하는 곳)

Kit 활성화 선언과 실제 조립을 **수동으로** 일치시키고, 선언의 의존성을 도구로 검증해요:

```text
app_kits.yaml          ←→     lib/main.dart                         tool/configure_app.dart
(선언적 의도)                  (실제 코드)                          (YAML 선언 검증)
   │                              │                                   │
   │  kits:                       │  AppKits.install([                │  Status: OK 확인
   │    auth_kit:                 │    AuthKit(                       │  --audit 시 의존성 오류 → exit 1
   │      providers:              │      providers: const {           │
   │        - email               │        AuthProvider.email,        │
   │        - google              │        AuthProvider.google,       │
   │                              │      },                           │
   │                              │    ),                             │
```

**옳은 흐름**:

1. `app_kits.yaml` 에서 kit 추가/제거
2. `lib/main.dart` 의 `AppKits.install([...])` 동일 변경
3. `dart run tool/configure_app.dart` 로 YAML 선언·의존성을 검증 → `Status: OK` 확인. 이 도구는 `main.dart`를 읽지 않으므로 1과 2의 대조는 별도로 해요.

**불일치 시 출력 예** (의존성 문제):

```text
--- Dependency Issues ---
  ✗ auth_kit requires backend_api_kit, which is not enabled
Status: ISSUES FOUND
```

→ `app_kits.yaml` 에 빠진 의존을 추가하거나, 의존하는 kit 을 함께 제거해요.

> CI 자동화: `dart run tool/configure_app.dart --audit` (선언·의존성 오류 시 `exit 1` — pre-commit / CI 에서 호출 권장).

---

## 3. Kit 의존 관계 규칙

기본 15개 kit 중 의존 관계가 있는 건 **3개** (auth · payment · file):

```text
backend_api_kit (독립)
  ↑         ↑          ↑
auth_kit  payment_kit  file_kit    (셋 다 requires: backend_api_kit)
```

나머지 11개는 모두 독립이에요.

### 3-1. 핵심 룰

| 케이스 | 허용 여부 | 예시 |
|---|---|---|
| `kit_manifest.requires` 에 **선언한 kit** 의 **type import** | ✅ | `import '.../backend_api_kit/api_exception.dart'` 로 `ApiException` 사용 |
| 다른 kit 의 **인스턴스 접근** | ❌ 직접 생성 금지<br>✅ provider 경유 | `ref.read(apiClientProvider)` (○) <br>`ApiClient(...)` 직접 생성 (✗) |
| **미선언 kit**의 cross-import (manifest `requires`에 없는 Kit) | ❌ 금지 | 의존성을 선언하지 않으면 해당 Kit의 파일·패키지를 제거할 때 import가 깨질 수 있어요. |
| `core/` import (인터페이스/공용 위젯) | ✅ 항상 허용 | `core/storage/token_storage.dart`, `core/widgets/...` |
| `common/providers.dart` import | ✅ **허용 예외 (이 한 파일만)** | `import '.../common/providers.dart'` 로 전역 Provider 읽기. `BootStep` 은 `core/kits/boot_step.dart` 에서 import (`core/` 라 항상 허용) |
| 그 밖의 `common/` import (`router/`, `splash/splash_controller.dart` 등) | ❌ 금지 | 조립 지점은 kit 이 몰라야 해요 — 반대로 `common/` 이 kit 을 조립하는 방향이 정상 |

### 3-2. 왜 type import 는 허용하는가

`ApiException`, `ErrorCode` 같은 **타입은 provider 로 접근할 방법이 없어요** — 클래스 이름 자체가 import 필요.

```dart
// ❌ 불가능 — 타입은 provider 가 못 줌
final exception = ref.read(...);  // 무엇을 read?

// ✅ 정답 — 타입 import 후 provider 로 인스턴스만 받음
import 'package:app_template/kits/backend_api_kit/api_exception.dart';
import 'package:app_template/kits/backend_api_kit/error_code.dart';

try {
  await ref.read(apiClientProvider).post(...);  // 인스턴스는 provider 경유
} on ApiException catch (e) {                    // 타입은 직접 import
  if (e.code == ErrorCode.unauthorized) { ... }
}
```

이 규칙을 지키면 manifest에서 Kit 간 의존 관계를 확인할 수 있어요. `tool/configure_app.dart`는 YAML과 manifest를 검사하고, `AppKits.install`은 Dart의 `requires` getter를 검사해요. 도구가 두 선언의 일치나 실제 import 전체를 검사하지는 않으므로 함께 수정해야 해요.

### 3-3. 미선언 cross-import 가 위험한 이유

manifest에 적지 않은 Kit를 import하면 선언만 보고는 의존 관계를 알 수 없어요. 예를 들어 `auth_kit/ui/login/login_screen.dart`에서 `observability_kit/dogfooding_panel.dart`를 가져오면서 의존성을 선언하지 않은 경우예요.

- `backend-auth-app.yaml`은 ObservabilityKit을 활성화하지 않지만, 현재 설정 도구는 Kit 파일이나 pubspec 의존성을 자동 삭제하지 않아요. 따라서 recipe를 선택했다는 이유만으로 곧바로 컴파일이 실패하지는 않아요.
- 파생 앱에서 불필요한 Kit의 파일이나 패키지를 제거하면 남은 import 때문에 컴파일이 실패할 수 있어요.
- `kDebugMode`는 컴파일 시 결정되는 상수여도 import 해석을 생략하는 장치는 아니에요. 호출부에 이 조건을 붙여 숨은 의존성을 해결할 수는 없어요.

디버그 도구를 노출하는 Kit는 의존성을 선언하고, 실제 인스턴스는 provider로 받아요. 이 규칙은 불필요한 의존성이 남거나 recipe 조합과 테스트가 서로 영향을 주는 일을 줄이기 위한 거예요. 근거는 [ADR-002](../philosophy/adr-002-layered-modules.md)와 [ADR-003](../philosophy/adr-003-featurekit-registry.md)에 있어요.

---

## 4. 새 Kit 만들기 (파생 레포에서)

도메인 특화 기능을 kit 으로 분리하고 싶을 때. 예: 위치 추적 (`location_kit`), 바코드 스캔 (`scanner_kit`). 아래는 **가상의 `location_kit`** 을 만드는 예시예요 (결제는 이미 기본 [`payment_kit`](../features/payment-kit.md) 이 있어요).

### 4-1. 디렉토리 구조

```text
lib/kits/location_kit/
├── location_kit.dart                  # AppKit 구현 (필수)
├── kit_manifest.yaml                  # 메타데이터 (필수)
├── README.md                          # 표준 양식 (필수)
├── location_service.dart              # 도메인 서비스 인터페이스
├── geolocator_location_service.dart   # 실제 구현체
├── debug_location_service.dart        # Debug 폴백 (observability kit 패턴 따라)
└── ui/
    ├── location_history_screen.dart
    └── location_history_view_model.dart
```

<a id="4-2-kit_manifestyaml-표준-양식"></a>

### 4-2. `kit_manifest.yaml` 표준 양식

```yaml
name: location_kit
description: 위치 추적 + 이동 기록 화면
dependencies:
  - geolocator
requires:
  - backend_api_kit         # 위치 기록 백엔드 동기화 필요
```

> `requires` 는 **두 곳에서 기계 검증**돼요 — manifest 쪽은 `tool/configure_app.dart` 가 (`--audit` 시 불일치 `exit 1`), Dart 쪽 `AppKit.requires` getter 는 install 시점에 `AppKits` 가 검증. 두 곳을 일치시켜요.

<a id="4-3-location_kitdart-골격"></a>

### 4-3. `location_kit.dart` 골격

다음 코드는 위 디렉토리의 서비스·화면을 파생 앱에서 구현했다는 전제예요. `LocationService`, `DebugLocationService`, `GeolocatorLocationService`, `LocationHistoryScreen`은 템플릿에 있는 클래스가 아니에요. 위치 스트림처럼 정리가 필요한 자원을 추가하면 생성한 인스턴스의 수명과 정리 방법도 함께 설계해요.

```dart
import 'package:app_template/core/kits/app_kit.dart';
import 'package:app_template/kits/backend_api_kit/backend_api_kit.dart';
import 'package:app_template/kits/location_kit/debug_location_service.dart';
import 'package:app_template/kits/location_kit/geolocator_location_service.dart';
import 'package:app_template/kits/location_kit/location_service.dart';
import 'package:app_template/kits/location_kit/ui/location_history_screen.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:riverpod/misc.dart' show Override;

export 'location_service.dart';

final locationServiceProvider = Provider<LocationService>(
  (_) => DebugLocationService(),
);

class LocationKit extends AppKit {
  LocationKit({this.distanceFilterMeters = 50});
  final int distanceFilterMeters;

  @override
  String get name => 'LocationKit';

  @override
  List<Type> get requires => const [BackendApiKit];

  @override
  List<Override> get providerOverrides => [
    locationServiceProvider.overrideWithValue(
      GeolocatorLocationService(distanceFilterMeters: distanceFilterMeters),
    ),
  ];

  @override
  List<RouteBase> get routes => [
    GoRoute(
      path: '/location-history',
      builder: (_, __) => const LocationHistoryScreen(),
    ),
  ];
}
```

### 4-4. README.md 표준 양식

기본 구조 (기존 kit README 따라):

```markdown
# location_kit

한 줄 요약 + 의존 kit 명시.

## 개요
- 제공하는 핵심 기능
- 필요한 패키지와 의존 Kit

## 활성화
- app_kits.yaml + main.dart 코드 예시 2개

## 제공 기능
- Service · Provider · 화면 · BootStep 표

## 핵심 API
- 자주 쓰는 메서드 시그니처

## 일반 사용 예
- ViewModel/Screen 에서의 호출 패턴

## 파생 레포 체크리스트
- 외부 키 발급/콘솔 설정/플랫폼별 설정

## 제거 (필요 시)
- pubspec / app_kits.yaml / main.dart / providers / 권한 정리

## 테스트
- 어떤 테스트 파일에서 어떤 면을 검증하는지
```

### 4-5. 등록

1. `app_kits.yaml`:
   ```yaml
   kits:
     location_kit:
       distance_filter_meters: 50
   ```
2. `lib/main.dart`:
   ```dart
   await AppKits.install([
     BackendApiKit(),
     LocationKit(distanceFilterMeters: 50),
     // ...
   ]);
   ```
3. `dart run tool/configure_app.dart` → `Status: OK` 확인

### 4-6. 테스트

- **계약 테스트** (`test/kits/location_kit/location_kit_contract_test.dart`):
  - `name`, `requires`, `redirectPriority` 같은 메타가 변경되지 않는지 확인
- **서비스 테스트** (`test/kits/location_kit/geolocator_location_service_test.dart`):
  - 위치 플러그인 mock 으로 기록 흐름 검증
- **위젯 테스트**:
  - LocationHistoryScreen 의 로딩 / 성공 / 에러 상태

---

## 5. Kit 제거하기

기존 kit 을 더 이상 안 쓰게 된 경우. 예: 광고 모델 → 구독 모델 전환 시 `ads_kit` 제거.

### 체크리스트

- [ ] **`app_kits.yaml`** 에서 해당 kit 항목 주석 처리 또는 삭제
- [ ] **`lib/main.dart`** 의 `AppKits.install([...])` 에서 인스턴스 제거
- [ ] **import** 정리 — IDE 가 unused 표시
- [ ] **Provider 사용처** — 해당 kit 이 export 했던 provider 를 쓰던 코드 정리
- [ ] **권한** — `AndroidManifest.xml`, `Info.plist` 의 해당 kit 전용 권한 제거 (예: ads_kit 의 ATT)
- [ ] **매니페스트 컴포넌트** — 플러그인을 제거하면 해당 `<receiver>`·`<service>`도 정리해요. 예를 들어 알림 플러그인의 예약 알림 receiver를 남기면 호출 시 클래스를 찾지 못할 수 있어요.
- [ ] **i18n** — 해당 kit UI 가 썼던 ARB 키 정리
- [ ] **pubspec.yaml** — 해당 kit 만 쓰던 의존성 제거 (다른 kit 도 쓰면 유지)
  - Dart 코드에서 쓰지 않아도 플랫폼 코드·리소스가 빌드에 남을 수 있어요([tree-shaking 주의](../features/README.md)).
- [ ] `dart run tool/configure_app.dart` → `Status: OK`
- [ ] `flutter analyze` warning 0 건
- [ ] `flutter test` 그린

각 kit 의 `README.md` "제거" 섹션에 kit 별 추가 주의사항이 있을 수 있어요.

---

<a id="6-라우팅--redirect-규칙-작성"></a>

## 6. 라우팅 / Redirect 규칙 작성

`buildRedirect()` 가 라우터 게이트의 핵심.

### 6-1. priority 정책

값이 작을수록 먼저 평가하고, 처음으로 경로를 반환한 규칙을 적용해요. 기본값은 `100`이며 같은 값이면 설치 순서를 따라요. `buildRedirect()`가 `null`인 Kit는 평가 대상에 포함되지 않아요.

| priority | 현재 사용처 |
|---|---|
| `1` | UpdateKit에 선언된 값이에요. 현재 리다이렉트 규칙은 없고, `app.dart`의 `_ForceUpdateGate`가 업데이트 다이얼로그를 표시해요. |
| `10` | AuthKit의 인증 상태에 따른 경로 전환이에요. |
| `50` | OnboardingKit의 첫 실행 안내예요. |
| `100` | 별도로 지정하지 않은 Kit의 기본값이에요. |

새 게이트를 추가할 때는 충돌이 없도록 우선순위를 신중히 정해요. 상세는 [`ADR-018 · Redirect Priority`](../philosophy/adr-018-redirect-priority.md).

### 6-2. RedirectRule 시그니처

```dart
typedef RedirectRule = String? Function(BuildContext context, GoRouterState state);
```

- 반환 `null` → 이 kit 은 이 요청에 개입 안 함 → 다음 priority kit 평가
- 반환 `String` → 그 경로로 리다이렉트 → 평가 종료

### 6-3. 예시

다음은 실제 `AuthKit`의 메서드 발췌예요. `computeRedirect`는 인증 상태가 아직 정해지지 않은 경우, 로그인·비밀번호 찾기·이메일 인증·2FA 경로를 각각 처리해요. 단순히 `/login` 접두사만 검사하면 필요한 인증 경로까지 막을 수 있어요.

```dart
@override
RedirectRule? buildRedirect() => (ctx, state) {
  final container = AppKits.maybeContainer ?? ProviderScope.containerOf(ctx);
  final status = container.read(authStateProvider).current.status;
  return computeRedirect(
    status: status,
    path: state.matchedLocation,
    loginPath: loginPath,
    homePath: homePath,
    splashPath: splashPath,
    forgotPasswordPath: forgotPasswordPath,
    verifyEmailPath: verifyEmailPath,
    twoFactorLoginPath: twoFactorLoginPath,
  );
};
```

### 6-4. refreshListenable

라우터가 언제 redirect 를 다시 평가할지 결정. auth 상태가 바뀌면 자동으로 redirect 재평가.

```dart
@override
Listenable? get refreshListenable => _bridge ??= _AuthRefreshBridge(/* ... */);
```

상세 패턴은 `lib/kits/auth_kit/auth_kit.dart` 의 `_AuthRefreshBridge` 참고.

---

## 7. BootStep 작성

`BootStep`은 `runApp` 전에 순서대로 실행해요. 선택 기능의 실패가 부팅을 막지 않도록 처리하는 것을 권장해요. 필수 초기화는 `main.dart`에서 직접 기다리고, 실패 시 어떻게 처리할지도 정해요. 예외를 처리하지 않은 BootStep이 실패하면 `SplashController`는 뒤의 단계를 실행하지 않고 오류 결과를 반환해요. 현재 `main.dart`는 그 오류를 보고한 뒤 `runApp`으로 진행해요.

```dart
class _MyKitInitStep implements BootStep {
  _MyKitInitStep(this._service);
  final MyService _service;

  @override
  String get name => 'MyKitInitStep';  // 실패 시 SplashResult.errorMessage 에 노출

  @override
  Future<void> execute() async {
    await _service.init();
    // 선택 기능의 실패를 허용한다면 이 안에서 오류를 처리하고 기록해요.
  }
}
```

상세는 [`ADR-008 · Boot Step`](../philosophy/adr-008-boot-step.md).

---

## 8. 자주 막히는 함정

CLAUDE.md §7 의 함정과 동일해요. 본 문서에서 강조하는 것:

1. **`AppKits.install` 누락** — 새 kit 만들고 main.dart 에 안 끼우면 모든 라우트/provider 가 사라진 듯 보여요
2. **`AppKits.attachContainer` 호출 순서** — ProviderContainer 생성 직후 호출해야 bootStep 내부에서 `container.read` 가 가능해요
3. **미선언 Kit import** — 의존성을 숨긴 채 파일·패키지를 제거하면 컴파일이 실패할 수 있어요. 타입 import는 선언한 Kit에 한해 허용하고 인스턴스는 provider로 받아요.
4. **설정 검사 누락** — `dart run tool/configure_app.dart --audit`로 YAML·manifest의 의존성을 검사해요. 이 검사가 `main.dart`와 Dart getter의 일치까지 확인하지는 않아요.
5. **플랫폼별 설정 누락** — SDK를 추가하면 해당 SDK에 필요한 Manifest·Info.plist·ProGuard 설정을 확인해요. 필요한 keep 규칙이 누락되면 release 빌드에서만 오류가 날 수도 있어요.
6. **i18n 누락** — kit UI 가 새 문자열을 쓰면 ko/en ARB 양쪽에 추가하고 `flutter gen-l10n` 을 돌려요

---

## 9. 관련 문서

- [`features/README.md`](../features/README.md) — 15개 kit 목록 + 의존 관계도 + 활성화 가이드
- [`architecture/featurekit-contract.md`](../architecture/featurekit-contract.md) — AppKit 인터페이스 전체 명세
- [`ADR-002 · Layered Modules`](../philosophy/adr-002-layered-modules.md) — 의존 방향
- [`ADR-003 · FeatureKit Registry`](../philosophy/adr-003-featurekit-registry.md) — 동적 레지스트리 설계
- [`ADR-004 · Manual Sync + CI Audit`](../philosophy/adr-004-manual-sync-ci-audit.md) — yaml↔dart 동기화 전략
- [`ADR-008 · Boot Step`](../philosophy/adr-008-boot-step.md) — 부팅 단계 추상화
- [`ADR-018 · Redirect Priority`](../philosophy/adr-018-redirect-priority.md) — 라우팅 우선순위
- [`architecture.md`](viewmodel-mvvm.md) — MVVM, 모듈 의존 방향, 에러 처리
- [`naming.md`](./naming.md) — 파일/클래스/Provider 명명 규칙
