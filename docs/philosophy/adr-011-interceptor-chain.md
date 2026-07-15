# Interceptor_Chain

**Status**: Accepted. 현재 유효. 2026-04-24 기준 `lib/kits/backend_api_kit/interceptors/` 하위 3개 파일 (`auth_interceptor.dart` · `error_interceptor.dart` · `logging_interceptor.dart`). `ApiClient` 생성자에서 이 순서로 설치.

> **2026-07-15 정정**: 초판은 Dio 의 onResponse / onError 체인을 "설치 역순" 으로 서술했지만, 실제 Dio (5.x) 는 **세 체인 모두 설치 순 (FIFO)** 으로 순회해요. "실행 순서" 절과 설계 선택 포인트 3 · 5 를 실코드 기준으로 다시 썼어요.

## 결론부터

메인 Dio 의 모든 HTTP 요청은 **AuthInterceptor → ErrorInterceptor → LoggingInterceptor** 의 3개 인터셉터를 거쳐요 (토큰 refresh 전용 `_refreshDio` 는 재진입 데드락을 피하려고 AuthInterceptor 없이 Error · Logging 2개만 — ADR-010). 각 인터셉터는 하나의 관심사만 담당:
- **Auth**: 토큰 첨부 + 401 자동 refresh (ADR-010)
- **Error**: `DioException` → `ApiException` 변환 (ADR-009 계약 기반)
- **Logging**: 요청/응답 콘솔 출력 (dev 환경만 — 런타임 `isDev` 분기)

순서가 고정돼 있고, 각 인터셉터는 **자기 관심사 외에는 개입하지 않음**. 추가 관심사 (예: tracing · rate limiting) 는 새 인터셉터로 넣되 이 3개의 순서는 불변.

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

### Option 1 — 단일 Interceptor 대형 클래스

`HttpInterceptor.onRequest()` 가 토큰 첨부 + 로깅 + tracing 을 한 번에 처리.

- **장점**: 분기 없음. 한 파일.
- **단점 1**: 500 줄 이상. 수정 시 모든 관심사가 영향.
- **단점 2**: 단위 테스트 시 "Auth 만 테스트" 가 불가. 매번 전체 flow.
- **단점 3**: `if (isDebug) log(...)` 분기가 여기저기. Debug/Release 분리 안 됨.
- **탈락 이유**: 압력 A 정면 위반.

### Option 2 — 인터셉터 체인 + AOP 수준 추상화

Spring AOP 처럼 `@Around` · `@Before` 어노테이션으로 선언.

- **장점**: 선언적.
- **단점 1**: Dart 엔 AOP 표준 없음 (Annotation 은 있지만 런타임 reflection 약함).
- **단점 2**: 코드 생성 + reflection 의 cold start 비용.
- **단점 3**: Dio 의 기본 interceptor API 와 호환 안 됨 → 자체 프레임워크 구축 필요.
- **탈락 이유**: 엔터프라이즈 JVM 관용을 Flutter 에 끌어옴. 과잉.

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

  ApiClient({
    required TokenStorage tokenStorage,
    required Future<bool> Function() onTokenRefresh,
  }) {
    _dio = Dio(BaseOptions(
      baseUrl: AppConfig.instance.baseUrl,
      connectTimeout: Duration(seconds: 10),
      receiveTimeout: Duration(seconds: 30),
    ));

    _dio.interceptors.addAll([
      AuthInterceptor(dio: _dio, tokenStorage: tokenStorage, onTokenRefresh: onTokenRefresh),
      ErrorInterceptor(),
      LoggingInterceptor(),  // ← 내부에서 AppConfig.instance.isDev 분기
    ]);
  }
}
```

### 3개 인터셉터의 역할

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

- **파일 당 < 100줄**: auth 74줄, error 49줄, logging 44줄. 각 파일 한눈에.
- **단일 책임**: 각 인터셉터는 자기 관심사만. 테스트도 개별 가능.
- **추가 관심사 확장 용이**: Tracing 추가 시 `TracingInterceptor` 새 파일, ApiClient 생성자에 설치만 추가.
- **ApiException 일관성**: 모든 에러가 `ErrorInterceptor` 를 거쳐 `ApiException` 으로 표준화. ViewModel 은 Dio 특이성 모름.

### 부정적 결과

- **Dio 실행 순서 학습 비용**: OkHttp · Axios 의 "응답은 역순" 관행에 익숙하면 Dio 의 "세 체인 모두 설치 순" 이 처음 혼란. 위 다이어그램 필요.
- **Error 와 호출자의 암묵적 협력**: Error 가 `ApiException` 을 `DioException.error` 에 담아 전파하는 관행. 누가 이 관행을 깨면 (예: ApiException 을 그대로 throw) `ApiClient` 의 `e.error is ApiException` 언랩과 Logging 의 에러 로깅이 깨짐.
- **LoggingInterceptor 출력 포맷 통일 필요**: 각 로그 라인이 `[HTTP] ...` 로 시작하도록 수동 관리. 일관성 유지 피로.
- **테스트 설정 복잡**: 통합 테스트에서 3개 인터셉터 모두 설치한 ApiClient 를 구성. 초기 설정 줄이 길어짐.

## 교훈

### 교훈 1 — 순서가 의미인 체인은 **명시적 파일 상수** 로

`ApiClient._buildInterceptors()` 함수로 뽑아내지 않고 **생성자 body 에 직접** 3줄 나열. 이 순서가 **코드의 한 장소에만** 있고, 누구나 보면 이해 가능. 순서를 함수로 감추면 "어디서 실행 순서가 정해지지?" 가 탐색 비용.

**교훈**: 순서가 의미인 리스트는 **간접 추상화 없이 직접 노출**. 5줄 짜리 상수가 10줄 짜리 helper 보다 명확.

### 교훈 2 — 환경 기반 분기 — 설치 분기 vs 내부 분기 모두 합리적

처음엔 `kDebugMode` 로 설치 자체를 분기 (`if (kDebugMode) interceptors.add(LoggingInterceptor())`) 하는 안을 검토했어요. 이러면 release 빌드에 LoggingInterceptor 인스턴스 자체가 없어 메모리 · CPU 오버헤드가 0이 되는 장점이 있어요. 단 `kDebugMode` 는 debug/release 이분법이라 staging 처럼 **중간 환경에서 로깅을 켜고 싶을 때 유연성** 이 떨어져요.

지금은 **인터셉터를 항상 설치하고 내부에서 `AppConfig.instance.isDev` 분기**. dev / staging / prod 3환경을 구분 가능하고, 인스턴스 메모리 · 호출 오버헤드는 실측 <1ms 로 무시 가능. release 에서도 LoggingInterceptor 가 존재하지만 if 가드로 빠르게 통과해요.

**교훈**: 환경 기반 분기에는 두 길이 있어요. (1) `kDebugMode` 같은 const 로 **설치 자체** 를 분기 — release tree-shaking 효과 최대, 단 환경 구분이 이분법. (2) 런타임 환경 변수로 **내부** 분기 — 환경 세분화 가능, 단 release 에도 인스턴스 존재. **요구사항에 따라 선택**. 본 템플릿은 dev/staging/prod 3환경 구분을 우선해 (2) 를 채택했어요.

### 교훈 3 — "DioException 의 error 필드" 활용이 정석

`ErrorInterceptor` 가 새 `ApiException` 을 만들되 `DioException` 으로 감싸서 전파. 이렇게 해야 Dio 가 **자기 타입만 다음 인터셉터에 넘겨** 주면서도, ViewModel 은 `DioException.error` 를 꺼내 `ApiException` 으로 사용. Dio 의 설계 의도를 정확히 따른 패턴.

**교훈**: 프레임워크 체인 타입 (DioException, Exception 등) 을 **대체** 하지 말고 **감싸기**. 프레임워크가 기대하는 타입을 유지하면 다른 인터셉터 · 훅들이 정상 동작.

## 관련 사례 (Prior Art)

- [Dio Interceptors 공식 문서](https://pub.dev/documentation/dio/latest/dio/Interceptor-class.html)
- [OkHttp Interceptor 체인](https://square.github.io/okhttp/interceptors/) — Kotlin/Java 의 동일 패턴
- [Axios Interceptors](https://axios-http.com/docs/interceptors) — JavaScript 의 동일 개념
- [Node.js Express middleware chain](https://expressjs.com/en/guide/using-middleware.html) — 서버 측 미들웨어 체인 원리
- [Spring WebClient ExchangeFilterFunction](https://docs.spring.io/spring-framework/reference/web/webflux-webclient/client-filter.html) — JVM 쪽의 동일 개념

## Code References

**3개 인터셉터 구현**
- [`lib/kits/backend_api_kit/interceptors/auth_interceptor.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/backend_api_kit/interceptors/auth_interceptor.dart) — 74줄
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
