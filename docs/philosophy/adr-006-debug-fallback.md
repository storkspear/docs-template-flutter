<a id="debug_fallback"></a>

# Debug_Fallback

**Status**: Accepted. 현재 유효. 2026-04-24 기준 `AnalyticsService`, `CrashService`, `NotificationService` 3개 인터페이스에 `Debug*` 폴백 제공. 실제 구현체는 `observability_kit`, `notifications_kit` 가 Provider override 로 교체.

## 결론부터

크래시 보고와 분석 같은 외부 서비스는 인터페이스로 사용하고, 설정이 없을 때 개발용 구현으로 실행할 수 있게 해요. 현재 기본 조립은 Sentry DSN과 PostHog 키를 보고 구현을 선택해요. 이 폴백을 모든 Kit의 자동 전환으로 일반화하지 않아요. FCM과 권한 요청은 별도 연결이 필요해요.

## 왜 이런 고민이 시작됐나?

관측성 · 알림 · 분석 같은 서비스는 **외부 SDK 에 깊게 의존** 해요. Sentry 는 DSN, PostHog 는 API Key, FCM 은 Firebase config 가 있어야 초기화 가능. 그런데 템플릿 상태에선:

- DSN · API Key 가 없고 (실제 값을 커밋 금지 — ADR-001)
- Firebase 프로젝트도 없고
- 파생 레포마다 이 서비스들을 쓸지 말지 **선택**

이때 "외부 서비스가 없는데 앱이 돌아가야" 하는 모순된 상황이 됩니다. 세 압력이 부딪혀요.

**압력 A — 템플릿 부팅 가능성**  
파생 레포 개발자가 `flutter run` 을 치면 **아무 설정 없이도 앱이 떠야** 해요. "Sentry DSN 을 먼저 설정해야 부팅됩니다" 라면 진입 장벽이 너무 커요.

**압력 B — ViewModel 의 서비스 접근 일관성**  
ViewModel 코드가 `analyticsProvider.trackEvent(...)` 같이 호출하는데, 어떤 환경이든 **이 호출이 실패하지 않아야** 해요. null check · try-catch 로 감싸면 사용처 N 곳에서 보일러플레이트 폭발.

**압력 C — 실제 구현체 교체 용이성**  
파생 레포에서 Sentry DSN 을 주입하면 **코드 수정 없이** Debug 구현체가 Sentry 구현체로 swap 돼야 해요. 개발자가 `if (useSentry) ...` 분기를 여기저기 넣으면 안 됨.

이 결정이 답해야 했던 물음이에요.

> **외부 SDK 가 없어도 앱이 돌되, 있으면 자동으로 진짜 구현체로 교체되는 구조** 는 무엇인가?

## 고민했던 대안들

<a id="option-1--nullable-provider"></a>

### Option 1 — Nullable Provider

Sentry 가 비활성이면 `crashServiceProvider` 가 `null` 반환.

```dart
final crashServiceProvider = Provider<CrashService?>((ref) {
  return SENTRY_DSN.isNotEmpty ? SentryCrashService() : null;
});

// ViewModel
ref.read(crashServiceProvider)?.reportError(e, st);  // 매번 ?.
```

- **장점**: 타입 시스템이 "없을 수 있음" 을 표현.
- **단점 1**: **호출처 N 곳에서 `?.` 반복**. `analyticsProvider?.trackEvent(...)` 가 100곳이면 100번 null 체크.
- **단점 2**: 호출이 silently no-op 돼서 버그 추적 어려움 — "왜 이벤트가 안 찍히지? Provider 가 null 인가?" 를 매번 확인.
- **탈락 이유**: 압력 B 위반. 호출처가 복잡해짐.

<a id="option-2--조건부-import--dart-conditional-import"></a>

### Option 2 — 조건부 import + Dart `conditional import`

```dart
import 'debug_crash_service.dart'
    if (dart.library.io) 'sentry_crash_service.dart';
```

- **장점**: Dart 공식 기능. 컴파일 시점에 구현체 선택.
- **단점 1**: `conditional import` 는 **플랫폼 조건** 만 지원 (web / io). Sentry DSN 유무 같은 **런타임 값** 은 분기 불가.
- **단점 2**: 그럼에도 Sentry SDK 는 import 되어 바이너리에 포함. tree-shaking 에 도움 안 됨.
- **탈락 이유**: Sentry DSN 유무는 런타임 환경 변수 기반이라 conditional import 로 해결 불가.

<a id="option-3--추상-인터페이스--debug-폴백--provider-override--채택"></a>

### Option 3 — 추상 인터페이스 + Debug 폴백 + Provider override ★ (채택)

`AnalyticsService` 같은 추상 클래스 선언. 기본 `Provider` 는 `DebugAnalyticsService` 반환. Kit 이 활성화되면 `providerOverrides` 로 `PostHogAnalyticsService` 등으로 교체.

- **압력 A 만족**: Debug 구현체는 DSN · 환경 변수 없이도 동작 (print 만).
- **압력 B 만족**: ViewModel 은 항상 `AnalyticsService` 타입으로 접근. nullable 아님.
- **압력 C 만족**: Provider override 로 투명하게 swap. 호출처 수정 0.

## 결정

### 1. 추상 인터페이스 (`core/analytics/`)

```dart
// lib/core/analytics/analytics_service.dart 발췌
abstract class AnalyticsService {
  Future<void> trackScreen(String screenName, {Map<String, dynamic>? properties});
  Future<void> trackEvent(String eventName, {Map<String, dynamic>? properties});
  Future<void> identify(String userId, {Map<String, dynamic>? traits});
  Future<void> reset();
}

class DebugAnalyticsService implements AnalyticsService {
  @override
  Future<void> trackScreen(String screenName, {Map<String, dynamic>? properties}) async {
    assert(() {
      print('[Analytics] Screen: $screenName $properties');
      return true;
    }());
  }
  // ...
}
```

```dart
// lib/core/analytics/crash_service.dart 발췌
abstract class CrashService {
  Future<void> init();
  Future<void> reportError(dynamic error, StackTrace? stackTrace, {bool fatal = false});
  Future<void> setUser(String userId, {String? email});
  Future<void> clearUser();
  Future<void> addBreadcrumb(String message, {Map<String, dynamic>? data});
}

class DebugCrashService implements CrashService {
  @override
  Future<void> init() async {
    final previous = FlutterError.onError;
    FlutterError.onError = (details) {
      FlutterError.presentError(details);
      reportError(details.exception, details.stack);
      previous?.call(details);  // ← 체인 호출로 Sentry 와 공존 가능
    };
  }

  @override
  Future<void> reportError(dynamic error, StackTrace? stackTrace, {bool fatal = false}) async {
    if (kDebugMode) {
      print('[Crash] ${fatal ? "FATAL " : ""}$error');
      if (stackTrace != null) print(stackTrace);
    }
  }
  // ...
}
```

### 2. 기본 Provider (`common/providers.dart`)

```dart
// lib/common/providers.dart 발췌
final analyticsProvider = Provider<AnalyticsService>(
  (ref) => DebugAnalyticsService(),  // ← 기본은 Debug
);

final crashServiceProvider = Provider<CrashService>(
  (ref) => DebugCrashService(),
);

final notificationServiceProvider = Provider<NotificationService>((ref) {
  final service = DebugNotificationService();
  ref.onDispose(service.dispose);
  return service;
});
```

### 3. Kit 활성화 시 교체 (Provider override)

```dart
// lib/kits/observability_kit/observability_kit.dart 개요
class ObservabilityKit extends AppKit {
  @override
  List<Override> get providerOverrides {
    final overrides = <Override>[];
    if (ObservabilityEnv.isSentryEnabled) {
      overrides.add(crashServiceProvider.overrideWithValue(SentryCrashService()));
    }
    if (ObservabilityEnv.isPostHogEnabled) {
      overrides.add(analyticsProvider.overrideWithValue(PostHogAnalyticsService()));
    }
    return overrides;
  }
}
```

환경 변수 (`--dart-define=SENTRY_DSN=...`) 가 주입되면 `isSentryEnabled == true` → Provider override → ViewModel 에서 `ref.read(crashServiceProvider)` 가 `SentryCrashService` 반환.

### 4. ViewModel 사용 (교체 여부 무관)

```dart
// 어떤 ViewModel
class MyViewModel extends Notifier<MyState> {
  Ref get _ref => ref;

  Future<void> doSomething() async {
    try {
      // ...
      await _ref.read(analyticsProvider).trackEvent('did_something');  // ← 항상 존재
    } catch (e, st) {
      await _ref.read(crashServiceProvider).reportError(e, st);
    }
  }
}
```

Debug 환경이면 콘솔 print, 프로덕션 환경이면 Sentry 전송. ViewModel 은 구분 안 함.

### 설계 선택 포인트

**포인트 1 — Debug 구현체는 `assert` 로 감싸 production build 에서 제거**  
`print` 를 프로덕션 빌드까지 남기면 불필요한 I/O. `assert(() { print(...); return true; }())` 관용으로 **debug 빌드에서만** 실행. Release 빌드는 no-op.

**포인트 2 — `FlutterError.onError` 는 체인 호출**  
`DebugCrashService.init()` 이 `FlutterError.onError` 를 덮어쓰면 **먼저 등록된 Sentry 핸들러가 사라져요**. 그래서 `previous?.call(details)` 로 체인 호출. 순서는 Sentry 가 먼저 init 되고 Debug 가 뒤에 래핑되는 구조.

**포인트 3 — 인터페이스 위치 — 보통 `core/`, 단일 Kit 내부 인터페이스는 Kit 폴더 허용**  
**여러 Kit · ViewModel 이 공유하는 인터페이스** 는 `core/` 에 둬요. `AnalyticsService` · `CrashService` 는 모든 Kit 에서 호출되니 `core/analytics/` 에 두고, 실제 `PostHogAnalyticsService` 는 `kits/observability_kit/` 에 분리해서 ADR-002 의 의존 방향 규칙 (kits → core) 을 지켜요.

반면 **단일 Kit 내부에서만 쓰이는 인터페이스** (예: `NotificationService` — `notifications_kit` 외에는 호출자가 없음) 는 해당 Kit 폴더 (`lib/kits/notifications_kit/notification_service.dart`) 에 정의해요. core 에 두면 오히려 "필요 없는 추상이 core 에 노출" 되는 셈이라 실용성을 우선해요. 의존 방향은 여전히 단방향 (`features → common → kits → core`) 으로 유지돼요.

**포인트 4 — `Debug*` 네이밍 관용**  
`NoopAnalyticsService` · `FakeAnalyticsService` 대신 `DebugAnalyticsService` 로 명명. 이유는 **개발 중엔 print 로 가시성을 제공** 하니까 완전 no-op 이 아님. "디버그 빌드용 구현" 이라는 의도를 이름에 담음.

**포인트 5 — Provider 는 항상 존재, override 만 바뀜**  
`analyticsProvider` 자체는 providers.dart 에 무조건 선언. `ObservabilityKit` 이 없어도 `ref.read(analyticsProvider)` 는 Debug 구현체 반환. **Kit 이 "추가 기능" 이 아니라 "구현체 swap"** 역할을 해요.

## 이 선택이 가져온 것

### 긍정적 결과

- 관측성 키가 없어도 Debug 구현체로 같은 인터페이스를 호출할 수 있어요. 다른 native 설정과 앱 부팅 조건까지 면제되지는 않아요.
- 호출부를 바꾸지 않고 관측성 구현체를 교체할 수 있어요.
- 테스트에서는 Provider override 로 외부 SDK 대신 fake 를 주입할 수 있어요.
- 개발 실행에서 이벤트와 오류를 콘솔로 확인할 수 있어요. DebugAnalyticsService 는 assert, DebugCrashService 의 출력은 kDebugMode 조건을 사용해요.

### 부정적 결과

- Debug 구현으로 동작하는지 외부 전송 구현으로 동작하는지 배포 전에 확인해야 해요.
- 인터페이스를 바꾸면 이를 구현한 클래스와 테스트도 수정해야 해요. AnalyticsService 의 Debug·PostHog 구현과 CrashService 의 Debug·Sentry 구현은 별개예요.
- 새 서비스의 인터페이스는 실제 호출부가 필요한 범위로 정해야 해요. 사용하지 않는 메서드를 예상해 늘리면 구현체 관리 부담이 커져요.
- abstract 메서드 구현 누락은 정적 분석으로 확인해요. 기본 구현이 요구한 동작을 하는지는 테스트가 필요해요.

## 교훈

<a id="교훈-1--인터페이스--구현-분리-의-진짜-이득은-동작-가능-범위-넓히기"></a>

### 교훈 1 — "인터페이스 + 구현 분리" 의 진짜 이득은 **"동작 가능 범위 넓히기"**

외부 의존성을 인터페이스 뒤로 두면 SDK 를 연결하지 않은 환경에서도 해당 기능을 대체할 수 있어요. 이 장점은 앱 전체가 아무 설정 없이 실행된다는 보장과는 달라요. 각 Kit 의 필수 조건과 Debug 구현의 동작 범위를 함께 안내해요.

<a id="교훈-2--fluttererroronerror-덮어쓰기-주의"></a>

### 교훈 2 — `FlutterError.onError` 덮어쓰기 주의

DebugCrashService 는 초기화 시 기존 FlutterError.onError 를 보관하고 새 핸들러에서 함께 호출해요. 전역 오류 훅을 추가할 때는 기존 핸들러와의 관계를 확인해야 해요. 현재 Sentry 활성화와 CrashService 선택은 같은 조건으로 연결되어 있어, 기본 조립에서 Debug 가 Sentry 뒤에 선택되는 흐름으로 설명하지 않아요.

<a id="교훈-3----dart-define-확인이-어려움"></a>

### 교훈 3 — `--dart-define` 확인이 어려움

ObservabilityEnv 는 빌드 상수의 존재로 활성 여부를 판단하지만 현재 부팅 로그에 그 상태를 자동 출력하지는 않아요. 전송이 보이지 않으면 Kit 설치, 키 주입, SDK 초기화, 네트워크 상태를 차례로 확인해요. 상태 진단을 추가할 때는 키 값 자체를 출력하지 않아요.

## 관련 사례 (Prior Art)

- [Riverpod `overrideWith` 공식 가이드](https://riverpod.dev/docs/how_to/testing) — Provider 교체 패턴의 기반
- [Dependency Injection in Flutter](https://docs.flutter.dev/app-architecture/case-study/dependency-injection) — 공식 아키텍처 가이드의 의존성 주입 설명
- [Sentry Flutter 공식 통합](https://docs.sentry.io/platforms/flutter/) — `SentryCrashService` 구현의 기반
- [PostHog Flutter 공식 통합](https://posthog.com/docs/libraries/flutter) — 동일
- [Null Object Pattern (Martin Fowler)](https://refactoring.com/catalog/introduceSpecialCase.html) — Debug 구현체의 개념적 뿌리

## Code References

**추상 인터페이스 (core 레이어)**
- [`lib/core/analytics/analytics_service.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/core/analytics/analytics_service.dart) — 추상 + Debug 구현
- [`lib/core/analytics/crash_service.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/core/analytics/crash_service.dart) — 추상 + Debug 구현

**기본 Provider**
- [`lib/common/providers.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/common/providers.dart) — `analyticsProvider` · `crashServiceProvider` · `notificationServiceProvider` Debug 기본

**실제 구현체 (kits 레이어)**
- [`lib/kits/observability_kit/sentry_crash_service.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/observability_kit/sentry_crash_service.dart)
- [`lib/kits/observability_kit/posthog_analytics_service.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/observability_kit/posthog_analytics_service.dart)
- [`lib/kits/observability_kit/observability_kit.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/observability_kit/observability_kit.dart) — `providerOverrides` 로 교체
- [`lib/kits/observability_kit/observability_env.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/observability_kit/observability_env.dart) — 환경 변수 감지

**notifications_kit 의 같은 패턴**
- [`lib/kits/notifications_kit/notification_service.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/notifications_kit/notification_service.dart) — 추상 인터페이스 + Debug 구현 (FCM 실제 구현체는 파생 레포가 채움)

**관련 ADR**:
- [`ADR-002 · 3계층 모듈 구조`](./adr-002-layered-modules.md) — 인터페이스를 `core/` 에 두는 이유
- [`ADR-003 · FeatureKit 동적 레지스트리`](./adr-003-featurekit-registry.md) — Kit 이 `providerOverrides` 로 교체하는 메커니즘
- [`ADR-005 · Riverpod + MVVM`](./adr-005-riverpod-mvvm.md) — Provider override 가 동작하는 DI 기반
- [`ADR-019 · 솔로 친화적 운영`](./adr-019-solo-friendly.md) — "진입장벽 0" 이 솔로 운영에 가치 있는 이유
