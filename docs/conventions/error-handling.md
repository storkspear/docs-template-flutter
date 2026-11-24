# Error Handling

HTTP 통신 오류는 `ErrorInterceptor`와 `ApiClient`를 거쳐 `ApiException`으로 전달돼요. JWT 파싱 오류나 플러그인 오류 등은 다른 타입으로 도달할 수도 있어요. ViewModel은 오류 코드와 필요한 서버 메시지를 상태에 저장하고, 화면이 사용자에게 보여줄 문구를 정해요. `safeErrorMessage`는 `ApiException.message`를 꺼내는 함수이며, 메시지 안의 민감한 정보를 제거하지는 않아요.

---

## 에러 흐름 (High-Level)

일반 요청의 오류 경로예요. refresh·재시도용 Dio는 AuthInterceptor를 다시 거치지 않아요.

```text
서버 오류 응답 / 네트워크 실패 → DioException
  ↓
AuthInterceptor: 인증 요청의 401이면 토큰 갱신 또는 새 토큰으로 재시도
  ├─ 갱신 실패: 원래 요청의 오류 전달
  ├─ 재시도 실패: 재시도에서 받은 오류 전달
  └─ 재시도 성공: 정상 응답 반환
  ↓
ErrorInterceptor: ApiException을 DioException.error에 넣음
  ↓
LoggingInterceptor: AppConfig.isDev일 때만 콘솔 기록
  ↓
ApiClient._send: DioException에서 ApiException을 꺼내 throw
  ↓
ViewModel: safeErrorCode / safeErrorMessage로 오류 상태 갱신
  ↓
Screen: 코드와 메시지를 표시 정책에 맞게 변환
```

---

## ApiException 구조

```dart
// lib/kits/backend_api_kit/api_exception.dart 발췌
class ApiException implements Exception {
  final String code;             // 서버 코드 또는 클라이언트가 만든 로컬 코드
  final String message;          // 서버·클라이언트 메시지. 표시 정책은 화면에서 결정해요.
  final int? statusCode;         // ← HTTP 상태 코드 (401, 500 등)
  final Map<String, dynamic>? details;

  factory ApiException.fromApiError(ApiError error, {int? statusCode}) => ...;
  factory ApiException.network([String? message]) => ...;
  factory ApiException.timeout() => ...;
  factory ApiException.unknown([String? message]) => ...;

  bool get isAccessTokenExpired => code == 'CMN_007';
  bool get isAccessTokenInvalid => code == 'CMN_008';
  bool get isRefreshTokenExpired => code == 'ATH_002';
  bool get isRefreshTokenInvalid => code == 'ATH_003';
  bool get isInvalidCredentials => code == 'ATH_001';
  bool get isUnauthorized =>
      code == 'CMN_004' || code == 'CMN_007' || code == 'CMN_008' ||
      statusCode == 401;
  bool get isValidationError => code == 'CMN_001';
}
```

### 생성 경로

| 상황 | factory | code |
|------|---------|------|
| 서버가 `{error: {...}}` 로 응답 | `fromApiError` | 서버 제공 (예: `ATH_001`, `CMN_007`) |
| 네트워크 연결 실패 | `network` | `NETWORK_ERROR` |
| 타임아웃 | `timeout` | `TIMEOUT` |
| 알 수 없는 에러 | `unknown` | `UNKNOWN_ERROR` |

---

<a id="safeerrorcode--safeerrormessage"></a>

## safeErrorCode / safeErrorMessage

ViewModel의 catch 블록에서 사용해요. 임의의 예외를 `toString()`으로 노출하지 않고, `ApiException`인 경우에만 코드와 메시지를 꺼내요. 다만 그 메시지 자체의 민감 정보나 내부 경로를 제거하지는 않으므로 화면의 표시 정책을 함께 적용해야 해요.

```dart
// lib/kits/backend_api_kit/api_exception.dart 발췌
String safeErrorCode(Object e, {String fallbackCode = 'UNKNOWN_ERROR'}) {
  if (e is ApiException) return e.code;
  return fallbackCode;
}

String? safeErrorMessage(Object e) {
  if (e is ApiException) return e.message;
  return null;
}
```

### ViewModel 사용 패턴

비동기 작업의 catch 블록에서는 먼저 `ref.mounted`를 확인하고 오류 상태를 갱신해요.

```dart
catch (e) {
  if (!ref.mounted) return;
  state = state.copyWith(
    isLoading: false,
    errorCode: safeErrorCode(e, fallbackCode: AuthLocalErrorCode.login),
    errorMessage: safeErrorMessage(e),
  );
}
```

로그인 성공에는 일반 인증과 2FA 대기 분기가 있으므로 반환값을 버리면 안 돼요. 전체 로그인 예제는 [ViewModel 문서](./viewmodel-mvvm.md#viewmodel-클래스)에서 관리해요.

### fallbackCode 선택 가이드

| 상황 | fallbackCode |
|------|-------------|
| 로그인 시도 | `'LOGIN_FAILED'` |
| 회원가입 시도 | `'SIGNUP_FAILED'` |
| 데이터 조회 | `'FETCH_FAILED'` |
| 저장 · 수정 | `'SAVE_FAILED'` |
| 삭제 | `'DELETE_FAILED'` |
| 범용 | `'UNKNOWN_ERROR'` (기본값) |

---

## ErrorCode 상수

서버 (Spring `CommonError` / `AuthError`) 와 **prefix 형식 (`CMN_*` / `ATH_*`) 으로 매핑** 돼요. 전체 목록과 동기화 의무는 [`api-contract/error-codes.md`](../api-contract/error-codes.md) 에, 설계 결정은 [`ADR-009`](../philosophy/adr-009-backend-contract.md) 에 있어요.

```dart
// lib/kits/backend_api_kit/error_code.dart 발췌
class ErrorCode {
  // 공통 (CMN_*)
  static const validationError = 'CMN_001';
  static const notFound = 'CMN_002';
  static const conflict = 'CMN_003';
  static const unauthorized = 'CMN_004';
  static const accessTokenExpired = 'CMN_007';
  static const accessTokenInvalid = 'CMN_008';

  // 인증 (ATH_*)
  static const invalidCredentials = 'ATH_001';
  static const refreshTokenExpired = 'ATH_002';
  static const refreshTokenInvalid = 'ATH_003';
  static const socialAuthFailed = 'ATH_004';
  static const emailNotVerified = 'ATH_005';
  // ...
}
```

### ErrorCode 비교 (if 분기)

```dart
if (state.errorCode == ErrorCode.invalidCredentials) {
  // 로그인 실패 특별 처리
}
```

이 값은 `static const String`이므로 `if`와 `switch` 모두 사용할 수 있어요. 실제 `resolveAuthErrorCode`는 switch 표현식으로 코드를 매핑하고, 일치하지 않으면 `errorUnknown`을 반환해요.

---

## Screen 에서 i18n 변환

ViewModel은 오류 코드와 필요한 서버 메시지를 넘기고, Screen이 표시 문구를 정해요. 다음은 코드별 번역의 기본 형태예요. 실제 인증 화면은 아래 서버 메시지 우선순위까지 처리하는 `resolveAuthErrorText`를 사용해요. [ADR-016](../philosophy/adr-016-i18n-from-start.md)도 함께 참고해요.

```dart
// Screen 의 helper — 케이스를 세분화하려면 ARB 양쪽에 키부터 추가 (i18n.md 참조)
String _localizedError(BuildContext context, String code) {
  final s = S.of(context);
  switch (code) {
    case ErrorCode.invalidCredentials:    // ATH_001
    case 'LOGIN_FAILED':
      return s.loginFailed;
    case 'NETWORK_ERROR': return s.errorNetworkUnavailable;
    case 'TIMEOUT': return s.errorTimeout;
    default: return s.errorUnknown;
  }
}
```

### 서버 `message` 를 직접 쓸 vs i18n 번역

파생 앱에서는 서버 메시지를 직접 표시할지, 코드에 맞는 번역을 표시할지 정해요. 현재 인증 화면은 `resolveAuthErrorText(errorMessage, errorCode, s)`로 다음 순서를 적용해요.

1. 클라이언트 로컬 코드(`NETWORK_ERROR`, `TIMEOUT`, `UNKNOWN_ERROR`)는 메시지 대신 번역을 표시해요.
2. 이메일 중복(`USR_002`)과 인증 코드 만료·무효(`ATH_002`, `ATH_003`)는 다음 행동을 알려주는 번역을 우선해요.
3. 그 밖에는 서버 메시지가 있으면 표시하고, 없으면 코드별 번역을 사용해요.
4. 둘 다 없으면 `null`을 반환해 오류 문구를 표시하지 않아요.

```dart
final errorText = resolveAuthErrorText(
  state.errorMessage,
  state.errorCode,
  S.of(context),
);
```

따라서 현재 템플릿의 인증 오류가 모두 ARB 번역으로 표시되는 것은 아니에요. 파생 앱에서 모든 서버 오류를 다국어로 안내하려면 필요한 코드를 매핑하고 각 언어 ARB를 함께 추가해요.

---

## 401 자동 refresh (AuthInterceptor 의 동작)

`AuthInterceptor`는 인증이 필요한 요청의 401을 받으면 `AuthService.refreshToken()`을 호출해요. 다른 요청이 이미 access token을 갱신했다면 그 토큰으로 바로 재시도해요.

- 갱신 성공: 새 토큰으로 원래 요청을 한 번 재시도해요. 이 재시도가 실패하면 재시도에서 받은 오류를 전달해요.
- 갱신 거절(`ATH_002`, `ATH_003` 또는 refresh 응답의 HTTP 401): `AuthService`가 토큰을 지우고 미인증 상태를 알려요.
- 네트워크 오류·시간 초과 등 그 밖의 갱신 실패: 토큰을 보존하고 원래 요청의 오류를 호출자에게 전달해요.

ViewModel이 원래 요청의 401만 보고 무조건 `signOut()`을 호출하면 일시적인 통신 실패에서도 로그아웃될 수 있어요. 세션 정리는 갱신 거절을 확인하는 인증 서비스에 맡기고, 화면은 해당 작업의 실패를 안내해요. 비밀번호 재설정이나 이메일 인증에서도 `ATH_002`·`ATH_003`을 사용할 수 있으므로 코드만으로 세션 만료를 판단하지 않아요.

---

## 인터셉터 순서 (ApiClient 내부)

[`ADR-011`](../philosophy/adr-011-interceptor-chain.md) 을 참조하세요.

```dart
// lib/kits/backend_api_kit/api_client.dart 발췌
_dio.interceptors.addAll([
  AuthInterceptor(...),    // 1. 토큰 첨부 + 401 refresh
  ErrorInterceptor(),      // 2. DioException → ApiException
  LoggingInterceptor(),    // 3. 항상 설치 — 내부에서 AppConfig.isDev 분기 (dev 만 출력)
]);
```

개발자가 직접 순서를 바꾸면 안 돼요. 이 순서가 refresh · error 변환 흐름의 전제예요. LoggingInterceptor 는 무조건 설치하되, 환경 분기 (`AppConfig.isDev`) 가 내부에서 처리되므로 `kDebugMode` 가드는 필요 없어요.

---

## skipAuth 플래그 (비로그인 요청)

로그인·가입·비밀번호 찾기는 인증 토큰 없이 호출해요. `ApiClient.postRaw`는 기본으로 `skipAuth: true`를 설정하므로 토큰 첨부와 401 갱신을 모두 건너뛰어요. 2FA 설정처럼 인증이 필요한 raw 요청은 호출부에서 `skipAuth: false`를 지정해요.

```dart
// ApiClient 의 API
await api.postRaw(
  ApiEndpoints.emailSignIn,  // '/api/apps/{slug}/auth/email/signin'
  data: {'email': email, 'password': password},
);
// → 내부적으로 RequestOptions.extra['skipAuth'] = true
// → AuthInterceptor 가 감지 → 토큰 첨부 건너뜀
```

---

## 자주 하는 실수

<a id="-raw-exception-을-stateerrormessage-에-넣기"></a>

### ❌ raw exception 을 state.errorMessage 에 넣기

```dart
// 금지 — stack · 내부 경로가 UI 로 유출
state = state.copyWith(errorMessage: e.toString());
```

**올바르게**:
```dart
state = state.copyWith(
  errorCode: safeErrorCode(e),
  errorMessage: safeErrorMessage(e),
);
```

<a id="-서버-메시지-하드코딩-번역"></a>

### ❌ 서버 메시지 하드코딩 번역

```dart
// 금지 — 번역 일관성 깨짐
if (state.errorMessage?.contains('invalid') ?? false) {
  Text('로그인 정보를 확인해주세요');
}
```

**올바르게**: code 로 분기해요.
```dart
if (state.errorCode == ErrorCode.invalidCredentials) {
  Text(s.loginFailed);
}
```

<a id="-인터셉터가-signout-직접-호출"></a>

### ❌ 인터셉터가 signOut 직접 호출

```dart
// 금지 (AuthInterceptor 내부)
if (refreshFailed) {
  await authService.signOut();  // ← 인프라 레이어가 비즈니스 결정
}
```

**현재 책임 분리**: 인터셉터는 갱신을 인증 서비스에 위임해요. 인증 서비스가 서버의 갱신 거절을 확인했을 때 세션을 정리하고, 화면은 원래 요청의 오류를 안내해요.

<a id="-switch-의-default-누락"></a>

### ❌ switch 의 default 누락

```dart
// 금지
switch (errorCode) {
  case ErrorCode.invalidCredentials: return '...';
  // 일치하는 코드가 없으면 이 switch에서 반환하지 못해요.
}
```

**올바르게**:
```dart
switch (errorCode) {
  case ErrorCode.invalidCredentials: return s.loginFailed;
  // ...
  default: return s.errorUnknown;
}
```

---

## 관련 문서

- [`viewmodel-mvvm.md`](./viewmodel-mvvm.md) — ViewModel 의 try/catch 패턴
- [`i18n.md`](./i18n.md) — 에러 메시지 키 관리
- [`ADR-009 · 백엔드 응답 1:1 계약`](../philosophy/adr-009-backend-contract.md) — `ApiException` 계약 근거
- [`ADR-010 · QueuedInterceptor 로 401 자동 갱신`](../philosophy/adr-010-queued-interceptor.md) — refresh 흐름
- [`ADR-011 · 3층 인터셉터 체인`](../philosophy/adr-011-interceptor-chain.md) — 인터셉터 순서
