<a id="cached_repository"></a>

# Cached_Repository

**Status**: Accepted. 현재 유효. 2026-04-24 작성 / 2026-05-07 line 수 갱신. `lib/core/cache/cached_repository.dart` (149줄) 가 5가지 정책 지원. 기본 저장소는 `MemoryCacheStore` — 파생 레포에서 `DriftCacheStore` 등으로 교체 가능.

## 결론부터

`CachedRepository`가 다섯 가지 조회 정책을 제공하고 호출자가 상황에 맞게 선택해요. 기본 `MemoryCacheStore`는 TTL이 지난 항목을 읽을 때 제거하며 최대 100개를 보관해요. SWR의 갱신 결과는 저장소에 반영되지만 이미 반환한 화면 상태를 자동으로 바꾸지는 않아요. 쓰기 작업 뒤에는 호출자가 관련 키를 무효화하고 필요한 화면을 다시 조회해요.

## 왜 이런 고민이 시작됐나?

모바일 앱의 데이터 조회엔 **"속도 vs 최신성"** 의 영원한 갈등이 있어요.

**상황 1 — 빠른 진입** 을 원하면: 캐시 즉시 반환. 하지만 데이터가 stale 할 수 있음.
**상황 2 — 최신 데이터** 를 원하면: 매번 네트워크. 하지만 로딩 스피너 지속.
**상황 3 — 오프라인 대응** 이 필요하면: 네트워크 실패 시 캐시로 fallback.
**상황 4 — 백그라운드 갱신** 이면: 캐시 즉시 반환 + 뒤에서 최신화.

어느 한 정책이 만능은 아니에요. 네 힘이 부딪혀요.

**힘 A — 화면별 다른 UX**  
홈 대시보드는 "빠르게 뜨는 게" 중요. 거래 내역 상세는 "최신이 맞는지" 중요. 한 정책으로 모두 해결 안 됨.

**힘 B — ViewModel 의 단순성**  
ViewModel 코드가 "캐시 있으면 이거 쓰고, 없으면 네트워크, 실패 시 캐시 fallback" 같은 복잡한 흐름을 매번 구현하면 지옥.

**힘 C — 캐시 무효화 자동화**  
"상세 수정 후 목록으로 돌아가면 갱신돼야 함" 을 **매번 수동으로 invalidate** 하면 실수 빈발. 프리픽스 기반 일괄 삭제가 필요.

**힘 D — 저장소 교체 가능성**  
템플릿 기본은 메모리 캐시. 일부 앱은 Drift · Hive 기반 **영속 캐시** 를 원함. 교체 가능해야 해요.

이 결정이 답해야 했던 물음이에요.

> **화면별 UX 에 맞게 캐시 정책을 선택 가능하되, ViewModel 은 코드 한두 줄로 끝나는 구조** 는?

## 고민했던 대안들

<a id="option-1--http-수준-캐싱-dio-interceptor"></a>

### Option 1 — HTTP 수준 캐싱 (Dio interceptor)

요청 URL · 헤더 기반으로 인터셉터가 자동 캐시. 서버 `Cache-Control` 헤더 준수.

- **장점**: 투명. ViewModel · Repository 코드 불변.
- **단점 1**: 서버가 `Cache-Control` 을 세밀하게 제공해야 함. 대부분 인디 앱 백엔드는 안 줘요.
- **단점 2**: **URL 이 key**. POST / 쿼리 파라미터 변화 같은 조건 미묘.
- **단점 3**: 무효화 제어 어려움 — "거래 삭제 후 목록 갱신" 같은 **도메인 이벤트 기반** 무효화가 HTTP 스펙 밖.
- **탈락 이유**: 웹 관용. 모바일 앱의 도메인 중심 캐싱에 안 맞음.

<a id="option-2--drift-sqlite-에-모든-데이터-영속화"></a>

### Option 2 — Drift (SQLite) 에 모든 데이터 영속화

Repository 가 모든 응답을 Drift 에 저장. 조회 시 Drift 에서.

- **장점**: 오프라인 우수. 재시작 후에도 데이터 유지.
- **단점 1**: **로컬 DB 스키마 관리** 가 또 필요. 서버 DTO 변경 시 Drift 스키마도 마이그레이션.
- **단점 2**: 모든 데이터를 영속화할 가치가 있는 건 아님. 일회성 조회 (권한 체크) 까지 DB 에 넣으면 과함.
- **단점 3**: 마이그레이션 실패 시 앱이 먹통. 스키마 회귀 테스트 같은 방어가 매번 필요.
- **탈락 이유**: 모든 데이터가 영속 가치 있는 건 아님. 정책 기반 선택이 맞음.

<a id="option-3--추상-cachestore--정책-기반-cachedrepository--채택"></a>

### Option 3 — 추상 CacheStore + 정책 기반 CachedRepository ★ (채택)

**추상 `CacheStore`** 인터페이스 (get · put · remove · removeByPrefix) 를 두고, 기본 구현 `MemoryCacheStore`. Repository 는 `CachedRepository.fetch(key: ..., policy: ..., ttl: ..., fetcher: ..., fromJson: ..., toJson: ...)` 한 번 호출.

- **힘 A 만족**: 정책을 파라미터로 선택. 화면마다 다른 정책.
- **힘 B 만족**: Repository 호출 1회. 정책 분기는 CachedRepository 내부.
- **힘 C 만족**: `invalidate` · `invalidateByPrefix` 로 CUD 후 일괄 삭제.
- **힘 D 만족**: `CacheStore` 인터페이스 → 파생 레포에서 `DriftCacheStore` · `HiveCacheStore` 등 교체.

## 결정

### 5가지 캐시 정책

```dart
// lib/core/cache/cache_policy.dart 전체
enum CachePolicy {
  /// 캐시 우선: 유효한 캐시 있으면 사용, 없으면 네트워크
  cacheFirst,

  /// 네트워크 우선: 항상 네트워크, 실패 시 캐시 폴백
  networkFirst,

  /// 캐시를 읽지 않고 네트워크에서 조회한 뒤 응답을 캐시에 저장해요.
  networkOnly,

  /// 캐시만: 네트워크 호출 안 함 (오프라인 전용)
  cacheOnly,

  /// Stale-While-Revalidate: 캐시 즉시 반환 + 백그라운드 네트워크 갱신
  staleWhileRevalidate,
}
```

### CachedRepository.fetch

```dart
// lib/core/cache/cached_repository.dart 발췌
class CachedRepository {
  final CacheStore _store;
  final void Function(Object error, StackTrace stack)? _onRevalidateError;

  CachedRepository({required CacheStore store, void Function(Object, StackTrace)? onRevalidateError})
    : _store = store,
      _onRevalidateError = onRevalidateError;

  Future<T> fetch<T>({
    required String key,
    required Duration ttl,
    required CachePolicy policy,
    required Future<T> Function() fetcher,        // 네트워크 함수
    required T Function(String json) fromJson,    // 역직렬화
    required String Function(T data) toJson,      // 직렬화
  }) async {
    switch (policy) {
      case CachePolicy.cacheFirst:
        return _cacheFirst(key, ttl, fetcher, fromJson, toJson);
      case CachePolicy.networkFirst:
        return _networkFirst(key, ttl, fetcher, fromJson, toJson);
      case CachePolicy.networkOnly:
        return _networkOnly(key, ttl, fetcher, toJson);
      case CachePolicy.cacheOnly:
        return _cacheOnly(key, fromJson);
      case CachePolicy.staleWhileRevalidate:
        return _staleWhileRevalidate(key, ttl, fetcher, fromJson, toJson);
    }
  }

  Future<void> invalidate(String key) => _store.remove(key);
  Future<void> invalidateByPrefix(String prefix) => _store.removeByPrefix(prefix);
  // ...
}
```

### 정책별 동작

**cacheFirst** — 캐시 즉시, 없으면 네트워크:

```dart
Future<T> _cacheFirst<T>(...) async {
  final cached = await _store.get(key);
  if (cached != null) return fromJson(cached);
  final data = await fetcher();
  await _store.put(key, toJson(data), ttl: ttl);
  return data;
}
```

**networkFirst** — 항상 네트워크, 실패 시 캐시:

```dart
Future<T> _networkFirst<T>(...) async {
  try {
    final data = await fetcher();
    await _store.put(key, toJson(data), ttl: ttl);
    return data;
  } catch (_) {
    final cached = await _store.get(key);
    if (cached != null) return fromJson(cached);
    rethrow;  // ← 캐시도 없으면 원 에러 전파
  }
}
```

**staleWhileRevalidate** — 캐시 즉시 + 백그라운드 갱신:

```dart
Future<T> _staleWhileRevalidate<T>(...) async {
  final cached = await _store.get(key);

  if (cached != null) {
    unawaited(_revalidate(key, ttl, fetcher, toJson));  // ← 백그라운드
    return fromJson(cached);
  }

  // 캐시 없으면 네트워크 1회
  final data = await fetcher();
  await _store.put(key, toJson(data), ttl: ttl);
  return data;
}

Future<void> _revalidate<T>(...) async {
  try {
    final data = await fetcher();
    await _store.put(key, toJson(data), ttl: ttl);
  } catch (e, st) {
    _onRevalidateError?.call(e, st);  // ← 실패는 로깅만, 조용히
  }
}
```

### 화면별 정책 선택 가이드

| 화면 | 정책 | 이유 |
|------|------|------|
| 홈 대시보드 | `staleWhileRevalidate` | 빠른 진입 + 최신화 |
| 목록 화면 | `networkFirst` | 최신성 중요, 오프라인 대응 |
| 상세 화면 | `cacheFirst` | 목록에서 클릭 시 즉시 뜨기 |
| 설정 · 프로필 | `networkFirst` | 자주 변하지 않음 + 최신성 |
| 정적 데이터 (약관 · FAQ) | `cacheFirst` | 변화 드묾 |
| 오프라인 전용 | `cacheOnly` | 네트워크 불가 상황 |

### Repository 사용 예

```dart
// 파생 레포에서 (문서 예시)
class ExpenseRepository {
  final ApiClient _api;
  final CachedRepository _cache;

  ExpenseRepository({required ApiClient api, required CachedRepository cache})
    : _api = api, _cache = cache;

  Future<ExpenseDetail> getById(int id) {
    return _cache.fetch(
      key: 'expense_$id',
      ttl: Duration(minutes: 5),
      policy: CachePolicy.cacheFirst,
      fetcher: () => _api.get('/expenses/$id', fromData: ExpenseDetail.fromJson),
      fromJson: (json) => ExpenseDetail.fromJson(jsonDecode(json)),
      toJson: (data) => jsonEncode(data.toJson()),
    );
  }

  Future<List<ExpenseSummary>> list({int page = 0}) {
    return _cache.fetch(
      key: 'expenses_list_page_$page',
      ttl: Duration(minutes: 2),
      policy: CachePolicy.networkFirst,
      fetcher: () => _api.get('/expenses?page=$page', fromData: ...),
      // ...
    );
  }

  Future<void> delete(int id) async {
    await _api.delete('/expenses/$id');
    await _cache.invalidate('expense_$id');
    await _cache.invalidateByPrefix('expenses_list_');  // ← 목록 전체 무효화
  }
}
```

### 설계 선택 포인트

**포인트 1 — 키는 문자열, 직렬화는 JSON**  
CacheStore 는 문자열 키와 값을 다뤄요. 모델을 JSON 으로 바꾸는 책임은 호출자에게 있어 저장소 구현을 바꿀 수 있지만, 직렬화 비용과 오류 처리도 고려해야 해요.

**포인트 2 — TTL 은 Duration**  
호출자가 `Duration(minutes: 5)` 처럼 유효 기간을 전달해요. 기본 메모리 저장소는 저장 시점에 만료 시각을 계산하고 조회할 때 확인해요.

**포인트 3 — SWR 의 `unawaited`**  
사용할 수 있는 캐시가 있으면 먼저 반환하고 갱신은 기다리지 않아요. 갱신된 값은 다음 조회에 반영되며, 이미 표시한 화면을 자동으로 갱신하지는 않아요.

**포인트 4 — SWR 실패는 조용히**  
백그라운드 갱신 오류는 이미 반환한 캐시 응답의 오류로 전달하지 않아요. 설정된 `onRevalidateError` 콜백이 있으면 이를 호출해 기록할 수 있어요.

**포인트 5 — `invalidateByPrefix` 는 강력한 무효화**  
목록 키를 `expenses_list_page_0`, `expenses_list_page_1` 처럼 정하면 `invalidateByPrefix('expenses_list_')` 로 관련 키를 함께 지울 수 있어요. 다른 데이터가 함께 삭제되지 않도록 접두사 범위를 정해요.

**포인트 6 — CacheStore 는 `core/` 에, 구현은 교체 가능**  
기본 구현은 MemoryCacheStore 예요. 영속 저장이 필요하면 앱에서 CacheStore 구현을 만들고 Provider 를 교체할 수 있어요. DriftCacheStore 는 제공되는 클래스가 아니라 이런 확장의 예예요.

## 이 선택이 가져온 것

### 긍정적 결과

- **ViewModel 캐시 인지 0**: ViewModel 은 `repository.getById(42)` 호출. 캐시 여부 · 정책 모름.
- **화면별 UX 최적**: 각 화면이 자기 요구에 맞는 정책 선택. 한 정책으로 강제 안 함.
- **캐시 우선 응답**: 유효한 캐시가 있으면 네트워크 갱신을 기다리지 않고 반환해요. 화면에 표시되는 시간은 앱에서 측정해요.
- **쓰기 후 무효화**: 호출자가 `invalidateByPrefix`를 실행하면 관련 키를 지워요. 이미 표시 중인 목록을 바꾸려면 화면에서 다시 조회해야 해요.
- **오프라인 fallback**: 실패 시 TTL이 아직 유효한 캐시가 있으면 반환해요. 기본 메모리 저장소는 앱을 다시 시작하면 비워지고, 만료된 캐시는 반환하지 않아요.
- **저장소 교체 가능**: 영속 캐시 필요하면 `DriftCacheStore` 구현 + override.

### 부정적 결과

- **정책 선택 피로**: 화면 짤 때마다 "뭐 쓰지?" 판단 필요. 위 가이드 표 제공하지만 결정 비용.
- **fromJson / toJson 보일러플레이트**: 각 호출마다 `fromJson: (json) => ...` 람다. `freezed` + `json_serializable` 로 자동화 가능하지만 본 템플릿은 미도입 (ADR-009).
- **TTL 관리 수동**: "이 화면 캐시 TTL 5분? 1시간?" 결정이 반복. 기본값 상수 제공하면 개선.
- **캐시 축출 기준**: `MemoryCacheStore`의 기본 상한은 100개예요. 새 키를 넣을 때 가득 차 있으면 가장 오래전에 저장한 항목을 지워요. 읽은 횟수나 최근 조회 시각을 반영하는 LRU는 아니에요.
- **멀티 디바이스 일관성 없음**: 클라 캐시라 기기 간 동기화 안 됨. 중요한 데이터는 networkFirst 가 안전.

## 교훈

<a id="교훈-1--정책-은-화면-맥락에서만-결정-가능"></a>

### 교훈 1 — "정책" 은 화면 맥락에서만 결정 가능

같은 데이터도 목록 화면과 검색 화면에서 필요한 최신성이 다를 수 있어요. Repository 메서드가 정책을 고정할지 인자로 받을지는 해당 앱의 사용처에 맞춰 결정해요. 캐시 정책은 CachedRepository 호출에서 명시해요.

정책은 데이터의 최신성, 실패 시 허용할 표시 방식, 캐시 수명을 고려해 정해요. 모든 화면에서 같은 정책을 사용하거나 매번 ViewModel 로 노출할 필요는 없어요.

<a id="교훈-2--swr-의-에러는-실패로-치지-않는-게-맞다"></a>

### 교훈 2 — SWR 의 에러는 실패로 치지 않는 게 맞다

백그라운드 갱신에 실패해도 이미 반환한 캐시 값은 유지돼요. 다만 실패 자체가 사라지는 것은 아니므로, 반복 실패를 확인하려면 `onRevalidateError` 로 기록해요.

**운영 시 고려할 점**: 백그라운드 갱신 실패가 이미 표시한 데이터를 지우지는 않아요. 필요하면 `onRevalidateError`로 기록하고 반복 실패를 확인해요. 실패를 사용자에게 즉시 알릴지와 운영에서 관찰할지는 별도로 판단해요.

<a id="교훈-3--invalidatebyprefix-가-목록-상세-연관의-주춧돌"></a>

### 교훈 3 — `invalidateByPrefix` 가 목록-상세 연관의 주춧돌

상세 데이터를 수정하면 여러 목록 페이지가 낡을 수 있어요. 관련 목록 키가 같은 접두사를 사용한다면 한 번에 지운 뒤 필요한 화면에서 다시 조회할 수 있어요. 어떤 목록까지 영향을 받는지는 앱이 정해야 해요.

캐시 키에는 자원 종류와 목록·상세 구분, 검색 조건처럼 응답을 바꾸는 값을 반영해요. 접두사로 지울 범위도 이 규칙과 함께 정해요.

## 관련 사례 (Prior Art)

- [SWR (React)](https://swr.vercel.app/) — Stale-While-Revalidate 패턴의 대중화. 본 ADR 의 `staleWhileRevalidate` 이름 출처
- [TanStack Query](https://tanstack.com/query/latest) — 정책 기반 캐싱 + 자동 무효화. 본 ADR 과 가장 가까운 개념
- [Apollo Client Cache](https://www.apollographql.com/docs/react/caching/overview) — GraphQL 진영의 캐싱 전략
- [Android Room + Repository Pattern](https://developer.android.com/topic/architecture/data-layer) — 캐시 + 네트워크 결합
- [HTTP Cache-Control RFC 7234](https://datatracker.ietf.org/doc/html/rfc7234) — HTTP 수준 캐싱 표준 (Option 1 의 근거)

## Code References

**캐시 인프라**
- [`lib/core/cache/cache_policy.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/core/cache/cache_policy.dart) — 5가지 enum
- [`lib/core/cache/cache_store.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/core/cache/cache_store.dart) — 추상 인터페이스
- [`lib/core/cache/memory_cache_store.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/core/cache/memory_cache_store.dart) — 기본 구현
- [`lib/core/cache/cached_repository.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/core/cache/cached_repository.dart) — 다섯 정책과 무효화 구현

**Provider 연결**
- [`lib/common/providers.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/common/providers.dart) — `cacheStoreProvider` · `cachedRepositoryProvider`

**테스트**
- [`test/core/cache/cached_repository_test.dart`](https://github.com/storkspear/template-flutter/blob/main/test/core/cache/cached_repository_test.dart) — 각 정책 · TTL · SWR 동작 검증

**관련 ADR**:
- [`ADR-002 · 3계층 모듈 구조`](./adr-002-layered-modules.md) — CacheStore 가 `core/` 에 있는 이유
- [`ADR-005 · Riverpod + MVVM`](./adr-005-riverpod-mvvm.md) — Repository Provider 주입 패턴
- [`ADR-006 · 인터페이스 기반 서비스 교체`](./adr-006-debug-fallback.md) — CacheStore 교체 가능성
- [`ADR-009 · 백엔드 응답 1:1 계약`](./adr-009-backend-contract.md) — fetcher 의 `fromData` 콜백과 연결
