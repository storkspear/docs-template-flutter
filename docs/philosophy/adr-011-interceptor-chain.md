<a id="interceptor_chain"></a>

# Interceptor_Chain

**Status**: Accepted. 현재 유효. 2026-04-24 기준 `lib/kits/backend_api_kit/interceptors/` 하위 3개 파일 (`auth_interceptor.dart` · `error_interceptor.dart` · `logging_interceptor.dart`). `ApiClient` 생성자에서 이 순서로 설치.

> **2026-07-15 정정**: 초판은 Dio 의 onResponse / onError 체인을 "설치 역순" 으로 서술했지만, 실제 Dio (5.x) 는 **세 체인 모두 설치 순 (FIFO)** 으로 순회해요. "실행 순서" 절과 설계 선택 포인트 3 · 5 를 실코드 기준으로 다시 썼어요.

## 결론부터

일반 API 요청에는 인증·오류 변환·개발 환경 로깅 인터셉터를 연결해요. 갱신 전용 Dio에는 인증 인터셉터를 붙이지 않아요. `ErrorInterceptor`가 `ApiException`을 담은 Dio 오류를 만들면 `ApiClient`가 이를 꺼내 호출자에게 전달해요. 로깅 여부는 `AppConfig.isDev`로 결정해요.

## 왜 이런 고민이 시작됐나?

HTTP 레이어엔 공통으로 해야 할 일이 많아요.

1. 요청에 인증 토큰 첨부
2. 401 응답 시 자동 refresh
3. 서버 에러 응답을 앱 내부 `ApiException` 으로 변환
4. 네트워크 에러 (타임아웃 · 연결 끊김) 를 ApiException 으로 변환
5. 요청/응답 로깅
6. (미래) 분산 tracing 헤더 주입
7. (미래) rate limiting 클라이언트 측 백오프

이걸 다 한 인터셉터에 넣으면 500줄 괴물이 돼요. ViewModel · Service 코드에 직접 넣어도 중복 발생. 압력들이 부딪혀요.

**압력 A — 관심사 분리**  
각 책임을 별도 파일 · 클래스로. 새 관심사 추가 시 기존 코드 수정 없이 새 인터셉터만 추가.

**압력 B — 실행 순서의 의미**  
인터셉터 순서가 틀리면 기능이 깨져요. 예: Logging 이 Auth 보다 먼저면 Authorization 헤더가 **없는 상태** 로 로깅됨. Auth 가 에러 체인 맨 앞이 아니면 refresh 로 조용히 해결될 일시적 401 까지 먼저 변환 · 로깅을 거친 뒤에야 재시도가 일어나요.

**압력 C — 조건부 동작**  
Logging 은 dev 환경만. Production 에 log 남기면 성능 · 프라이버시 문제. 환경에 따라 로깅 수행 여부가 달라야 해요.

이 결정이 답해야 했던 물음이에요.

> **여러 HTTP 관심사를 어떻게 쪼개고, 어떤 순서로 실행하고, 어떻게 조건부 포함할 것인가?**

## 고민했던 대안들

<a id="option-1--단일-interceptor-대형-클래스"></a>

### Option 1 — 단일 Interceptor 대형 클래스

`HttpInterceptor.onRequest()` 가 토큰 첨부 + 로깅 + tracing 을 한 번에 처리.

- **장점**: 분기 없음. 한 파일.
- **단점 1**: 500 줄 이상. 수정 시 모든 관심사가 영향.
- **단점 2**: 단위 테스트 시 "Auth 만 테스트" 가 불가. 매번 전체 flow.
- **단점 3**: `if (isDebug) log(...)` 분기가 여기저기. Debug/Release 분리 안 됨.
- **탈락 이유**: 압력 A 정면 위반.

<a id="option-2--인터셉터-체인--aop-수준-추상화"></a>

### Option 2 — 인터셉터 체인 + AOP 수준 추상화

Spring AOP 처럼 `@Around` · `@Before` 어노테이션으로 선언.

- **장점**: 선언적.
- **단점 1**: Dart 엔 AOP 표준 없음 (Annotation 은 있지만 런타임 reflection 약함).
- **단점 2**: 코드 생성 + reflection 의 cold start 비용.
- **단점 3**: Dio 의 기본 interceptor API 와 호환 안 됨 → 자체 프레임워크 구축 필요.
- **탈락 이유**: 엔터프라이즈 JVM 관용을 Flutter 에 끌어옴. 과잉.

<a id="option-3--dio-의-interceptorswrapper--3개-클래스--채택"></a>

### Option 3 — Dio 의 InterceptorsWrapper + 3개 클래스 ★ (채택)

Dio 가 제공하는 `Interceptor` 인터페이스를 3개 구현. `ApiClient` 가 배열로 설치.

- **압력 A 만족**: 3개 파일, 각자 단일 책임.
- **압력 B 만족**: `_dio.interceptors.addAll([auth, error, logging])` 로 순서가 코드에 명시.
- **압력 C 만족**: LoggingInterceptor 내부의 `AppConfig.instance.isDev` 분기로 dev 환경만 로깅 (설계 선택 포인트 2).

## 결정

### ApiClient 에서의 조립

```dart
// lib/kits/backend_api_kit/api_client.dart 발췌
class ApiClient {
  late final Dio _dio;
  late final Dio _refreshDio;

  ApiClient({
    required TokenStorage tokenStorage,
    required Future<bool> Function() onTokenRefresh,
    Duration connectTimeout = const Duration(seconds: 10),
    Duration receiveTimeout = const Duration(seconds: 30),
  }) {
    _dio = Dio(_baseOptions(connectTimeout, receiveTimeout));
    // refresh · 재시도 전용 Dio — AuthInterceptor 없이 구성 (재진입 데드락 회피)
    _refreshDio = Dio(_baseOptions(connectTimeout, receiveTimeout));

    _dio.interceptors.addAll([
      AuthInterceptor(
        tokenStorage: tokenStorage,
        dio: _refreshDio,        // ← 재시도는 반드시 _refreshDio 로
        onTokenRefresh: onTokenRefresh,
      ),
      ErrorInterceptor(),
      LoggingInterceptor(),  // ← 내부에서 AppConfig.instance.isDev 분기
    ]);
    // refresh Dio 는 error 매핑 · 로깅만 — auth 인터셉터 없음
    _refreshDio.interceptors.addAll([ErrorInterceptor(), LoggingInterceptor()]);
  }
}
```

**`dio: _refreshDio` 를 `dio: _dio` 로 바꾸면 안 돼요.** `AuthInterceptor` 는 `QueuedInterceptor` 라, 재시도를 같은 `_dio` 로 보내면 그 재시도가 실패했을 때 에러가 진행 중인 `onError` 뒤 `_errorQueue` 에 큐잉돼요. 서로를 기다리며 요청이 영영 끝나지 않는 self-deadlock 이에요. 그래서 refresh 전용 Dio 는 **Error · Logging 2개만** 달고, AuthInterceptor 는 빼요. 자세한 건 [`ADR-010`](./adr-010-queued-interceptor.md) 참조.

### 3개 인터셉터의 역할

<a id="1-authinterceptor--토큰-관리-adr-010-상세"></a>

#### 1. AuthInterceptor — 토큰 관리 (ADR-010 상세)

```dart
// lib/kits/backend_api_kit/interceptors/auth_interceptor.dart 개요
class AuthInterceptor extends QueuedInterceptor {
  @override
  void onRequest(options, handler) async {
    if (options.extra['skipAuth'] == true) return handler.next(options);
    final token = await _tokenStorage.getAccessToken();
    if (token != null) options.headers['Authorization'] = 'Bearer $token';
    handler.next(options);
  }

  @override
  void onError(err, handler) async {
    // 401 감지 + refresh + retry (ADR-010 참조)
  }
}
```

**책임**: Authorization 헤더 첨부 · 401 자동 처리.  
**관심 없는 것**: 에러 변환 · 로깅.

<a id="2-errorinterceptor--dioexception--apiexception-변환"></a>

#### 2. ErrorInterceptor — DioException → ApiException 변환

```dart
// lib/kits/backend_api_kit/interceptors/error_interceptor.dart 전체
class ErrorInterceptor extends Interceptor {
  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    final exception = _mapToApiException(err);
    handler.next(
      DioException(
        requestOptions: err.requestOptions,
        response: err.response,
        type: err.type,
        error: exception,  // ← ApiException 을 error 필드에 담아 전파
        stackTrace: err.stackTrace,
        message: err.message,
      ),
    );
  }

  ApiException _mapToApiException(DioException err) {
    // 서버가 {data, error} 포맷으로 응답
    final data = err.response?.data;
    if (data is Map<String, dynamic> && data['error'] != null) {
      return ApiException.fromApiError(
        ApiError.fromJson(data['error']),
        statusCode: err.response?.statusCode,
      );
    }

    // 네트워크 에러
    switch (err.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return ApiException.timeout();
      case DioExceptionType.connectionError:
        return ApiException.network();
      default:
        if (err.error is SocketException) return ApiException.network();
        return ApiException.unknown(err.message);
    }
  }
}
```

**책임**: `DioException` 을 `ApiException` 으로 변환 (ADR-009 의 계약). 서버 ApiError 포맷 파싱, 네트워크 에러 유형별 매핑.  
**관심 없는 것**: 재시도 · 토큰 · 로깅.

<a id="3-logginginterceptor--debug-빌드-로깅"></a>

#### 3. LoggingInterceptor — debug 빌드 로깅

```dart
// lib/kits/backend_api_kit/interceptors/logging_interceptor.dart 개요
class LoggingInterceptor extends Interceptor {
  @override
  void onRequest(options, handler) {
    if (AppConfig.instance.isDev) {
      dev.log('→ ${options.method} ${options.path}', name: 'HTTP');
    }
    handler.next(options);
  }

  @override
  void onResponse(response, handler) {
    if (AppConfig.instance.isDev) {
      dev.log('← ${response.statusCode} ${response.requestOptions.path}', name: 'HTTP');
    }
    handler.next(response);
  }

  @override
  void onError(err, handler) {
    if (AppConfig.instance.isDev) {
      dev.log('✗ ${err.response?.statusCode ?? 'N/A'} ${err.requestOptions.path}', name: 'HTTP', level: 900);
    }
    handler.next(err);
  }
}
```

**책임**: dev 환경에서만 콘솔 로그 출력. 쿼리스트링에 민감 정보가 담길 수 있어 `uri` 대신 **`path` 만** 로깅하고, Authorization 헤더도 찍지 않아요.  
**관심 없는 것**: 수정 · 재시도.

### 실행 순서

Dio 는 **onRequest · onResponse · onError 세 체인 모두 설치 순 (FIFO)** 으로 순회해요. OkHttp · Axios 처럼 "응답은 역순" 이 아니에요 — Dio 소스 (`dio_mixin.dart`) 가 세 체인 모두 같은 `for (final interceptor in interceptors)` 루프로 future 를 이어 붙여요.

**onRequest 체인** (요청 송신 전):
```
요청 생성
  ↓ AuthInterceptor.onRequest  → 토큰 헤더 첨부
  ↓ ErrorInterceptor.onRequest  → (no-op)
  ↓ LoggingInterceptor.onRequest → dev 환경이면 로그 출력
  ↓ 실제 네트워크 전송
```

**onResponse 체인** (정상 응답 수신 후, 역시 설치 순):
```
응답 수신
  ↓ AuthInterceptor.onResponse  → (no-op)
  ↓ ErrorInterceptor.onResponse  → (no-op, 에러 아님)
  ↓ LoggingInterceptor.onResponse → dev 환경이면 로그 출력
  ↓ 호출자 ViewModel
```

**onError 체인** (에러 응답 시, 역시 설치 순):
```
에러 응답 (예: 401)
  ↓ AuthInterceptor.onError → 401 이면 refresh + retry.
  |                           성공하면 여기서 resolve — 아래로 에러가 안 내려감
  ↓ ErrorInterceptor.onError → DioException → ApiException 변환 (error 필드에 담음)
  ↓ LoggingInterceptor.onError → dev 환경이면 에러 로그
  ↓ 호출자 (ApiClient 가 DioException.error 의 ApiException 을 꺼내 throw)
```

Auth 가 체인 맨 앞이라, refresh 로 해결되는 401 은 변환 · 로깅 단계에 도달하기 전에 정상 응답으로 바뀌어요. refresh 실패로 전파된 에러만 ErrorInterceptor 에서 `ApiException` 으로 변환돼 ViewModel 까지 내려가요.

> 실행 순서 세부는 Dio 문서 ([Interceptors](https://pub.dev/documentation/dio/latest/dio/Interceptor-class.html)) 참조.

### 설계 선택 포인트

**포인트 1 — 3개로 제한**  
4개 이상은 각 인터셉터의 책임이 모호해지는 경향. 현재 3개가 "최소 필요 + 명확한 역할". 새 관심사 (tracing · rate limiting) 가 생기면 추가.

**포인트 2 — LoggingInterceptor 는 항상 설치 + 내부에서 환경 분기**  
설치는 무조건 하고, 인터셉터 내부에서 `AppConfig.instance.isDev` 가 true 일 때만 실제 콘솔 로깅을 수행해요. dev · staging · prod 3환경을 구분하기 위해 `kDebugMode` (debug/release 이분법) 대신 환경 변수 기반 분기를 택했어요. release 빌드에서도 LoggingInterceptor 인스턴스는 존재하지만 onRequest/onResponse/onError 모두 if 가드로 빠르게 통과 (실측 <1ms). release tree-shaking 까지 추구하려면 `if (AppConfig.instance.isDev) interceptors.add(LoggingInterceptor())` 로 설치 자체를 분기해도 무방하나, 본 템플릿은 환경 세분화 유연성을 우선했어요.

**포인트 3 — Error 변환은 `handler.next` 에 ApiException 담기**  
`ErrorInterceptor.onError` 가 완전히 새 타입을 던질 수도 있지만, Dio 의 `DioException.error` 필드에 `ApiException` 을 담아 전파. 이유: 체인 타입 (`DioException`) 을 유지해야 다음 인터셉터 (Logging) 가 표준대로 동작하고, 호출자 (`ApiClient`) 는 `e.error is ApiException` 으로 꺼내 throw 할 수 있어요. Auth 의 401 감지는 에러 체인에서 Error 보다 **앞** (설치 순) 이라 이 변환의 영향을 받지 않아요.

**포인트 4 — 인터셉터 간 직접 참조 금지**  
`AuthInterceptor` 가 `ErrorInterceptor` 를 import 하지 않음. 각자 Dio API 표준만 사용. 이렇게 해야 순서 변경 · 교체 가 자유로움.

**포인트 5 — onError 체인에서도 Auth 가 맨 앞**  
Dio 의 onError 체인은 설치 순이라 `Auth → Error → Logging`. Auth 가 raw `DioException` 의 401 을 가장 먼저 보고 refresh + retry 를 수행하고, 성공하면 `handler.resolve` 로 체인을 끝내요. Error 의 `ApiException` 변환은 **refresh 로 해결 못 한 에러에만** 적용돼요. "토큰 첨부는 요청 체인의 맨 앞 + 401 처리는 에러 체인의 맨 앞" 이라는 요구를 설치 순서 하나 (Auth 를 첫 번째로) 로 동시에 만족해요.

## 이 선택이 가져온 것

### 긍정적 결과

인증, 오류 변환, 로깅 책임을 나누어 각각 테스트할 수 있어요. 설치 순서는 ApiClient 에서 확인해요. 새 인터셉터를 추가할 때는 기존 순서와 오류 전달 방식을 함께 검증해야 해요. 모든 예외가 자동으로 ApiException 으로 바뀐다고 일반화하지 않아요.

### 부정적 결과

Dio 의 handler 호출과 설치 순서를 이해해야 해요. ErrorInterceptor 는 ApiException 을 DioException.error 에 넣고 ApiClient 가 이를 꺼내므로 두 코드의 계약을 함께 유지해야 해요. 로그 형식과 여러 인터셉터를 조립한 테스트도 별도로 확인해야 해요.

## 교훈

<a id="교훈-1-순서가-의미인-체인은-명시적-파일-상수-로"></a>
<a id="교훈-1--순서가-의미인-체인은-명시적-파일-상수-로"></a>

### 교훈 1 — 설치 순서를 조립 코드에 드러내요

현재 ApiClient 의 조립 코드에 설치 순서를 직접 드러내요. 순서가 동작을 바꾸므로 기능을 추가할 때 배열과 관련 테스트를 함께 확인해요.

<a id="교훈-2--환경-기반-분기--설치-분기-vs-내부-분기-모두-합리적"></a>

### 교훈 2 — 환경 기반 분기 — 설치 분기 vs 내부 분기 모두 합리적

LoggingInterceptor 는 설치된 뒤 `AppConfig.instance.isDev` 를 확인해요. 현재 조건에서는 dev 만 로그를 내고 staging·prod 는 건너뛰어요. 이는 kDebugMode 로 설치 여부를 나누는 방식과 다르며, release 빌드 여부 하나로 동작을 설명하지 않아요.

<a id="교훈-3-dioexception-의-error-필드-활용이-정석"></a>
<a id="교훈-3--dioexception-의-error-필드-활용이-정석"></a>

### 교훈 3 — 인터셉터와 ApiClient의 오류 계약을 맞춰요

ErrorInterceptor 는 Dio 의 체인에서 기대하는 DioException 을 유지하고 `error` 에 ApiException 을 담아요. ApiClient 가 이를 꺼내므로 화면의 호출부는 정해진 오류 계약을 사용할 수 있어요. 예외를 새 방식으로 전달할 때는 다음 인터셉터와 언랩 코드도 함께 확인해요.

## 관련 사례 (Prior Art)

- [Dio Interceptors 공식 문서](https://pub.dev/documentation/dio/latest/dio/Interceptor-class.html)
- [OkHttp Interceptor 체인](https://lysine.dev/okhttp/features/interceptors/) — Kotlin/Java 의 동일 패턴
- [Axios Interceptors](https://axios-http.com/docs/interceptors) — JavaScript 의 동일 개념
- [Node.js Express middleware chain](https://expressjs.com/en/guide/using-middleware.html) — 서버 측 미들웨어 체인 원리
- [Spring WebClient ExchangeFilterFunction](https://docs.spring.io/spring-framework/reference/web/webflux-webclient/client-filter.html) — JVM 쪽의 동일 개념

## Code References

**3개 인터셉터 구현**
- [`lib/kits/backend_api_kit/interceptors/auth_interceptor.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/backend_api_kit/interceptors/auth_interceptor.dart) — 89줄
- [`lib/kits/backend_api_kit/interceptors/error_interceptor.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/backend_api_kit/interceptors/error_interceptor.dart) — 49줄
- [`lib/kits/backend_api_kit/interceptors/logging_interceptor.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/backend_api_kit/interceptors/logging_interceptor.dart) — 44줄

**조립 지점**
- [`lib/kits/backend_api_kit/api_client.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/backend_api_kit/api_client.dart) — `_dio.interceptors.addAll([...])`

**연결되는 에러 타입**
- [`lib/kits/backend_api_kit/api_exception.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/backend_api_kit/api_exception.dart) — ErrorInterceptor 의 변환 대상

**테스트**
- [`test/kits/backend_api_kit/interceptors/`](https://github.com/storkspear/template-flutter/tree/main/test/kits/backend_api_kit/interceptors) — 각 인터셉터 단위 테스트

**관련 ADR**:
- [`ADR-009 · 백엔드 응답 1:1 계약`](./adr-009-backend-contract.md) — ErrorInterceptor 가 변환하는 `ApiException` 구조
- [`ADR-010 · QueuedInterceptor 로 401 자동 갱신`](./adr-010-queued-interceptor.md) — AuthInterceptor 의 상세 동작
- [`ADR-019 · 솔로 친화적 운영`](./adr-019-solo-friendly.md) — 파일 당 <100줄 원칙의 근거
