# Response Schema

모든 API 응답은 **`{data, error}`** 상호 배타적 구조. 페이지네이션은 **`PageResponse<T>`** 표준.

---

## ApiResponse<T>

### 성공

```json
{
  "data": {
    "id": 42,
    "title": "..."
  },
  "error": null
}
```

### 실패

```json
{
  "data": null,
  "error": {
    "code": "ATH_001",
    "message": "이메일 또는 비밀번호가 올바르지 않습니다",
    "details": {
      "field": "email"
    }
  }
}
```

> 코드는 `<도메인약어>_<번호>` prefix 형식을 사용해요 (`CMN_*` = 공통, `ATH_*` = 인증). 전체 매핑은 [`error-codes.md`](./error-codes.md) 참조.

### 본문 없는 성공 (204 No Content)

verify-email · password-reset · withdraw · `DELETE /devices/{id}` · notification-settings PATCH 처럼 돌려줄 데이터가 없는 성공은 **204 + 빈 바디**로 응답해요.

```http
HTTP/1.1 204
Content-Type: application/json

(바디 없음)
```

> ⚠️ **wire 에는 JSON 이 아예 실리지 않아요.** 서버 코드는 `ApiResponse.empty()` 를 반환하지만 Tomcat 이 204 응답의 엔티티 바디를 제거하므로 `{"data": null, "error": null}` 같은 JSON 이 전송되지 않아요 (실측 확인). Dio 는 빈 바디를 `null` 로 디코드해요.

`ApiClient` 가 빈 바디를 `ApiResponse.empty()` (data · error 모두 null, `isSuccess == true`) 로 정규화하므로 ViewModel 은 `isSuccess` 로만 판단하면 돼요. `response.data as Map<String, dynamic>` 같은 직접 캐스팅은 금지 — 204 에서 TypeError 가 나고, 이 예외는 `on DioException` 을 우회해 그대로 전파돼요.

### 규칙

- `data` 와 `error` 는 **동시에 존재하지 않음**
- 성공 시 `error: null`, 실패 시 `data: null`
- **본문 없는 성공(204)은 바디 자체가 없음** — `ApiClient` 가 `ApiResponse.empty()` 로 정규화
- `details` 는 선택 — 검증 에러 · 부가 정보

### Dart

```dart
class ApiResponse<T> {
  final T? data;
  final ApiError? error;
  bool get isSuccess => error == null;
  bool get isError => error != null;

  factory ApiResponse.fromJson(Map<String, dynamic> json, T Function(dynamic)? fromData);

  /// 본문 없는 성공 (204 No Content) — data/error 모두 null, isSuccess == true
  const ApiResponse.empty();
}

class ApiError {
  final String code;
  final String message;
  final Map<String, dynamic>? details;
}
```

상세: [`ADR-009 · 백엔드 계약`](../philosophy/adr-009-backend-contract.md)

---

## PageResponse<T>

Spring Boot `Page<T>` 1:1 매핑.

### JSON

```json
{
  "data": {
    "content": [
      { "id": 1, "title": "..." },
      { "id": 2, "title": "..." }
    ],
    "page": 0,
    "size": 20,
    "totalElements": 153,
    "totalPages": 8
  },
  "error": null
}
```

### Dart

```dart
class PageResponse<T> {
  final List<T> content;
  final int page;             // 0-based
  final int size;
  final int totalElements;
  final int totalPages;

  bool get isEmpty => content.isEmpty;
  bool get isLastPage => page >= totalPages - 1;
  bool get hasNextPage => !isLastPage;

  factory PageResponse.fromJson(Map<String, dynamic> json, T Function(Map<String, dynamic>) fromItem);
}
```

### 사용 예

```dart
final page = await api.get<PageResponse<Expense>>(
  '/expenses',
  queryParameters: {'page': 0, 'size': 20},
  fromData: (data) => PageResponse.fromJson(data, Expense.fromJson),
);

for (final expense in page.data!.content) {
  // ...
}

if (page.data!.hasNextPage) {
  // 다음 페이지 로드
}
```

---

## 필드 네이밍

**camelCase**. snake_case 금지.

```json
// ✅ 올바른 예
{
  "userId": 42,
  "createdAt": "2026-04-24T12:34:56Z",
  "expenseDate": "2026-04-24"
}

// ❌ 금지
{
  "user_id": 42,
  "created_at": "..."
}
```

### 날짜 · 시간

- **ISO 8601 UTC** (Z 접미사 또는 `+00:00`)
- Dart: `DateTime.parse(...)` 로 자동 UTC 인식

### 숫자

- **원시 타입** (int · double) — JSON number
- 금액: **정수 (원 단위)** 권장 — 부동소수점 정확도 문제 회피. `int amount` (예: 1500 = 1,500원)

---

## 짝 스키마 동기화

| 프론트 | 백엔드 |
|--------|--------|
| `lib/kits/backend_api_kit/api_response.dart` | `common-web/.../ApiResponse.java` |
| `lib/kits/backend_api_kit/api_response.dart` | `common-web/.../PageResponse.java` |

---

## 관련 문서

- [`ADR-009 · 백엔드 계약`](../philosophy/adr-009-backend-contract.md)
- [`error-codes.md`](./error-codes.md)
- [`search-request.md`](./search-request.md)
