# Search Request

검색 · 필터링 · 정렬 요청 DSL. 계약의 실체는 `conditions` 의 **`<field>_<op>` 키 형식**이에요 — Flutter `SearchRequest` 가 만들고, 백엔드 `QueryDslPredicateBuilder` 가 해석해요. 백엔드에 같은 이름의 클래스가 있는 건 아니에요 — [짝 스키마](#짝-스키마) 참조.

---

## 기본 포맷

`conditions` 는 **`<field>_<op>` 키를 가진 Map**. `page` 는 nested 객체. `direction` 은 대문자.

```json
{
  "conditions": {
    "categoryId_eq": 5,
    "amount_gte": 10000,
    "title_like": "커피"
  },
  "page": { "page": 0, "size": 20 },
  "sort": [
    { "field": "expenseDate", "direction": "DESC" }
  ]
}
```

---

## 연산자 (key suffix)

| 빌더 메서드 | key suffix | 의미 | 값 타입 |
|-----|-----|------|---------|
| `eq` | `_eq` | equal | scalar |
| `notEq` | `_ne` | not equal | scalar |
| `gt` | `_gt` | greater than | number/date |
| `gte` | `_gte` | greater or equal | number/date |
| `lt` | `_lt` | less than | number/date |
| `lte` | `_lte` | less or equal | number/date |
| `like` | `_like` | 부분 일치 — 백엔드가 `%값%` (contains) 자동 래핑 | string |
| `isIn` | `_in` | IN list | array |
| `notIn` | `_notIn` | NOT IN | array |
| `isNull` | `_isNull` | IS NULL | (true 고정) |
| `isNotNull` | `_isNotNull` | IS NOT NULL | (true 고정) |

> `between` 은 별도 메서드 없이 `gte` + `lte` 두 번 호출로 표현.
>
> 백엔드 파서 (`QueryDslPredicateBuilder`) 는 이 밖에 `startsWith` / `endsWith` / `between` / `empty` / 대소문자 무시 `i*` 변형 (`_ilike` 등) 도 인식해요. Flutter 빌더가 메서드로 노출하는 건 위 표까지고, 필요하면 `conditions` 맵에 키를 직접 넣을 수 있어요.

---

## SearchRequestBuilder (Dart)

```dart
final request = SearchRequestBuilder()
  .eq('userId', currentUserId)
  .gte('expenseDate', startDate)
  .lte('expenseDate', endDate)
  .like('title', '커피')                      // 백엔드가 %커피% (contains) 로 자동 래핑
  .isIn('status', ['active', 'pending'])      // ← inList 아님
  .sortBy('expenseDate', SortDirection.desc)  // ← positional, descending: 인자 없음
  .page(0, 20)                                // ← positional (page, [size = 20])
  .build();

final response = await api.post<PageResponse<Expense>>(
  '/expenses/search',
  data: request.toJson(),
  fromData: (data) => PageResponse.fromJson(data, Expense.fromJson),
);
```

---

## 사용 예

### 기본 조회

```dart
final req = SearchRequestBuilder()
  .eq('categoryId', 5)
  .build();
```

### 기간 필터 + 정렬 (between 대용)

```dart
final req = SearchRequestBuilder()
  .gte('expenseDate', DateTime(2026, 4, 1))
  .lte('expenseDate', DateTime(2026, 4, 30))
  .sortBy('expenseDate', SortDirection.desc)
  .build();
```

### LIKE 검색 (부분 일치)

```dart
final req = SearchRequestBuilder()
  .like('title', query)  // 백엔드가 %값% (contains) 자동 래핑 — % 를 직접 붙이면 이중 래핑
  .build();
```

### 여러 값 (IN)

```dart
final req = SearchRequestBuilder()
  .isIn('categoryId', [1, 2, 3])  // ← inList 아님
  .build();
```

---

## 주의사항

### SQL Injection 방지

백엔드가 파라미터 바인딩으로 처리해요. 하지만 **value 가 string 일 때 트림 · 이스케이프** 는 신경 써야 해요. `'%<user_input>%'` 같이 직접 조립하지 마세요 — `%` 래핑은 백엔드 몫이에요.

### `like` 성능

`_like` 는 항상 `%값%` (contains) 검색이라 앞의 `%` 때문에 일반 인덱스를 못 타요 — 데이터가 커지면 느려져요. prefix 검색 (`abc%`) 이 필요하면 백엔드가 인식하는 `_startsWith` 키를 `conditions` 에 직접 넣으세요 (Flutter 빌더 메서드는 아직 없어요).

### 페이지네이션 파라미터

- `page: 0-based`
- `size`: 기본 20, 최대 200 — 백엔드 `PageListRequest` 가 `[1, 200]` 으로 자동 clamp 해요

---

## 짝 스키마

백엔드에 `SearchRequest.java` / `SearchRequestBuilder.java` 는 **없어요**. 공유되는 건 `conditions` 의 `<field>_<op>` 키 계약이에요.

| 역할 | 프론트 | 백엔드 |
|------|--------|--------|
| DSL 생성 / 해석 | `lib/kits/backend_api_kit/search_request.dart` (`SearchRequest` · `SearchRequestBuilder`) | `common/common-persistence/.../QueryDslPredicateBuilder.java` — `<field>_<op>` 키를 QueryDSL 조건으로 변환 |
| 표준 목록 API 입력 | — | `common/common-web/.../search/PageListRequest.java` — `{ page, size, sorts, filterModel }` (size `[1, 200]` clamp) |
| 도메인별 typed 검색 DTO | (파생 레포 도메인 layer) | `AuditLogSearchRequest` 같은 도메인별 `*SearchRequest` record |

백엔드의 표준 목록 API 는 `PageListRequest` 포맷 (`{ page, size, sorts, filterModel }`) 을 받아요 — 본 문서의 `conditions` / `page` / `sort` wire 포맷과는 달라요. 파생 레포에서 이 DSL 로 `POST {도메인}/search` 를 열려면, `conditions` 맵을 받아 `QueryDslPredicateBuilder` 로 해석하는 endpoint 를 도메인 컨트롤러에 직접 구현해요.

---

## 관련 문서

- [`ADR-009 · 백엔드 계약`](../philosophy/adr-009-backend-contract.md)
- [`response-schema.md`](./response-schema.md) — PageResponse 응답
