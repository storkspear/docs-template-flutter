<a id="queued_interceptor"></a>

# Queued_Interceptor

**Status**: Accepted. 2026-04-24 작성 / 2026-10-27 회전 감지 반영. 현재 `AuthInterceptor` 는 오류 큐, 토큰 회전 감지, 인증 인터셉터가 없는 별도 Dio 를 조합해 갱신과 재시도를 처리해요.

## 결론부터

인증이 필요한 요청이 401을 받으면 토큰 갱신을 시도해요. 오류 처리를 순서대로 진행하고, 앞선 요청이 이미 access token을 바꿨다면 그 토큰으로 재시도해 중복 갱신을 줄여요. 갱신이 실패해 토큰이 그대로면 뒤의 요청도 갱신을 시도할 수 있어요. 서버의 갱신 거절이 확인될 때만 인증 서비스가 세션을 정리해요.

## 왜 이런 고민이 시작됐나?

access token 이 만료되면 refresh token 으로 갱신한 뒤 원래 요청을 다시 보낼 수 있어요. 이 흐름을 각 ViewModel 에 넣으면 같은 인증 처리가 반복돼요. 아래는 중복이 생기는 상황을 보여주는 개념 예제예요.

```dart
// 화면마다 인증 갱신을 처리하면 생기는 중복 예시
Future<User> getUser() async {
  try {
    return await api.get('/users/me');
  } catch (e) {
    if (e is ApiException && e.isAccessTokenExpired) {  // CMN_007
      await authService.refreshToken();
      return await api.get('/users/me');  // 재시도
    }
    rethrow;
  }
}
```

공통 처리로 옮길 때 다음 조건을 함께 고려했어요.

**압력 A — ViewModel 단순성**  
ViewModel 은 화면 상태와 앱의 동작에 집중하고, 토큰 첨부·갱신·재시도는 공통 네트워크 계층에서 처리해요.

**압력 B — 동시 요청 경합**  
여러 요청이 같은 만료 토큰으로 401 을 받으면 갱신이 중복될 수 있어요. 먼저 갱신이 성공해 토큰이 바뀌었다면, 기다리던 요청은 그 토큰을 사용해요. 갱신이 실패해 토큰이 그대로라면 뒤 요청도 갱신을 시도할 수 있어요.

**압력 C — 무한루프 방지**  
갱신 요청 자체의 401 을 다시 갱신하려 하면 반복될 수 있어요. 또한 같은 오류 큐로 재진입하면 현재 요청과 재시도가 서로 기다릴 수 있어요. 반복 갱신과 큐 재진입을 각각 막아야 해요.

**압력 D — refresh 실패 시 책임 분리**  
서버가 갱신 토큰을 거절한 경우와 일시적인 네트워크 실패를 구분해야 해요. AuthService 가 거절을 확인했을 때 세션을 정리하고, 인터셉터는 요청 결과를 전달해요.

이 결정이 답해야 했던 물음이에요.

> **401 자동 refresh + 동시 요청 큐잉 + 무한루프 방지 + 실패 시 책임 위임** 을 한 인터셉터에 어떻게 담는가?

## 고민했던 대안들

<a id="option-1--interceptor-일반--수동-동기화"></a>

### Option 1 — Interceptor (일반) + 수동 동기화

Dio 의 일반 `Interceptor` 에 별도 동기화 상태를 두는 방법이에요.

- 원하는 단위로 동시 실행을 제어할 수 있어요.
- `onError` 안에서 `await` 하는 것만으로 다른 콜백의 실행까지 순서대로 만들지는 못해요.
- 락의 해제와 예외 전파를 직접 관리해야 하므로, 현재 구현은 Dio 가 제공하는 오류 큐를 사용해요.

<a id="option-2--응답-캐싱--pre-check"></a>

### Option 2 — 응답 캐싱 + pre-check

JWT 의 `exp` 를 확인하고 만료 전에 갱신하는 방법이에요.

- 만료된 토큰으로 보내는 요청을 줄일 수 있어요.
- 클라이언트와 서버의 시계 차이를 고려해야 하고, 서버가 토큰을 거절하는 경우도 따로 처리해야 해요.
- 선제 갱신만으로 401 처리를 대신할 수 없으므로 이 인터셉터는 응답을 받은 뒤 처리하는 방식으로 구성했어요.

<a id="option-3--queuedinterceptor--무한루프-방어--책임-위임--채택"></a>

### Option 3 — QueuedInterceptor + 무한루프 방어 + 책임 위임 ★ (채택)

`QueuedInterceptor` 로 오류 처리를 순서대로 진행하고 다음 장치를 함께 사용해요.

- 요청에 사용한 토큰과 저장된 토큰을 비교해, 앞선 갱신이 성공했다면 중복 갱신을 생략해요.
- `skipAuth` 요청과 갱신 엔드포인트 자체의 401 은 갱신 대상에서 제외해요.
- 갱신과 재시도는 AuthInterceptor 가 없는 별도 Dio 로 보내요.
- 갱신 실패에는 원래 401 을, 재시도 실패에는 재시도에서 받은 오류를 전달해요. 세션 정리는 AuthService 가 판단해요.

## 결정

### AuthInterceptor 전체 구조

```dart
// lib/kits/backend_api_kit/interceptors/auth_interceptor.dart 발췌
class AuthInterceptor extends QueuedInterceptor {
  final TokenStorage _tokenStorage;
  final Dio _dio;                                   // 재시도 전용 (AuthInterceptor 없음)
  final Future<bool> Function() _onTokenRefresh;

  static const _skipAuthKey = 'skipAuth';
  static const _bearerPrefix = 'Bearer ';
  static String _bearer(String accessToken) => '$_bearerPrefix$accessToken';

  @override
  Future<void> onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    // 1. skipAuth 플래그: 로그인 · 가입 · 비번 찾기에 쓰임
    if (options.extra[_skipAuthKey] == true) return handler.next(options);
    // 2. 토큰 자동 첨부
    final accessToken = await _tokenStorage.getAccessToken();
    if (accessToken != null) {
      options.headers[HttpHeaders.authorizationHeader] = _bearer(accessToken);
    }
    handler.next(options);
  }

  @override
  Future<void> onError(DioException err, ErrorInterceptorHandler handler) async {
    // 3. skipAuth / 401 아님 → 그대로 전달
    if (err.requestOptions.extra[_skipAuthKey] == true ||
        err.response?.statusCode != HttpStatus.unauthorized) {
      return handler.next(err);
    }
    final options = err.requestOptions;

    // 4. 무한루프 방지: refresh 엔드포인트 자체 401
    if (options.path.endsWith(ApiEndpoints.authRefreshPath)) return handler.next(err);

    // 5. 회전 감지 — 이 요청이 나간 뒤 다른 401 이 이미 refresh 를 끝냈으면
    //    저장된 토큰이 요청 때 토큰과 다르다. 그러면 refresh 를 또 부르지 않는다.
    final sentAuthorization = options.headers[HttpHeaders.authorizationHeader];
    var accessToken = await _tokenStorage.getAccessToken();
    final alreadyRotated = accessToken != null &&
        sentAuthorization is String &&
        sentAuthorization != _bearer(accessToken);

    if (!alreadyRotated) {
      final bool success;
      try {
        success = await _onTokenRefresh();
      } catch (_) {
        // 6. refresh 자체가 예외면 원래 401을 전달해요. 세션 정리는 AuthService가 판단해요.
        return handler.next(err);
      }
      // 7. refresh 가 false, 또는 성공인데 토큰이 없음 → 원 401 전파
      if (!success) return handler.next(err);
      accessToken = await _tokenStorage.getAccessToken();
      if (accessToken == null) return handler.next(err);
    }

    options.headers[HttpHeaders.authorizationHeader] = _bearer(accessToken);

    // 8. 재시도 — AuthInterceptor 가 없는 refresh 전용 Dio(_dio)로 실행.
    //    refresh 뒤의 실패는 인증 만료가 아니므로, 원 401 이 아니라
    //    재시도에서 실제 발생한 에러를 그대로 전파 (stale 401 오판 방지).
    try {
      final response = await _dio.fetch(options);
      handler.resolve(response);
    } on DioException catch (retryErr) {
      handler.next(retryErr);
    }
  }
}
```

<a id="queuedinterceptor-의-동시성-보장--큐--회전-감지"></a>

### QueuedInterceptor 의 동시성 보장 — 큐 + 회전 감지

`QueuedInterceptor` 는 같은 종류의 콜백을 순서대로 처리해요. 한 `onError` 가 갱신을 기다리는 동안 뒤의 `onError` 는 대기해요. 요청·응답·오류 큐가 모두 하나인 것은 아니며, 갱신 중 모든 네트워크 요청이 중단되는 것도 아니에요.

큐는 처리 순서만 정해요. 각 요청이 차례대로 갱신을 호출하면 이미 바뀐 토큰으로 다시 갱신할 수 있으므로, 요청 당시 `Authorization` 과 현재 저장된 access token 을 비교해요. 값이 다르면 새 토큰으로 재시도하고, 같으면 갱신을 시도해요. 새 토큰으로 나간 별도 요청이 다시 401 을 받는 경우에는 새로운 갱신이 가능해요. 반면 인터셉터 내부의 재시도는 별도 Dio 를 사용하므로, 그 결과가 다시 401 이어도 갱신을 반복하지 않아요.

### skipAuth 플래그 사용

로그인·가입·비밀번호 찾기처럼 기존 인증 토큰 없이 보내는 요청에는 `skipAuth` 를 사용해요. `AuthInterceptor` 는 이 플래그가 있으면 토큰 첨부와 401 갱신을 건너뛰어요. 예를 들어 `ApiClient.postRaw` 는 내부에서 이 값을 설정해요.

```dart
// ApiClient 사용 예
await api.postRaw(
  ApiEndpoints.emailSignIn,  // '/api/apps/{slug}/auth/email/signin'
  data: {'email': email, 'password': password},
);  // skipAuth: true 내부적으로 설정
```

### onTokenRefresh 콜백 (ADR-007 연결)

갱신 기능은 `Future<bool> Function()` 콜백으로 받아요. ApiClient 가 AuthService 타입에 직접 의존하지 않도록 `common/providers.dart` 에서 연결해요. 자세한 이유는 [ADR-007](./adr-007-late-binding.md) 에서 설명해요.

```dart
// lib/common/providers.dart 발췌
final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient(
    tokenStorage: ref.watch(tokenStorageProvider),
    onTokenRefresh: () => ref.read(authServiceProvider).refreshToken(),  // ← 콜백
  );
});
```

### 설계 선택 포인트

**포인트 1 — `QueuedInterceptor` 는 void-async 문제 해결 + 동시성 해결**  
일반 인터셉터 콜백 안의 `await` 는 그 함수 내부의 실행 순서를 정할 뿐이에요. 서로 다른 콜백 호출을 순서대로 처리하려면 추가 장치가 필요해요. QueuedInterceptor 가 오류 큐를 담당하고, 성공한 갱신의 중복 생략은 토큰 비교가 담당해요.

**포인트 2 — 무한루프 방지는 path 체크 + refresh 전용 Dio**  
`ApiClient.postRefresh` 는 AuthInterceptor 가 없는 `_refreshDio` 를 사용해요. 원 요청의 재시도도 같은 별도 Dio 로 보내므로 현재 오류 큐에 다시 들어오지 않아요. `endsWith(ApiEndpoints.authRefreshPath)` 조건은 갱신 경로가 인터셉터에 들어왔을 때 다시 갱신하지 않도록 남겨 둔 방어예요.

**포인트 3 — refresh 실패는 "원 401 전파", signOut 은 위임**  
갱신이 false 를 반환하거나 예외를 던지면 인터셉터는 원래 오류를 전달해요. ErrorInterceptor 가 이를 ApiException 으로 바꾸므로 ViewModel 에 CMN_004·CMN_007 같은 401 코드가 도달할 수 있어요. 세션을 지울지는 갱신 요청 결과를 아는 AuthService 가 판단해요.

**포인트 4 — `skipAuth` 는 Dio `RequestOptions.extra` 활용**  
요청의 `extra` 에 인증 처리 여부를 기록해요. 플래그 이름은 `_skipAuthKey` 상수로 모아 같은 이름을 사용해요.

**포인트 5 — `_dio.fetch(options)` 로 재시도**  
기존 RequestOptions 의 Authorization 을 바꾸고 `fetch(options)` 로 다시 보내요. 기존 헤더·본문·타임아웃 설정을 재사용하지만, 이미 소비된 스트림처럼 그대로 재전송할 수 없는 본문은 별도 검토가 필요해요.

## 이 선택이 가져온 것

### 긍정적 결과

- ViewModel 에서 반복하던 토큰 첨부·갱신 코드를 공통 계층으로 모아요.
- 같은 이전 토큰으로 실패한 요청은 앞선 갱신이 성공한 뒤 새 토큰을 재사용해요.
- 갱신·재시도를 별도 Dio 로 보내 오류 큐 재진입을 피하고, 갱신 경로 제외 조건도 유지해요.
- AuthService 가 서버의 토큰 거절을 확인했을 때 세션을 정리해요. 네트워크·타임아웃·5xx 실패에는 토큰을 보존해요.
- 콜백과 토큰 저장소를 대체해 갱신 성공·실패, 동시 요청, 재시도 오류를 테스트할 수 있어요.

### 부정적 결과

- 원 요청, 갱신, 재시도를 구분해 로그와 오류를 읽어야 해요.
- 갱신 대기 시간까지 포함하면 사용자가 기다리는 시간이 길어질 수 있어요. 전체 소요 시간을 개별 Dio 타임아웃 하나로 설명할 수는 없어요.
- 재시도에서 받은 401·500·네트워크 오류는 그대로 호출자에게 전달돼요. 화면은 갱신 성공 여부와 별개로 이 실패를 처리해야 해요.
- 오류 큐의 순차 처리와 토큰 조회에는 비용이 있어요. 지연이 문제라면 실제 앱의 요청 패턴으로 측정해요.

## 교훈

<a id="교훈-1--void-async-는-함정"></a>

### 교훈 1 — "void async" 는 함정

함수 안의 `await` 와 서로 다른 콜백 사이의 순서 보장은 달라요. `void` 콜백 안에서 비동기 작업을 하더라도, 호출하는 프레임워크가 그 Future 를 기다리는지 확인해야 해요.

이 구현은 Dio 의 오류 큐로 콜백 순서를 정하고, 토큰 비교로 중복 갱신을 줄여요. 두 장치를 구분해 이해해야 큐를 도입한 것만으로 모든 중복이 해결됐다고 오해하지 않아요.

<a id="교훈-2--인터셉터가-signout-하면-안-된다"></a>

### 교훈 2 — "인터셉터가 signOut 하면 안 된다"

현재 인터셉터는 세션을 직접 지우지 않아요. AuthService 는 갱신 토큰이 거절된 경우에만 로컬 세션을 정리하고, 일시적인 장애라면 토큰을 보존해요.

요청 재시도와 인증 상태 변경은 연결되어 있지만 같은 책임은 아니에요. 각 계층이 실제로 확인할 수 있는 정보에 맞춰 판단을 나눠요.

<a id="교훈-3--무한루프-는-단순한-조건으로-막자"></a>

### 교훈 3 — "무한루프" 는 단순한 조건으로 막자

현재 구현은 서로 다른 실패 경로에 각각 대응해요. 별도 Dio 는 오류 큐 재진입을 피하고, 갱신 경로 제외 조건은 갱신 요청의 반복 처리를 막아요. 토큰 회전 감지는 이미 성공한 갱신을 기다리던 요청이 다시 수행하지 않게 해요.

path 조건 하나가 대부분의 문제를 해결한다고 일반화하지 않아요. 방어 조건을 바꿀 때는 동시 요청, 갱신 실패, 재시도 실패 테스트를 함께 확인해요.

## 관련 사례 (Prior Art)

- [Dio `QueuedInterceptor` 공식 문서](https://pub.dev/documentation/dio/latest/dio/QueuedInterceptor-class.html)
- [OkHttp Authenticator](https://lysine.dev/okhttp/5.x/okhttp/okhttp3/-authenticator/) — Kotlin/Java 의 동일 패턴
- [OkHttp 인증 처리 예제](https://lysine.dev/okhttp/recipes/) — 공식 문서의 인증 응답 처리 예제
- [RFC 7519 JWT](https://datatracker.ietf.org/doc/html/rfc7519) — exp 클레임 정의
- [`template-spring ADR-006 · HS256 JWT`](https://github.com/storkspear/template-spring/blob/main/docs/philosophy/adr-006-hs256-jwt.md) — 짝이 되는 백엔드의 JWT 발급 / 검증 원리

## Code References

**인터셉터 구현**
- [`lib/kits/backend_api_kit/interceptors/auth_interceptor.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/backend_api_kit/interceptors/auth_interceptor.dart) — 오류 큐 · 회전 감지 · 별도 Dio 재시도

**콜백 주입**
- [`lib/common/providers.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/common/providers.dart) — `onTokenRefresh: () => ref.read(authServiceProvider).refreshToken()`
- [`lib/kits/auth_kit/auth_service.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/auth_kit/auth_service.dart) — `refreshToken()` 실제 구현

**ApiClient 조립**
- [`lib/kits/backend_api_kit/api_client.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/backend_api_kit/api_client.dart) — 3개 인터셉터 설치
- [`lib/kits/backend_api_kit/backend_api_kit.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/backend_api_kit/backend_api_kit.dart)

**테스트**
- [`test/kits/backend_api_kit/interceptors/auth_interceptor_test.dart`](https://github.com/storkspear/template-flutter/blob/main/test/kits/backend_api_kit/interceptors/auth_interceptor_test.dart) — 동시 401 → refresh 1회 · 새 토큰의 401 은 재 refresh · 무한루프 · refresh 실패 시나리오

**관련 ADR**:
- [`ADR-007 · Late Binding 으로 순환 의존 해결`](./adr-007-late-binding.md) — `onTokenRefresh` 콜백 주입의 이유
- [`ADR-009 · 백엔드 응답 1:1 계약`](./adr-009-backend-contract.md) — `ApiException.code` 가 `CMN_007` / `CMN_004` 인 이유
- [`ADR-011 · 3층 인터셉터 체인`](./adr-011-interceptor-chain.md) — Auth → Error → Logging 실행 순서
- [`ADR-013 · 토큰 저장 원자성`](./adr-013-token-atomic-storage.md) — refresh 결과를 원자적으로 저장
