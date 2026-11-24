# FeatureKit Contract

이 문서는 `AppKit` 추상 클래스 + `AppKits` 레지스트리의 **전체 명세** 예요. 각 속성 · 메서드의 역할 · 호출 시점 · 주의점을 정리해요. 설계 근거는 [`ADR-003`](../philosophy/adr-003-featurekit-registry.md) 을 참조하세요.

---

## AppKit 인터페이스 전체

```dart
// lib/core/kits/app_kit.dart 발췌
abstract class AppKit {
  String get name;                                     // 디버그 이름
  List<Type> get requires => const [];                 // 의존 Kit 타입
  int get redirectPriority => 100;                     // 라우팅 우선순위

  List<Override> get providerOverrides => const [];    // Riverpod 기여
  List<RouteBase> get routes => const [];              // go_router 라우트
  List<NavigatorObserver> get navigatorObservers => const [];
  List<BootStep> get bootSteps => const [];            // 스플래시 단계
  RedirectRule? buildRedirect() => null;               // 라우팅 게이트
  Listenable? get refreshListenable => null;           // 라우터 리빌드 트리거

  Future<void> onInit() async {}                       // install 시 호출
  Future<void> onDispose() async {}                    // 롤백 · 테스트 정리
}
```

---

<a id="각-속성--메서드-상세"></a>

## 각 속성 · 메서드 상세

<a id="name--디버그-이름"></a>

### `name` — 디버그 이름

- **타입**: `String`
- **호출 시점**: 에러 메시지 · 로그
- **예**: `'AuthKit'`, `'BackendApiKit'`

<a id="requires--의존-kit-선언"></a>

### `requires` — 의존 Kit 선언

- **타입**: `List<Type>`
- **호출 시점**: `AppKits.install` 시 검증
- **예**: `requires: [BackendApiKit]`
- **주의**: 의존 Kit는 `requires`에 타입으로 선언해요. 필요한 모델·예외 타입의 import는 허용하되, 공유 서비스 인스턴스는 provider를 통해 받아요.

<a id="redirectpriority--라우팅-우선순위"></a>

### `redirectPriority` — 라우팅 우선순위

- **타입**: `int` (기본 100)
- **규칙**: 값이 작을수록 먼저 평가하고, 같은 값이면 설치 순서를 따라요. `buildRedirect()`가 반환한 규칙만 평가 대상이에요.
- **현재 구성**: `AuthKit`은 10, `OnboardingKit`은 50이에요. `UpdateKit`도 값은 1이지만 리다이렉트 규칙을 반환하지 않아요. 업데이트 차단·경고는 `app.dart`의 `_ForceUpdateGate`가 다이얼로그로 처리해요.
- 상세: [ADR-018](../philosophy/adr-018-redirect-priority.md)

<a id="provideroverrides--riverpod-기여"></a>

### `providerOverrides` — Riverpod 기여

- **타입**: `List<Override>`
- **호출 시점**: `AppKits.allProviderOverrides` 수집 → `ProviderContainer` 생성
- **예**:
  ```dart
  @override
  List<Override> get providerOverrides {
    if (ObservabilityEnv.isSentryEnabled) {
      return [crashServiceProvider.overrideWithValue(SentryCrashService())];
    }
    return [];
  }
  ```

<a id="routes--go_router-라우트"></a>

### `routes` — go_router 라우트

- **타입**: `List<RouteBase>`
- **호출 시점**: `AppKits.allRoutes` 수집 → `GoRouter(routes: [...])` 조립
- **예**: `AuthKit` 이 `/login`, `/forgot-password`, `/verify-email`, `/login/2fa` 를 상시 기여하고 `twoFactorEnabled: true` 면 `/settings/2fa`(+`/setup`·`/disable`·`/backup-codes`) 를 추가로 기여

<a id="navigatorobservers--navigatorobserver-기여"></a>

### `navigatorObservers` — NavigatorObserver 기여

- **타입**: `List<NavigatorObserver>`
- **호출 시점**: `AppKits.allNavigatorObservers` 수집 → go_router 의 `observers` 인자
- **예**: `ObservabilityKit` 의 `AnalyticsNavigatorObserver` (화면 자동 추적)

<a id="bootsteps--부팅-단계"></a>

### `bootSteps` — 부팅 단계

- **타입**: `List<BootStep>`
- **호출 시점**: `AppKits.allBootSteps` 수집 → `SplashController.run()`
- **전제**: provider를 읽는 단계는 `attachContainer` 뒤에 수집해요. 모든 Kit이 그 전에는 빈 목록을 반환하는 것은 아니에요. 예를 들어 AuthKit은 container가 없으면 단계를 내놓지 않지만 UpdateKit은 crash service 없이도 단계를 만들 수 있어요.
- 상세: [`ADR-008`](../philosophy/adr-008-boot-step.md)

<a id="buildredirect--라우팅-규칙"></a>

### `buildRedirect` — 라우팅 규칙

- **타입**: `RedirectRule? Function()` → 반환값은 `String? Function(BuildContext, GoRouterState)`
- **호출 시점**: `AppKits.redirectRules`를 처음 읽을 때 규칙을 만들고 캐시해요. install·rollback·resetForTest에서 캐시를 비워요. 실제 라우팅 평가에서는 이미 만든 함수가 호출되므로, 변하는 상태는 그 함수 안에서 읽어요.
- **규칙 생성**: `buildRedirect()`가 `null`이면 이 Kit의 규칙을 등록하지 않아요.
- **규칙 평가**: 반환한 함수가 `null`을 돌려주면 다음 규칙을 평가하고, 경로 문자열을 돌려주면 그 경로로 이동해요.
- 상세: [`ADR-018`](../philosophy/adr-018-redirect-priority.md)

<a id="refreshlistenable--라우터-리빌드-트리거"></a>

### `refreshListenable` — 라우터 리빌드 트리거

- **타입**: `Listenable?`
- **호출 시점**: go_router 의 `refreshListenable` 에 `AppKits.compositeRefreshListenable` 전달
- **역할**: 이 Listenable 이 `notifyListeners` 하면 라우터가 redirect 재평가
- **예**: `AuthKit` 의 `_AuthRefreshBridge` (AuthState 스트림 → ChangeNotifier)

<a id="oninit--설치-후크"></a>

### `onInit` — 설치 후크

- **타입**: `Future<void>`
- **호출 시점**: 이번 호출의 Kit을 모두 등록하고 의존성을 검증한 뒤, 입력 순서대로 실행해요.
- **용도**: Kit 내부의 채널·구독 등을 초기화해요.
- **제한**: 현재 `main.dart`의 최초 설치 시점에는 container가 아직 없어요. provider가 필요한 부팅 작업은 container를 연결한 뒤 실행하는 BootStep에 둬요.

<a id="ondispose--정리-후크"></a>

### `onDispose` — 정리 후크

- **타입**: `Future<void>`
- **호출 시점**: install 실패 시에는 이번 호출에서 `onInit`을 마친 Kit만 역순으로 정리해요. 실패한 `onInit` 안에서 일부 만든 리소스는 해당 Kit이 직접 정리해야 해요. 이전 install에서 등록한 Kit은 보존해요. `resetForTest()`는 설치된 모든 Kit을 역순으로 정리해요.
- **용도**: 스트림 구독과 네이티브 리소스를 해제해요.
- **예외 처리**: 정리 중 예외가 나도 나머지 정리를 이어가요. 정리 성공을 보장하는 것은 아니에요.

---

## AppKits 레지스트리 API

```dart
class AppKits {
  // 설치
  static Future<void> install(List<AppKit> kits);

  // 컨테이너 부착
  static void attachContainer(ProviderContainer container);
  static ProviderContainer get container;                 // nullable 아님 (Error if null)
  static ProviderContainer? get maybeContainer;

  // 조회
  static bool has<T extends AppKit>();
  static T? get<T extends AppKit>();
  static List<AppKit> get all;                            // 설치 순서

  // 기여 수집
  static List<Override> get allProviderOverrides;
  static List<RouteBase> get allRoutes;
  static List<BootStep> get allBootSteps;
  static List<NavigatorObserver> get allNavigatorObservers;
  static Listenable? get compositeRefreshListenable;
  static List<RedirectRule> get redirectRules;            // priority 정렬

  // 테스트
  @visibleForTesting
  static Future<void> resetForTest();
}
```

---

## 호출 순서 (main.dart)

```text
1. WidgetsFlutterBinding.ensureInitialized()
2. AppPaletteRegistry.install(DefaultPalette())
   AppTypefaceRegistry.install(DefaultTypeface())
3. AppConfig.init(...)
4. (조건부) SentryFlutter.init  — appRunner 로 _bootstrap 실행
5. PrefsStorage().init()
6. AppKits.install([BackendApiKit(), AuthKit(), ...])
   ├─ 중복 체크
   ├─ requires 의존성 검증
   ├─ 각 Kit.onInit()
   └─ 실패 시 역순 rollback
7. final container = ProviderContainer(overrides: [...AppKits.allProviderOverrides, ...])
8. AppKits.attachContainer(container)
9. container.read(crashServiceProvider).init()
10. SplashController(steps: AppKits.allBootSteps).run()
11. runApp(UncontrolledProviderScope(container: container, child: const App()))
```

컨테이너를 만든 뒤 `attachContainer`로 연결하고 부팅 단계를 수집해요. 연결 전에 `AppKits.container`를 읽으면 `StateError`가 나요. `maybeContainer`를 쓰는 Kit은 오류 대신 단계를 생략할 수도 있으므로, 예외가 없었다는 이유만으로 조립 순서가 맞다고 판단하지 않아요.

---

## 새 Kit 작성 템플릿

```dart
// lib/kits/my_kit/my_kit.dart
import 'package:app_template/core/kits/app_kit.dart';

class MyKit extends AppKit {
  @override
  String get name => 'MyKit';
}
```

가장 작은 구현은 이름만 정의해요. provider·라우트·부팅 단계가 필요할 때 해당 getter나 후크를 추가해요. 예를 들어 `List<Override>`를 선언하면 현재 Riverpod 구성에 맞춰 `package:riverpod/misc.dart`에서 `Override`를 import해요. 기본값과 같은 빈 getter·후크를 모두 복사할 필요는 없어요.

다음 파일도 함께 작성해요:
- `lib/kits/my_kit/kit_manifest.yaml`
- `lib/kits/my_kit/README.md`
- `test/kits/my_kit/my_kit_contract_test.dart`

---

## Code References

- [`lib/core/kits/app_kit.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/core/kits/app_kit.dart) — Kit 계약과 기본 구현
- [`lib/core/kits/app_kits.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/core/kits/app_kits.dart) — 설치·의존 검증·정리·규칙 수집

---

## 관련 문서

- [`ADR-003 · FeatureKit`](../philosophy/adr-003-featurekit-registry.md) — 설계 근거
- [`ADR-008 · BootStep`](../philosophy/adr-008-boot-step.md) — bootSteps 상세
- [`ADR-018 · redirectPriority`](../philosophy/adr-018-redirect-priority.md)
- [`boot-sequence.md`](./boot-sequence.md) — 실제 부팅 흐름
- [`Features 인덱스`](../features/README.md) — 15개 Kit 구현체
