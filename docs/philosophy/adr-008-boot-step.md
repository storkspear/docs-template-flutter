<a id="boot_step"></a>

# Boot_Step

**Status**: Accepted. 현재 유효. 2026-04-24 작성 / 2026-05-07 line 수 갱신 / 2026-10-28 계약을 `core/kits/` 로 이관. `lib/core/kits/boot_step.dart` (계약), `lib/common/splash/splash_controller.dart` (61줄) + 각 Kit 이 기여하는 BootStep (`AuthCheckStep` 등). `lib/common/splash/boot_step.dart` 는 파생 레포 호환용 re-export 예요.

## 결론부터

Kit가 제공한 `BootStep`을 설치 순서대로 모아 실행해요. `SplashController`는 첫 예외에서 남은 단계를 중단하고 원래 오류와 스택을 결과에 담아요. `main.dart`는 이를 보고한 뒤 앱 실행을 이어가요. 단계 내부에서 실패를 처리하는 경우와 실행기까지 예외가 전파되는 경우를 구분해야 해요.

## 왜 이런 고민이 시작됐나?

처음 템플릿 상태에선 `main.dart` 의 `_bootstrap()` 함수에 모든 초기화가 일렬로 쌓여 있었어요.

```dart
Future<void> _bootstrap() async {
  WidgetsFlutterBinding.ensureInitialized();
  await _initSentry();
  await _checkAuthToken();
  await _initPostHog();
  await _checkForceUpdate();
  // ... 계속 추가 ...
  runApp(...);
}
```

ADR-003 이 FeatureKit 동적 레지스트리를 도입하자마자 이 구조의 문제가 드러났어요.

**문제 1 — Kit 활성화 / 비활성화 시 main.dart 수정 필수**  
`auth_kit` 을 비활성화 하려면 `_checkAuthToken()` 호출을 `main.dart` 에서 제거해야 해요. Kit 선언은 `app_kits.yaml` 에서 했는데 부팅 로직은 `main.dart` 에 묶임 — 일관성 붕괴.

**문제 2 — 부팅 로직이 Kit 과 분리**  
`auth_kit/auth_check_step.dart` 가 "토큰 확인 로직" 을 가지는데, 실제 실행은 `main.dart` 에서 하는 분산 구조. Kit 이 자기 책임을 완결할 수 없음.

**문제 3 — 순서 표현이 암묵적**  
"auth 체크가 먼저? PostHog init 이 먼저?" 를 `main.dart` 의 **코드 순서** 로만 결정. Kit 이 늘어나면 순서 전쟁.

이 결정이 답해야 했던 물음이에요.

> **부팅 단계를 Kit 이 자기 책임으로 소유하되, 순차 실행 · 에러 처리 · 관측성 로깅을 중앙 일괄 관리** 하는 구조는?

## 고민했던 대안들

<a id="option-1--maindart-에-고정-순서로-나열"></a>

### Option 1 — main.dart 에 고정 순서로 나열

기존 방식 유지. Kit 마다 "이 함수를 main.dart 에 추가하세요" 를 README 에 적기.

- **장점**: 구현 제로.
- **단점 1**: Kit on/off 시 main.dart 수정 필수 — ADR-003 의 "선언만 바꾸면 됨" 철학 위반.
- **단점 2**: 순서 · 에러 처리 · 관측성 보일러플레이트가 main.dart 에 누적.
- **탈락 이유**: 앱 공장 scale 에 안 맞음.

<a id="option-2--riverpod-futureprovider-체인"></a>

### Option 2 — Riverpod FutureProvider 체인

`authBootProvider` 같은 FutureProvider 들로 초기화 단계를 표현.

```dart
final authBootProvider = FutureProvider((ref) async {
  await ref.read(authServiceProvider).checkAuthStatus();
});
```

- **장점**: Riverpod 네이티브. 이미 Provider 생태계.
- **단점 1**: FutureProvider 는 **lazy** — 누군가 read 하기 전엔 실행 안 됨. 부팅 시 모든 step 을 `ref.read` 해야 해서 또 main.dart 가 비대해짐.
- **단점 2**: 순서 제어가 간접적. "auth 먼저 PostHog 다음" 을 Provider 의존 그래프로 표현해야 하는데 그게 자연스럽지 않음.
- **단점 3**: 에러 처리 (부팅 실패 시 어떻게?) 가 각 Provider 마다 흩어짐.
- **탈락 이유**: Provider 시스템은 상태 공유용. 부팅 sequence 에는 과함.

<a id="option-3--bootstep-인터페이스--splashcontroller--채택"></a>

### Option 3 — BootStep 인터페이스 + SplashController ★ (채택)

아주 단순한 추상:

```dart
abstract class BootStep {
  String get name;
  Future<void> execute();
}
```

각 Kit 이 `bootSteps` getter 로 자기 BootStep 을 기여하고, `AppKits.allBootSteps` 로 합쳐져 `SplashController` 가 순차 실행.

- **압력 1 해결**: Kit on/off = BootStep 등록/해제. main.dart 수정 0.
- **압력 2 해결**: `auth_check_step.dart` 는 `auth_kit/` 폴더 안. Kit 이 자기 책임 완결.
- **압력 3 해결**: Kit 의 install 순서가 BootStep 실행 순서. `AppKits.install([BackendApiKit(), AuthKit(), ObservabilityKit()])` 에서 auth check 가 observability init 보다 먼저.

## 결정

### BootStep 계약

```dart
// lib/core/kits/boot_step.dart 계약 부분
abstract class BootStep {
  String get name;
  Future<void> execute();
}
```

최소주의 극단. 이름 하나 + 실행 하나. 파라미터 없음 — 필요한 의존성은 Kit 이 주입.

### SplashController (61줄)

```dart
// lib/common/splash/splash_controller.dart 발췌
enum SplashStatus { loading, ready, error }

class SplashResult {
  final SplashStatus status;
  final String? errorMessage;
  // ...
}

class SplashController {
  final List<BootStep> _steps;
  SplashController({List<BootStep> steps = const []}) : _steps = steps;

  Future<SplashResult> run() async {
    try {
      for (final step in _steps) {
        await step.execute();
      }
      return const SplashResult.ready();
    } catch (e) {
      return SplashResult.error(e.toString());
    }
  }
}
```

순차 `await`. 하나가 실패하면 나머지 중단 + `error` 상태 반환. 반환값은 에러 핸들링을 `main.dart` 에 위임.

### Kit 이 BootStep 을 기여

```dart
// lib/core/kits/app_kit.dart
abstract class AppKit {
  List<BootStep> get bootSteps => const [];
  // ...
}
```

```dart
// lib/kits/auth_kit/auth_kit.dart 발췌
@override
List<BootStep> get bootSteps {
  final container = AppKits.maybeContainer;
  if (container == null) return const [];
  return [
    AuthCheckStep(
      authService: container.read(authServiceProvider),
      authState: container.read(authStateProvider),
      crashService: container.read(crashServiceProvider),
    ),
  ];
}
```

### BootStep 구현 예시 (AuthCheckStep)

```dart
// lib/kits/auth_kit/auth_check_step.dart 발췌
class AuthCheckStep implements BootStep {
  final AuthService _authService;
  final AuthStateNotifier _authState;
  final CrashService? _crashService;

  AuthCheckStep({
    required AuthService authService,
    required AuthStateNotifier authState,
    CrashService? crashService,
  }) : _authService = authService,
       _authState = authState,
       _crashService = crashService;

  @override
  String get name => 'AuthCheckStep';

  @override
  Future<void> execute() async {
    try {
      await _authService.checkAuthStatus();
    } catch (e, st) {
      await _crashService?.reportError(e, st);  // ← 리포트만
      _authState.emit(const AuthState.unauthenticated());  // ← fallback
    }
  }
}
```

핵심 설계: **부팅 단계 자체 실패는 앱을 멈추지 않음**. 실패해도 "로그인 안 된 상태" 로 복귀해서 앱이 계속 부팅. crashService 에 non-fatal 로 리포트.

### main.dart 통합

```dart
// lib/main.dart 발췌 (Kit 생성자 인자는 생략 — install 순서만 보면 돼요)
await AppKits.install([
  BackendApiKit(),
  AuthKit(/* providers, loginPath, 2FA 경로 */),
  FileKit(),
  UpdateKit(service: BackendAppUpdateService(/* GET /app-version */)),
  ObservabilityKit(),
]);

final container = ProviderContainer(overrides: [...AppKits.allProviderOverrides]);
AppKits.attachContainer(container);

// 모든 Kit 의 BootStep 수집 → 순차 실행
final boot = await SplashController(steps: AppKits.allBootSteps).run();

if (boot.status == SplashStatus.error) {
  await crashService.reportError(
    StateError('Splash boot failed: ${boot.errorMessage}'),
    StackTrace.current,
    fatal: false,
  );
}

runApp(UncontrolledProviderScope(container: container, child: const App()));
```

### 설계 선택 포인트

**포인트 1 — `BootStep` 인터페이스를 극단적으로 단순하게**  
`execute()` 에 파라미터 없음. ViewModel 스타일 `BuildContext` 주입도 없음. 이유: **의존성은 Kit 의 `bootSteps` getter 에서 container.read 로 주입** 하니까 BootStep 자체는 무지성. 인터페이스가 단순할수록 테스트 · 구현 · 교체가 쉬워요.

**포인트 2 — 실패 시 "앱 멈춤" 이 아닌 "fallback 상태"**  
`SplashController.run()` 은 예외를 catch 해서 `SplashResult.error` 로 반환하지만, 각 BootStep 자체도 **내부에서 try-catch** 해서 graceful degradation. `AuthCheckStep` 은 토큰 확인 실패 → `unauthenticated` 로 emit 해서 앱이 로그인 화면으로. 앱이 멈추는 건 진짜 치명적일 때만.

**포인트 3 — BootStep 순서는 Kit install 순서 + Kit 내부 순서**  
`AppKits.allBootSteps` 는 Kit install 순으로 flatten. 예: `install([BackendApiKit, AuthKit, ObservabilityKit])` → `[auth check, posthog init]` 순서. Kit 간 순서는 install 호출 순. 한 Kit 이 여러 BootStep 을 내면 리스트 순.

**포인트 4 — 관측성 로깅은 중앙에서**  
각 BootStep 이 자기 실행을 로깅하지 않아요. `SplashController.run()` 에서 "step 시작 / 끝 / 실패" 를 공통으로 찍을 수 있는 자리. 현재는 미구현 — 개별 Kit 의 로깅에 맡김. 향후 hook 추가 가능.

**포인트 5 — `bootSteps` getter 는 lazy (container 의존)**  
`AuthKit.bootSteps` getter 가 `AppKits.maybeContainer` 를 확인하고, container 부착 전이면 빈 리스트. `main.dart` 의 `install → container → attach` 순서 이후에 `AppKits.allBootSteps` 를 읽어야 실제 step 목록이 나옴. 이 순서 강제는 ADR-003 의 attachContainer 규약과 일치.

## 이 선택이 가져온 것

### 긍정적 결과

- Kit 가 필요한 부팅 작업을 제공하고 앱은 모은 단계를 실행해요.
- Kit 의 폴더에서 부팅 작업과 의존성을 함께 확인할 수 있어요.
- SplashController 에 BootStep 목록을 주입해 순서와 실패 처리를 따로 테스트할 수 있어요.
- 설치 목록과 각 Kit 의 단계 목록에서 실행 순서를 확인할 수 있어요.
- 실패한 단계 이름, 원본 오류, 스택을 SplashResult 에 보관해 원인을 전달해요.

### 부정적 결과

- 단계 간 의존성을 그래프로 선언하지 않고 목록 순서로 관리해요.
- `execute()` 는 Future<void> 계약이므로 동기 작업도 이 반환 형식에 맞춰야 해요.
- SplashResult 는 준비 완료와 오류를 구분하지만 경고·부분 성공은 별도 모델로 제공하지 않아요.
- 단계는 순차 실행해요. 예외가 나면 오류 결과를 반환하며 뒤 단계는 실행하지 않아요.
- 예외를 단계 안에서 처리하고 정상 반환한 경우에는 다음 단계로 진행해요. 모든 실패를 자동으로 무시하는 구조는 아니에요.

## 교훈

<a id="교훈-1--최소-인터페이스가-유지보수를-쉽게"></a>

### 교훈 1 — 최소 인터페이스가 유지보수를 쉽게

BootStep 은 `name` 과 `execute()` 를 제공해요. 필요한 의존성은 생성자나 현재 Kit 조립 방식으로 전달할 수 있으므로 모든 구현체가 BuildContext 를 받도록 만들 필요는 없어요.

<a id="교훈-2-부팅-실패는-앱-멈춤-보다-fallback-이-좋다"></a>
<a id="교훈-2--부팅-실패는-앱-멈춤-보다-fallback-이-좋다"></a>

### 교훈 2 — 단계별로 실패 후 동작을 정해요

부팅 실패를 허용할지는 각 단계의 역할에 따라 달라요. AuthCheckStep 처럼 내부에서 실패를 처리하는 단계는 다음 단계로 이어질 수 있지만, SplashController 까지 전달된 예외는 부팅 오류 결과를 만들어요. 앱이 계속 열리는지와 해당 기능을 사용할 수 있는지는 따로 확인해야 해요.

<a id="교훈-3--부팅-단계-관측성은-중요"></a>

### 교훈 3 — 부팅 단계 관측성은 중요

SplashController 는 실패한 단계 이름과 원본 예외·스택을 결과에 담아요. main.dart 는 이 결과를 크래시 서비스에 보고해요. 단계별 실행 시간이나 성공 로그는 현재 중앙에서 자동 수집하지 않으므로 이미 제공되는 기능으로 설명하지 않아요. 필요하면 측정 목적과 기록 범위를 정해 추가해요.

## 관련 사례 (Prior Art)

- [Android Jetpack Startup](https://developer.android.com/jetpack/androidx/releases/startup) — `Initializer` 인터페이스. 본 ADR 의 개념적 원천
- [iOS AppDelegate Lifecycle](https://developer.apple.com/documentation/uikit/uiapplicationdelegate/application(_:didfinishlaunchingwithoptions:)) — didFinishLaunchingWithOptions 의 step 들
- [Spring Boot ApplicationRunner / CommandLineRunner](https://docs.spring.io/spring-boot/reference/features/spring-application.html#features.spring-application.application-runner) — 부팅 단계 hook
- [Flutter `flutter_native_splash` 패키지](https://pub.dev/packages/flutter_native_splash) — 네이티브 스플래시와의 연결점
- [Rx `Observable.concat`](https://reactivex.io/documentation/operators/concat.html) — 순차 실행의 reactive 버전

## Code References

**계약 + 실행기**
- [`lib/core/kits/boot_step.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/core/kits/boot_step.dart) — 인터페이스 (`lib/common/splash/boot_step.dart` 는 re-export)
- [`lib/common/splash/splash_controller.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/common/splash/splash_controller.dart) — 61줄 실행기

**Kit 측 기여**
- [`lib/core/kits/app_kit.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/core/kits/app_kit.dart) — `bootSteps` getter 정의
- [`lib/core/kits/app_kits.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/core/kits/app_kits.dart) — `allBootSteps` 합성

**BootStep 구현 예시**
- [`lib/kits/auth_kit/auth_check_step.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/auth_kit/auth_check_step.dart) — 토큰 유효성 확인
- [`lib/kits/local_db_kit/db_migration_step.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/local_db_kit/db_migration_step.dart) — Drift 마이그레이션 선실행
- [`lib/kits/ads_kit/att_permission_step.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/ads_kit/att_permission_step.dart) — iOS ATT 권한 요청

**main.dart 통합**
- [`lib/main.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/main.dart) — `SplashController(steps: AppKits.allBootSteps).run()`

**관련 ADR**:
- [`ADR-003 · FeatureKit 동적 레지스트리`](./adr-003-featurekit-registry.md) — Kit 의 `bootSteps` 기여 메커니즘
- [`ADR-006 · 인터페이스 기반 서비스 교체 + Debug 폴백`](./adr-006-debug-fallback.md) — BootStep 이 `crashService?` 로 non-fatal 리포트
- [`ADR-017 · 4가지 로딩 UX 패턴`](./adr-017-loading-ux.md) — 부팅 중 스플래시 UI 표현
- [`ADR-019 · 솔로 친화적 운영`](./adr-019-solo-friendly.md) — "앱 부팅 시 뭐가 실행되는지" 를 Kit 별로 모은 이점
