<a id="late_binding"></a>

# Late_Binding

**Status**: Accepted. 현재 유효. 2026-04-24 기준 `lib/common/providers.dart` 의 `apiClientProvider` ↔ `authServiceProvider` 쌍에 적용. `onTokenRefresh` 콜백 주입 방식.

## 결론부터

서로 참조하는 인증 서비스와 API 클라이언트는 필요한 시점에 서비스를 읽는 콜백으로 연결해요. 객체를 만드는 시점과 콜백을 실행하는 시점을 분리해 초기화 중 순환 참조를 피하는 방식이에요. 콜백도 생성자를 통해 주입하며, 갱신 요청용 Dio를 따로 두는 것은 인터셉터 재진입을 피하기 위한 별도 장치예요.

## 왜 이런 고민이 시작됐나?

`apiClientProvider` 와 `authServiceProvider` 를 처음 작성할 때 당연하게 생각한 형태는 다음이었어요.

```dart
final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient(
    tokenStorage: ref.watch(tokenStorageProvider),
    authService: ref.watch(authServiceProvider),  // ← 순환!
  );
});

final authServiceProvider = Provider<AuthService>((ref) {
  return AuthService(
    apiClient: ref.watch(apiClientProvider),      // ← 순환!
    tokenStorage: ref.watch(tokenStorageProvider),
  );
});
```

둘이 서로를 필요로 해요. Riverpod 은 이런 순환을 **런타임에 감지하고 예외** 를 던져요 (`CircularDependencyException`).

왜 서로 필요한지 실제 시나리오를 보면.

- `AuthService.signInWithEmail(email, password)` 는 `ApiClient.postRaw(ApiEndpoints.emailSignIn, ...)` 를 호출해요 (실제 path: `/api/apps/{slug}/auth/email/signin`).
- `ApiClient` 가 `/api/apps/{slug}/users/me` 같은 요청 중 **401** 을 받으면 `CMN_007` (access token 만료) 또는 `CMN_004` (인증 정보 없음). access token 만료면 **자동으로 refresh** 해서 요청을 재시도해야 해요. refresh 는 `AuthService.refreshToken()` 의 책임.

이 둘을 어떻게든 엮어야 해요. 힘들이 부딪혀요.

**힘 A — 생성자 주입의 명시성**  
"이 클래스가 뭘 필요로 하는지" 를 생성자 시그니처가 말해줘요. IDE 가 autocomplete 로 도와줘요. 리팩터 안전.

**힘 B — 순환 회피**  
Riverpod container 가 각 Provider 를 **지연 초기화** 하되 **의존 그래프가 DAG (순환 없음)** 이어야 안정 동작. 순환 시 `CircularDependencyException`.

**힘 C — 런타임 refresh 호출 가능성**  
refresh 는 앱 실행 중 **특정 순간에만** 필요. ApiClient 가 **평상시** 에 AuthService 를 몰라도 되고, refresh 시점에만 연결되면 충분.

이 결정이 답해야 했던 물음이에요.

> **순환을 피하되, 런타임에 필요할 때 상대 서비스를 호출할 수 있는 연결 방식** 은 무엇인가?

## 고민했던 대안들

<a id="option-1--service-locator-전역-접근"></a>

### Option 1 — Service Locator 전역 접근

`get_it` 같은 전역 로케이터로 `ApiClient` 내부에서 `GetIt.I<AuthService>()` 호출.

- **장점**: 순환 회피. 언제든 아무 서비스나 꺼내기 가능.
- **단점 1**: **전역 상태** 라 테스트 격리 깨짐. 한 테스트의 변경이 다음 테스트에 영향.
- **단점 2**: Riverpod Provider 시스템과 이중화 — 두 DI 시스템 병행. 복잡도 증가.
- **단점 3**: "이 클래스가 뭘 쓰는지" 가 생성자에 안 나타나 가시성 저하.
- **탈락 이유**: 압력 A (명시성) 위반. Riverpod 을 이미 쓰는데 별도 로케이터 도입은 중복.

<a id="option-2--apiclient-를-두-번-만들기"></a>

### Option 2 — ApiClient 를 두 번 만들기

`AuthService` 전용 `ApiClient` (refresh 없음) + 일반 `ApiClient` (refresh 가능) 분리.

- **장점**: 순환 없음. 명확한 역할 분리.
- **단점 1**: ApiClient 인스턴스 2개 → 커넥션 풀 · 인터셉터 · 쿠키 저장소 분리. 메모리 · 일관성 이슈.
- **단점 2**: `/auth/refresh` 요청은 일반 ApiClient 로, 다른 요청은 refresh 가능 ApiClient 로? 경계가 애매.
- **단점 3**: Dio 인터셉터가 두 곳에 중복 구현. DRY 위반.
- **탈락 이유**: 비용이 너무 큼. 실제로 공통 자원을 쪼개면 동기화 버그 위험.

<a id="option-3--콜백-주입-late-binding--채택"></a>

### Option 3 — 콜백 주입 (Late Binding) ★ (채택)

`ApiClient` 가 `authService` 가 아닌 **`Future<bool> Function()` 타입의 콜백** 을 받음. 콜백 자체는 `ref.read(authServiceProvider).refreshToken()` 을 호출.

```dart
final apiClientProvider = Provider<ApiClient>((ref) {
  final tokenStorage = ref.watch(tokenStorageProvider);
  return ApiClient(
    tokenStorage: tokenStorage,
    onTokenRefresh: () => ref.read(authServiceProvider).refreshToken(),  // ← late binding
  );
});

final authServiceProvider = Provider<AuthService>((ref) {
  return AuthService(
    apiClient: ref.watch(apiClientProvider),       // ← 정상 의존
    tokenStorage: ref.watch(tokenStorageProvider),
    authState: ref.watch(authStateProvider),
  );
});
```

- **압력 A 부분 만족**: `ApiClient` 의 생성자는 `Future<bool> Function()` 을 받으니까 여전히 명시적. 단 "무엇" 을 호출하는지는 provider 레벨에서만 보임.
- **압력 B 만족**: Riverpod 관점에서 `apiClientProvider` 는 `authServiceProvider` 를 **watch 하지 않음** — 의존 그래프가 DAG.
- **압력 C 만족**: 콜백은 **실행 시점에** `ref.read` 로 authService 를 가져와서 호출 → refresh 순간에만 연결.

## 결정

### 순환 풀이 패턴

```dart
// lib/common/providers.dart 발췌

// 1. ApiClient 는 "refresh 콜백" 만 알아요
final Provider<ApiClient> apiClientProvider = Provider<ApiClient>((ref) {
  final tokenStorage = ref.watch(tokenStorageProvider);
  final client = ApiClient(
    tokenStorage: tokenStorage,
    onTokenRefresh: () => ref.read(authServiceProvider).refreshToken(),  // ← 콜백
  );
  ref.onDispose(client.dispose);
  return client;
});

// 2. AuthService 는 ApiClient 를 정상 watch
final Provider<AuthService> authServiceProvider = Provider<AuthService>((ref) {
  return AuthService(
    apiClient: ref.watch(apiClientProvider),
    tokenStorage: ref.watch(tokenStorageProvider),
    authState: ref.watch(authStateProvider),
  );
});
```

### ApiClient 생성자 시그니처

```dart
// lib/kits/backend_api_kit/api_client.dart 발췌
class ApiClient {
  final TokenStorage tokenStorage;
  final Future<bool> Function() onTokenRefresh;  // ← AuthService 대신 콜백

  ApiClient({
    required this.tokenStorage,
    required this.onTokenRefresh,
  }) {
    _dio = Dio(...);
    _refreshDio = Dio(...);   // ← refresh · 재시도 전용 (AuthInterceptor 없음)
    _dio.interceptors.addAll([
      AuthInterceptor(
        tokenStorage: tokenStorage,
        dio: _refreshDio,     // ← 같은 _dio 로 재시도하면 self-deadlock (ADR-010 · ADR-011)
        onTokenRefresh: onTokenRefresh,
      ),
      ErrorInterceptor(),
      LoggingInterceptor(),
    ]);
    _refreshDio.interceptors.addAll([ErrorInterceptor(), LoggingInterceptor()]);
  }
}
```

`AuthInterceptor` 가 401 을 받으면 `onTokenRefresh()` 호출 → 콜백이 `ref.read(authServiceProvider).refreshToken()` 실행 → 이 시점엔 이미 `authServiceProvider` 가 초기화된 상태.

### 실행 순서

```
1. ProviderContainer 생성
2. 라우터나 ViewModel 이 ref.read(apiClientProvider)
   → apiClientProvider 팩토리 실행
   → onTokenRefresh 콜백은 아직 실행 안 됨 (just 참조)
   → ApiClient 생성 완료

3. 라우터가 ref.read(authServiceProvider)
   → authServiceProvider 팩토리 실행
   → ref.watch(apiClientProvider) → 이미 캐시된 ApiClient 사용
   → AuthService 생성 완료

4. 앱이 돌아가다가 401 수신
   → AuthInterceptor 가 onTokenRefresh() 호출
   → 콜백 실행: ref.read(authServiceProvider) → 이미 초기화된 AuthService 반환
   → refreshToken() 실행
```

순환이 없어요. 의존 그래프는 `apiClientProvider → tokenStorageProvider`, `authServiceProvider → apiClientProvider` → DAG.

### 설계 선택 포인트

**포인트 1 — `ref.watch` 대신 `ref.read` 사용**  
콜백 내부는 **`ref.read`** 여야 해요. `ref.watch` 는 watching 관계를 만들어 Provider 재생성 시점에 재실행됨 — 이 콜백은 **호출 시점의 최신 authService** 만 필요. `ref.read` 는 일회성 조회라 의존 그래프에 영향 없음.

**포인트 2 — 콜백 시그니처가 간단해야**  
`onTokenRefresh` 는 `Future<bool> Function()` 이에요. 결과가 `bool` (성공/실패) 만. 복잡한 파라미터 · 반환값이 들어가면 **콜백이 사실상 AuthService 의 mini 버전** 이 돼서 의미 없어짐.

**포인트 3 — `ApiClient` 는 `AuthService` 존재를 모름**  
`ApiClient` 의 단위 테스트에서 `AuthService` 를 mock 안 해도 됨. `onTokenRefresh: () async => true` 같은 단순 함수로 대체. 관심사 분리 완벽.

**포인트 4 — 실패 시 책임 분리**  
`onTokenRefresh()` 가 false 반환 또는 throw 시 `ApiClient` 는 원래 401 에러를 그대로 전파. **signOut 결정은 ViewModel 이 받는 에러를 보고 판단** — `ApiClient` 가 `AuthService.signOut()` 을 호출하지 않음. 콜백의 책임은 최소화.

## 이 선택이 가져온 것

### 긍정적 결과

- ApiClient 생성 시점에 AuthService 를 읽지 않아 생성 과정의 순환을 피할 수 있어요.
- ApiClient 테스트에 갱신 콜백을 직접 넣을 수 있어요.
- API 호출을 제공하는 ApiClient 는 하나로 유지하면서 내부에는 일반 요청용과 갱신·재시도용 Dio 를 나눠요.
- 현재 조립은 어느 Provider 를 먼저 읽어도 필요한 의존성을 생성할 수 있어요.
- AuthService 의 연결 방식이 바뀌면 조립부의 콜백과 관련 테스트를 확인해요.

### 부정적 결과

- 콜백을 통해 연결하는 이유와 호출 시점을 설명해야 해요.
- 콜백을 실행하는 시점의 Provider 수명과 예외는 런타임에 다뤄야 해요. 이는 Dart null safety 가 약해지는 문제와는 달라요.
- 오류를 추적할 때 ApiClient, 콜백, AuthService 의 호출 경로를 함께 봐야 해요.

## 교훈

<a id="교훈-1-순환-의존은-시점-분리-로-푸는-게-제일-깔끔"></a>
<a id="교훈-1--순환-의존은-시점-분리-로-푸는-게-제일-깔끔"></a>

### 교훈 1 — 생성 시점과 호출 시점의 의존성을 나눠요

AuthService 는 생성할 때 ApiClient 가 필요하지만, ApiClient 는 갱신이 필요한 시점에만 인증 기능을 호출해요. 이 차이를 콜백으로 표현해 생성 순환을 피했어요. 모든 순환 의존을 같은 방법으로 풀 수 있다는 일반 규칙은 아니에요.

<a id="교훈-2--riverpod-watch-vs-read-구분이-핵심"></a>

### 교훈 2 — Riverpod `watch` vs `read` 구분이 핵심

Provider 생성 중 `watch` 하는 의존성과, 나중에 실행하는 콜백 안에서 `read` 하는 조회는 시점과 구독 관계가 달라요. 현재 코드는 갱신 콜백 안에서 AuthService 를 읽어요. 단순히 watch 를 read 로 치환하면 모든 순환이 해결된다고 이해하지 않아요.

<a id="교훈-3--콜백-시그니처는-좁을수록-좋다"></a>

### 교훈 3 — 콜백 시그니처는 좁을수록 좋다

인터셉터가 필요한 것은 갱신 시도와 성공 여부예요. 그래서 `Future<bool> Function()` 으로 연결해요. 새로운 정보가 필요해지면 계약을 검토하되, 호출부가 쓰지 않는 서비스 내부 상태까지 전달하지 않아요.

## 관련 사례 (Prior Art)

- [Riverpod `watch` vs `read` 공식 문서](https://riverpod.dev/docs/concepts2/refs) — 본 ADR 의 기반 개념
- [Dart `late` keyword](https://dart.dev/null-safety/understanding-null-safety#late-variables) — 언어 레벨의 지연 초기화
- [Hollywood Principle ("Don't call us, we'll call you")](https://en.wikipedia.org/wiki/Inversion_of_control) — 콜백 주입의 추상 원리
- [Retrofit / OkHttp Authenticator 패턴](https://lysine.dev/okhttp/5.x/okhttp/okhttp3/-authenticator/) — 401 시 refresh 를 담당하는 authenticator 인터페이스. 본 ADR 의 `onTokenRefresh` 와 구조적 동치
- [Spring `@Lazy` annotation](https://docs.spring.io/spring-framework/reference/core/beans/dependencies/factory-collaborators.html#beans-factory-lazy-dependencies) — 순환 의존을 지연 주입으로 푸는 Spring 패턴

## Code References

**순환 해결 지점**
- [`lib/common/providers.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/common/providers.dart) — `apiClientProvider` 와 `authServiceProvider` 정의
- [`lib/kits/backend_api_kit/api_client.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/backend_api_kit/api_client.dart) — `onTokenRefresh` 생성자 파라미터
- [`lib/kits/backend_api_kit/interceptors/auth_interceptor.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/backend_api_kit/interceptors/auth_interceptor.dart) — 401 수신 시 `onTokenRefresh()` 호출

**AuthService 의 refresh 구현**
- [`lib/kits/auth_kit/auth_service.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/auth_kit/auth_service.dart) — `refreshToken()` 메서드

**관련 ADR**:
- [`ADR-005 · Riverpod + MVVM`](./adr-005-riverpod-mvvm.md) — 본 ADR 이 기반하는 Provider 시스템
- [`ADR-010 · QueuedInterceptor 로 401 자동 갱신`](./adr-010-queued-interceptor.md) — `onTokenRefresh` 가 실제로 호출되는 시점
- [`ADR-011 · 3층 인터셉터 체인`](./adr-011-interceptor-chain.md) — AuthInterceptor 가 다른 인터셉터와 협력하는 방식
