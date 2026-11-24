<a id="backend_api_kit"></a>

# backend_api_kit

앱 API 요청에 인증·오류 변환·개발용 로깅을 연결하는 Kit예요. `AuthKit`과 `FileKit`처럼 이 클라이언트를 사용하는 기능을 설치할 때 함께 조립해요.

---

## 개요

`ApiClient`는 일반 요청용 Dio와 토큰 갱신용 Dio를 따로 사용해요. 일반 요청에는 인증·오류 변환·개발 환경 로깅 인터셉터가 있고, 갱신 요청은 인증 인터셉터를 우회해 재진입을 피해요. 파일 바이트 업로드처럼 앱 API 밖의 요청은 별도 클라이언트를 사용할 수 있어요. 응답은 서버의 `data`·`error` 계약에 맞춰 파싱하며 SSL pinning은 선택 기능이에요.

---

## 활성화

```yaml
# app_kits.yaml
kits:
  backend_api_kit: {}
```

```dart
// lib/main.dart
await AppKits.install([
  BackendApiKit(),
  // ...
]);
```

### AppConfig 설정 필수

```dart
AppConfig.init(
  appSlug: 'my-app',
  baseUrl: 'https://api.example.com',  // ← backend_api_kit 이 이 값 사용
  // ...
);
```

---

## 제공 기능

| 항목 | 설명 |
|------|------|
| `ApiClient` | Dio 래퍼. `get` · `post` · `put` · `patch` · `delete` · `postRaw` · `search` |
| `AuthInterceptor` | Authorization 자동 첨부 + 401 refresh ([`ADR-010`](../philosophy/adr-010-queued-interceptor.md)) |
| `ErrorInterceptor` | `DioException` → `ApiException` 변환 |
| `LoggingInterceptor` | `AppConfig.isDev` 분기로 dev 만 콘솔 로깅 (staging · prod 무음) |
| `ApiResponse<T>` · `PageResponse<T>` | 응답 래퍼 |
| `ApiException` | 표준 예외 + `safeErrorCode` · `safeErrorMessage` |
| `ErrorCode` 상수 | 클라이언트가 사용하는 서버 코드와 로컬 오류 코드 |
| `SearchRequest` · `SearchRequestBuilder` | 검색 · 페이지네이션 DSL |
| `SslPinning` | opt-in SHA-256 핀 검증 |
| `DeviceRegistration` · `DeviceInfo` | push token 백엔드 등록 (`/devices` 호출 래퍼) — 이전엔 notifications_kit 에 있었음 |

---

## 핵심 API

### ApiClient

아래 `User`와 `Expense`는 파생 앱에서 정의하는 모델이에요. `/expenses`도 파생 서버에 구현해야 해요. 일반 메서드는 `/api/apps/{appSlug}` 접두사를 붙이고, `postRaw`는 이미 완성된 경로를 받아요.

```dart
final userResponse = await api.get<User>(
  '/users/me',
  fromData: (data) => User.fromJson(data as Map<String, dynamic>),
);

final pageResponse = await api.get<PageResponse<Expense>>(
  '/expenses',
  queryParameters: {'page': 0, 'size': 20},
  fromData: (data) => PageResponse<Expense>.fromJson(
    data as Map<String, dynamic>, Expense.fromJson,
  ),
);

final created = await api.post<Expense>(
  '/expenses',
  data: {'amount': 1500, 'category': 'food'},
  fromData: (data) => Expense.fromJson(data as Map<String, dynamic>),
);

await api.postRaw(
  ApiEndpoints.emailSignIn,
  data: {'email': email, 'password': password},
);
```

데이터가 없는 성공 응답도 있으므로 엔드포인트 계약에 맞춰 `response.data`를 처리해요. 이 예시의 금액은 원 단위 정수를 가정하며, 다른 API의 금액 단위까지 동일하다는 뜻은 아니에요.

### SearchRequestBuilder

검색 DSL을 받는 엔드포인트는 파생 백엔드에서 구현해야 해요. `search()`에는 `/expenses`처럼 기본 경로를 넘겨요. 메서드가 `/search`를 붙이므로 `/expenses/search`를 넘기면 경로가 중복돼요.

```dart
final request = SearchRequestBuilder()
  .eq('categoryId', 5)
  .gte('amount', 10000)
  .like('title', '커피')
  .isIn('status', ['active', 'pending'])
  .build();

final results = await api.search<Expense>(
  '/expenses',
  request: request,
  fromItem: Expense.fromJson,
);
```

조건값은 해당 서버 필드의 JSON 형식에 맞춰요. 날짜 전용 값은 `2026-04-01`, UTC 시각은 `toUtc().toIso8601String()`처럼 직렬화한 문자열로 전달해요. 검색 연산자와 서버의 별도 목록 요청 형식은 [검색 계약](../api-contract/search-request.md)을 확인하세요.

---

## 일반 사용 예

### Repository 패턴

객체 조회·목록 조회·생성은 위의 API 예제를 Repository 메서드에서 호출해요. 삭제처럼 데이터가 없는 응답은 `data!`로 읽지 않아요.

```dart
await api.delete('/expenses/$id');
```

모델, 응답 파싱과 Repository를 연결한 전체 예제는 [첫 앱 만들기](../journey/build-first-app.md#6-repository-15분)에 있어요.

### ViewModel 에서

ViewModel은 Repository를 호출하고 로딩·오류·조회 결과를 상태로 관리해요. `await` 뒤에는 `ref.mounted`를 확인하고, 새로고침에 실패해도 기존 목록은 유지해요. [목록 ViewModel과 테스트](../journey/build-first-app.md#7-viewmodel-state-20분)에서 실제 코드를 확인하세요.

---

## 파생 레포 체크리스트

- [ ] `AppConfig.baseUrl` 설정
- [ ] (선택) SSL pinning 활성화 → `--dart-define=SSL_PINS=sha256/AAA=,sha256/BBB=`
- [ ] (선택) 백엔드에서 `SearchRequest` 스펙 확인 — 필드명 · 연산자
- [ ] `auth_kit` 과 함께 쓰면 `requires` 검증 자동

---

## Code References

- [`lib/kits/backend_api_kit/api_client.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/backend_api_kit/api_client.dart)
- [`lib/kits/backend_api_kit/api_response.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/backend_api_kit/api_response.dart)
- [`lib/kits/backend_api_kit/api_exception.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/backend_api_kit/api_exception.dart)
- [`lib/kits/backend_api_kit/error_code.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/backend_api_kit/error_code.dart)
- [`lib/kits/backend_api_kit/interceptors/`](https://github.com/storkspear/template-flutter/tree/main/lib/kits/backend_api_kit/interceptors) — 3개 인터셉터
- [`lib/kits/backend_api_kit/search_request.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/backend_api_kit/search_request.dart)

---

## 관련 문서

- [`ADR-009 · 백엔드 계약`](../philosophy/adr-009-backend-contract.md)
- [`ADR-010 · 401 자동 갱신`](../philosophy/adr-010-queued-interceptor.md)
- [`ADR-011 · 인터셉터 체인`](../philosophy/adr-011-interceptor-chain.md)
- [`Error Handling`](../conventions/error-handling.md)
