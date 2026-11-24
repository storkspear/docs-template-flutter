<a id="redirect_priority"></a>

# Redirect_Priority

**Status**: Accepted. 현재 유효. 2026-04-24 기준 `lib/core/kits/app_kit.dart` 의 `redirectPriority` + `lib/core/kits/app_kits.dart` 의 안정 정렬 + `lib/common/router/app_router.dart` 의 합성 로직.

## 결론부터

Kit의 라우팅 규칙은 낮은 `redirectPriority`부터 평가하고 같은 값이면 설치 순서를 따라요. 한 번의 평가에서는 첫 non-null 결과를 반환해요. 현재 규칙을 제공하는 Kit는 AuthKit과 OnboardingKit이며, UpdateKit은 별도 다이얼로그 게이트를 사용해요. GoRouter가 새 경로를 다시 평가하므로 우선순위만으로 순환 리다이렉트가 방지되는 것은 아니에요.

## 왜 이런 고민이 시작됐나?

여러 Kit 이 각자 라우팅 개입을 원해요.

- **UpdateKit**: "필수 업데이트 버전 이하(≤)면 스토어로 강제 이동"
- **AuthKit**: "미인증 상태면 `/login`, 인증됐는데 `/login` 접근 시 `/home`"
- **OnboardingKit**: "온보딩 미완료면 온보딩 플로우"

이게 **동시에 발동** 하면 혼란이에요.

- 미인증 + 업데이트 필요 → 로그인 먼저? 업데이트 먼저?
- 온보딩 미완료 + 미인증 → 온보딩 먼저 할지, 로그인 먼저 할지

압력들이 부딪혀요.

**압력 A — 순서의 명확성**  
"뭐가 먼저?" 를 **코드로 명시** 해야 해요. 암묵적 가정 (install 순서 = 실행 순서) 은 버그 유발.

**압력 B — Kit 독립성 (순환 참조 금지)**  
`AuthKit` 이 `UpdateKit` 의 존재를 알면 안 돼요 (`requires` 선언은 타입만, 동작 참조 금지). 각 Kit 이 **독립 선언** 만으로 올바른 순서 보장.

**압력 C — 확장 용이성**  
새 게이트 추가 (예: `FeatureFlagKit` 이 "beta 사용자만 접근" 게이트) 시 기존 Kit 수정 없이 추가.

**압력 D — 동일 우선순위의 결정성**  
두 Kit 이 `priority = 10` 이면? 순서가 **random** 이면 재현 불가능한 버그.

이 결정이 답해야 했던 물음이에요.

> **Kit 간 독립성을 유지하면서 라우팅 게이트 실행 순서를 명시적이고 결정적으로 제어** 하려면?

## 고민했던 대안들

<a id="option-1--install-순서--실행-순서"></a>

### Option 1 — install 순서 = 실행 순서

`AppKits.install([UpdateKit(), AuthKit(), OnboardingKit()])` 순서대로 redirect 실행.

- **장점**: 단순. 순서 = 리스트 순서.
- **단점 1**: install 순서는 **의존성 (requires) 관점** 이라 의미 중첩. "auth 설치 먼저 (BackendApi 의존)" vs "auth 리다이렉트 먼저" 혼동.
- **단점 2**: 순서 변경하려면 install 리스트를 재정렬. 의존성 무너질 수 있음.
- **단점 3**: **명시적 순서 선언 없음** — 코드 읽는 사람이 "왜 auth 가 먼저?" 를 install 순서에서 유추.
- **탈락 이유**: 압력 A 위반.

<a id="option-2--dependson-기반-위상-정렬"></a>

### Option 2 — `dependsOn` 기반 위상 정렬

`AuthKit` 가 "UpdateKit 다음에 실행" 를 `runAfter: [UpdateKit]` 로 선언.

- **장점**: 명시적 의존 관계.
- **단점 1**: Kit 이 **다른 Kit 을 타입으로 참조** → 상호 결합. `OnboardingKit` 이 `runAfter: [UpdateKit, AuthKit]` 하면 AuthKit 을 import.
- **단점 2**: 위상 정렬 알고리즘 + 순환 감지 구현 필요. 복잡.
- **단점 3**: 새 Kit 추가 시 **기존 Kit 수정** 가능성 — "AuthKit 이 ForceUpdateKit 뒤에 실행" 을 어느 시점에 누가 업데이트?
- **탈락 이유**: 압력 B (독립성) 위반.

<a id="option-3--정수-redirectpriority--안정-정렬--채택"></a>

### Option 3 — 정수 `redirectPriority` + 안정 정렬 ★ (채택)

각 Kit 이 자기 `redirectPriority: int` 선언. 낮은 숫자 먼저. 동일 숫자는 install 순서로 안정 정렬.

- **압력 A 만족**: 각 Kit 의 header 에 우선순위가 숫자로 명시. 5초면 파악.
- **압력 B 만족**: Kit 간 직접 참조 없음. "내 우선순위는 10" 만 선언.
- **압력 C 만족**: 새 Kit 은 "내 우선순위" 만 정함. 기존 Kit 무관.
- **압력 D 만족**: 동일 우선순위는 install 순서로 tie-break. 결정적.

## 결정

### AppKit 계약의 redirectPriority

```dart
// lib/core/kits/app_kit.dart 발췌
abstract class AppKit {
  /// 리다이렉트 우선순위. 낮을수록 먼저 실행 (더 강한 차단력).
  /// 기본값 100. UpdateKit=1, AuthKit=10, OnboardingKit=50 권장.
  int get redirectPriority => 100;
  // ...
}
```

### AppKits 의 안정 정렬

```dart
// lib/core/kits/app_kits.dart 발췌
static List<RedirectRule> get redirectRules {
  final indexed = <({int priority, int order, RedirectRule rule})>[];
  for (var i = 0; i < _installed.length; i++) {
    final rule = _installed[i].buildRedirect();
    if (rule != null) {
      indexed.add((
        priority: _installed[i].redirectPriority,
        order: i,                                    // ← install 인덱스
        rule: rule,
      ));
    }
  }
  indexed.sort((a, b) {
    final byPriority = a.priority.compareTo(b.priority);
    return byPriority != 0 ? byPriority : a.order.compareTo(b.order);  // ← tie-break
  });
  return indexed.map((e) => e.rule).toList();
}
```

### AppRouter 의 합성

```dart
// lib/common/router/app_router.dart 발췌
String? _composedRedirect(BuildContext context, GoRouterState state) {
  for (final rule in AppKits.redirectRules) {     // ← 우선순위 정렬된 규칙들
    final result = rule(context, state);
    if (result != null) return result;            // ← 첫 non-null 이 최종 리다이렉트
  }
  if (state.matchedLocation == Routes.splash) {
    return Routes.home;                            // ← 기본 fallback
  }
  return null;
}
```

### Kit 별 우선순위 예

리다이렉트 체인에 실제로 들어가는 Kit 은 둘이에요.

**AuthKit (priority 10)** — 인증:
```dart
// lib/kits/auth_kit/auth_kit.dart 발췌
@override
int get redirectPriority => 10;

@override
RedirectRule? buildRedirect() => (ctx, state) {
  final container = AppKits.maybeContainer ?? ProviderScope.containerOf(ctx);
  final status = container.read(authStateProvider).current.status;
  return computeRedirect(          // ← 분기는 순수 함수로 분리해 단위 테스트
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

**OnboardingKit (priority 50)** — 온보딩:
```dart
// lib/kits/onboarding_kit/onboarding_kit.dart 발췌
@override
int get redirectPriority => 50;

@override
RedirectRule? buildRedirect() => (ctx, state) {
  final isOnboardingPath = state.matchedLocation == onboardingPath;
  if (!isComplete.value && !isOnboardingPath) return onboardingPath;
  if (isComplete.value && isOnboardingPath) return completedRedirectPath;
  return null;
};
```

### 강제 업데이트는 리다이렉트 게이트가 아니에요

`UpdateKit` 은 `redirectPriority => 1` 을 선언하지만 `buildRedirect()` 를 **구현하지 않아요**. `AppKit.buildRedirect()` 의 기본 구현이 `null` 을 반환하고 `AppKits._buildRedirectRules()` 는 non-null 인 규칙만 모으니, UpdateKit 은 체인에 아예 들어가지 않아요. 그래서 지금 이 Kit 의 `redirectPriority = 1` 은 **아무 데서도 읽히지 않는 예약값** 이에요 — 최우선 게이트 자리를 비워두는 표시로만 남아 있어요. `/force-update` 라우트도 없어요 (`lib/common/router/routes.dart` 에는 splash · login · home · settings · 로그인 2FA · 설정 2FA 여섯 개만 있어요).

강제 업데이트는 대신 **Navigator 밖 오버레이** 로 처리해요.

```dart
// lib/app.dart 발췌
MaterialApp.router(
  routerConfig: _appRouter.router,
  builder: (context, child) => _ForceUpdateGate(child: child),  // ← Navigator 밖
)
```

`UpdateKit` 의 부트 단계가 `service.check()` 결과를 `forceUpdateInfoNotifier` 에 넣으면, `_ForceUpdateGate` 가 그 값을 듣고 화면 전체를 `ModalBarrier` + `ForceUpdateDialog` 로 덮어요 (`info.isForce` 가 false 면 닫을 수 있는 `UpdateAvailableDialog`). 라우팅을 건드리지 않으니 어느 화면에 있든 즉시 덮이고, 리다이렉트 체인의 순서 경쟁에서도 자유로워요.

### 실행 흐름 예시

인증 규칙과 온보딩 규칙은 각각의 단독 조건뿐 아니라 함께 평가되는 경로를 확인해야 해요. 현재 구현에서 미인증 상태로 두 Kit를 설치하고 온보딩이 미완료이면, `/login`에서 온보딩 규칙이 `/onboarding`을 반환하고 새 경로에서는 인증 규칙이 `/login`을 반환할 수 있어요.

따라서 이 조합을 로그인 뒤 온보딩으로 자동 진행하는 검증된 예제로 제시하지 않아요. 실제 앱의 라우터 조립에서 재평가 흐름과 리다이렉트 제한을 검증한 뒤 적용해야 해요.

강제 업데이트는 별도의 `_ForceUpdateGate`가 화면 위에 표시해요. 업데이트 게이트의 표시와 라우팅 규칙의 재평가는 서로 다른 경로예요.

### 권장 우선순위 범위

| 카테고리 | 범위 | 예 |
|---|---|---|
| 최우선 게이트 | 1~9 | 유지보수 게이트 등 파생 앱의 규칙 |
| 인증 | 10~19 | AuthKit |
| 온보딩·동의 | 50~59 | OnboardingKit |
| 기능별 조건 | 60~99 | 파생 앱의 기능 제한 |
| 기본값 | 100 | 별도 값을 지정하지 않은 Kit |

이 범위는 순서를 읽기 위한 규약이에요. 같은 값도 허용하며 설치 순서로 정렬해요. UpdateKit의 1은 현재 규칙을 만들지 않아 평가되지 않아요.

### 설계 선택 포인트

우선순위는 각 Kit가 정수로 선언하고, Kit 등록 순서와 별도로 읽을 수 있게 해요. 첫 non-null은 한 번의 평가를 끝내는 조건이지 이후 경로의 재평가를 막는 조건은 아니에요. 선택적 `buildRedirect()`가 null이면 규칙 수집에서 제외돼요.

## 이 선택이 가져온 것

### 긍정적 결과

각 Kit 에서 우선순위를 읽을 수 있고, 같은 값은 설치 순서로 평가해요. 규칙이 필요 없으면 buildRedirect 가 null 을 반환해 수집에서 빠질 수 있어요. 새 게이트는 순서뿐 아니라 기존 규칙과 경로가 어떻게 맞물리는지도 설계해야 해요.

### 부정적 결과

앞 규칙이 먼저 경로를 반환하면 뒤 규칙은 그 평가에서 실행되지 않아요. 이후 새 경로에서 GoRouter 가 다시 평가할 수 있으므로 두 규칙이 서로 되돌리는지 확인해야 해요. 현재 미인증·온보딩 미완료 상태의 AuthKit+OnboardingKit 조합은 루프가 재현돼요. 비어 있는 우선순위 값은 허용되며 숫자 범위 자체가 자원 낭비는 아니에요.

## 교훈

<a id="교훈-1-순서가-의미인-집합은-정수-우선순위-가-효율적"></a>
<a id="교훈-1--순서가-의미인-집합은-정수-우선순위-가-효율적"></a>

### 교훈 1 — 우선순위와 규칙의 상호작용을 함께 확인해요

현재 규칙은 정수 우선순위로 정렬해요. 간단한 순서를 표현하기 위한 선택이며 모든 조합의 안전성을 해결하는 장치는 아니에요. 실제로 선행·후행 의존성이 복잡해지면 별도 모델의 필요를 검토할 수 있어요.

<a id="교훈-2--숫자-사이를-비워둬야-확장-가능"></a>

### 교훈 2 — 숫자 사이를 비워둬야 확장 가능

우선순위를 10·50·100 처럼 띄우면 중간 순서를 추가하기 편해요. 반드시 특정 배수를 써야 하거나 빈 번호 때문에 동작이 바뀌는 것은 아니에요. UpdateKit 은 별도 화면 게이트이므로 redirect 체인의 선행 규칙으로 설명하지 않아요.

<a id="교훈-3--개입-안-함--null-관용이-깔끔"></a>

### 교훈 3 — "개입 안 함 = null" 관용이 깔끔

buildRedirect 는 선택적 기여예요. 기본 구현이 null 이므로 라우팅 규칙이 없는 Kit 는 빈 함수를 작성할 필요가 없어요. 규칙을 제공한 뒤 그 함수가 null 을 반환하는 경우는 해당 경로에서 이동하지 않겠다는 뜻으로 구분해요.

## 관련 사례 (Prior Art)

- [OkHttp 인터셉터 등록 순서](https://lysine.dev/okhttp/features/interceptors/) — 인터셉터 순서 개념
- [Express middleware 순서](https://expressjs.com/en/guide/using-middleware.html) — 등록 순서 = 실행 순서
- [React Router `guards`](https://reactrouter.com/start/framework/route-module#route-guards) — 라우팅 가드 체인
- [Vue Router `beforeEach` 체인](https://router.vuejs.org/guide/advanced/navigation-guards.html) — 우선순위 없이 순서대로
- [Jakarta `@Priority`](https://jakarta.ee/specifications/annotations/3.0/apidocs/jakarta.annotation/jakarta/annotation/Priority.html) — 우선순위를 표현하는 애너테이션. 실제 순서 적용은 이를 읽는 프레임워크에 따라 달라요

## Code References

**계약 + 합성**
- [`lib/core/kits/app_kit.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/core/kits/app_kit.dart) — `redirectPriority` getter
- [`lib/core/kits/app_kits.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/core/kits/app_kits.dart) — `redirectRules` 안정 정렬
- [`lib/common/router/app_router.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/common/router/app_router.dart) — `_composedRedirect` 첫 non-null

**Kit 별 설정 예**
- [`lib/kits/auth_kit/auth_kit.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/auth_kit/auth_kit.dart) — `redirectPriority: 10` + `buildRedirect`
- [`lib/kits/onboarding_kit/onboarding_kit.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/onboarding_kit/onboarding_kit.dart) — `redirectPriority: 50` + `buildRedirect`
- [`lib/kits/update_kit/update_kit.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/update_kit/update_kit.dart) — `redirectPriority: 1` 을 선언하지만 `buildRedirect` 는 없음 (미사용 예약값)

**강제 업데이트 오버레이**
- [`lib/app.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/app.dart) — `MaterialApp.router(builder:)` 의 `_ForceUpdateGate` (Navigator 밖 `ModalBarrier` + 다이얼로그)

**테스트**
- [`test/common/router/auth_guard_test.dart`](https://github.com/storkspear/template-flutter/blob/main/test/common/router/auth_guard_test.dart) — `AuthKit.computeRedirect` 순수 함수 테스트

**관련 ADR**:
- [`ADR-003 · FeatureKit 동적 레지스트리`](./adr-003-featurekit-registry.md) — Kit 이 `buildRedirect` · `redirectPriority` 기여
- [`ADR-005 · Riverpod + MVVM`](./adr-005-riverpod-mvvm.md) — 리다이렉트 내부에서 `container.read` 로 상태 접근
- [`ADR-008 · 부팅 단계 추상화`](./adr-008-boot-step.md) — `refreshListenable` 이 리다이렉트 재평가 트리거
