# Architecture — 코딩 규약

MVVM 패턴 · 모듈 의존 방향 · 에러 처리. **코드 작성 시 따라야 할 규약** 에 초점.

> 모듈 구조 / 의존 관계 / 부트 시퀀스 같은 한눈 요약은 [`journey/architecture.md`](../journey/architecture.md) 가 더 친절해요. 본 문서는 **새 화면을 만들 때 어떤 패턴을 따라야 하는가** 를 다뤄요.

---

## 1. MVVM (Riverpod + StateNotifier)

### 1-1. 3계층 구조

```
Screen (ConsumerWidget)
  │  ref.watch(viewModelProvider)
  ▼
ViewModel (StateNotifier<ViewState>)
  │  service.method()
  ▼
Service / Repository
  │  apiClient.get()
  ▼
ApiClient (Dio)
```

- **Screen**: UI 만 — 비즈니스 로직 0
- **ViewModel**: 상태 관리 + 도메인 호출 — UI 위젯 직접 생성 금지
- **Service / Repository**: API 호출 / 로컬 DB / 외부 SDK 추상 — Riverpod 의존 X (테스트 용이)

상세 패턴은 [`viewmodel-mvvm.md`](./viewmodel-mvvm.md), 근거는 [`ADR-005`](../philosophy/adr-005-riverpod-mvvm.md).

### 1-2. ViewModel 표준 양식

```dart
// expense_list_view_model.dart

class ExpenseListState {
  const ExpenseListState({
    this.expenses = const [],
    this.isLoading = false,
    this.errorCode,
    this.errorMessage,
  });

  final List<Expense> expenses;
  final bool isLoading;
  final String? errorCode;     // ApiException.code 또는 fallbackCode
  final String? errorMessage;  // 서버 i18n 메시지 (없으면 null)

  ExpenseListState copyWith({
    List<Expense>? expenses,
    bool? isLoading,
    String? errorCode,
    String? errorMessage,
  }) {
    return ExpenseListState(
      expenses: expenses ?? this.expenses,
      isLoading: isLoading ?? this.isLoading,
      errorCode: errorCode,
      errorMessage: errorMessage,
    );
  }
}

class ExpenseListViewModel extends StateNotifier<ExpenseListState> {
  ExpenseListViewModel(this._repo) : super(const ExpenseListState());
  final ExpenseRepository _repo;

  Future<void> load() async {
    state = state.copyWith(isLoading: true, errorCode: null);
    try {
      final list = await _repo.fetchAll();
      state = state.copyWith(expenses: list, isLoading: false);
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        errorCode: safeErrorCode(e, fallbackCode: 'FETCH_FAILED'),
        errorMessage: safeErrorMessage(e),
      );
    }
  }
}

final expenseListViewModelProvider =
    StateNotifierProvider.autoDispose<ExpenseListViewModel, ExpenseListState>(
  (ref) => ExpenseListViewModel(ref.watch(expenseRepositoryProvider)),
);
```

**핵심 패턴**:
- `copyWith` 로 상태 갱신 (immutable)
- `errorCode` 는 서버 코드 (`ATH_001` 등) 또는 ViewModel 별 fallback (`FETCH_FAILED`)
- `errorMessage` 는 서버 i18n 메시지 — 없으면 Screen 에서 errorCode 기반으로 i18n 매핑
- `autoDispose` 가 default — 메모리 누수 방지

### 1-3. Screen 표준 양식

```dart
// expense_list_screen.dart

class ExpenseListScreen extends ConsumerStatefulWidget {
  const ExpenseListScreen({super.key});

  @override
  ConsumerState<ExpenseListScreen> createState() => _ExpenseListScreenState();
}

class _ExpenseListScreenState extends ConsumerState<ExpenseListScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() => ref.read(expenseListViewModelProvider.notifier).load());
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(expenseListViewModelProvider);
    final s = S.of(context);

    if (state.isLoading) return const LoadingView();

    if (state.errorCode != null) {
      return ErrorView(
        message: state.errorMessage ?? _localizedError(state.errorCode!, s),
        onRetry: () => ref.read(expenseListViewModelProvider.notifier).load(),
      );
    }

    return ListView.builder(
      itemCount: state.expenses.length,
      itemBuilder: (_, i) => ExpenseTile(state.expenses[i]),
    );
  }

  String _localizedError(String code, S s) {
    switch (code) {
      case ErrorCode.unauthorized: return s.errorSessionExpired;
      case 'NETWORK_ERROR': return s.errorNetworkUnavailable;
      default: return s.errorUnknown;
    }
  }
}
```

**핵심 패턴**:
- `ConsumerStatefulWidget` 으로 initState 활용 (`ConsumerWidget` 보다 hooks-friendly)
- `Future.microtask` 로 build 직후 첫 로드 (initState 안에서 ref.read 직접 X — Riverpod 권고)
- 에러 상태에서 server message > i18n key fallback
- 로딩/에러/성공 3분기 명확

---

## 2. Provider 명명

```dart
// 단순 Provider
final apiClientProvider = Provider<ApiClient>((ref) => ApiClient(...));

// StateNotifier
final loginViewModelProvider =
    StateNotifierProvider.autoDispose<LoginViewModel, LoginState>(...);

// Stream
final authStreamProvider = StreamProvider<AuthState>((ref) => ...);

// Future
final currentUserProvider = FutureProvider<CurrentUser?>((ref) => ...);

// Family (파라미터)
final expenseDetailProvider = FutureProvider.family<Expense, int>((ref, id) => ...);
```

**규칙**:
- 이름 끝에 항상 `Provider` (예: `apiClientProvider`)
- ViewModel 은 `xxxViewModelProvider` (예: `loginViewModelProvider`)
- 도메인 객체 단순 조회는 `xxxProvider` (예: `currentUserProvider`)
- Family/AutoDispose 는 명시적 사용 — 메모리 라이프사이클이 다르므로

상세는 [`naming.md`](./naming.md).

---

## 3. 에러 처리 일관성

### 3-1. 3계층 변환

```
Dio → DioException → ErrorInterceptor → ApiException → ViewModel.catch
                                                          ↓
                                                  state.errorCode/Message
                                                          ↓
                                                  Screen i18n 매핑 → UI
```

- **API 계층**: `ApiException` (서버 코드 또는 NETWORK/TIMEOUT/UNKNOWN)
- **ViewModel 계층**: `safeErrorCode(e, fallback: '...')` 로 안전한 코드 추출
- **UI 계층**: `errorCode` → i18n 매핑 → 사용자 메시지

### 3-2. ApiException 분기 처리

```dart
try {
  await authService.signInWithEmail(...);
} on ApiException catch (e) {
  if (e.isInvalidCredentials) {
    // ATH_001 — 사용자가 비번 틀렸음
    state = state.copyWith(errorCode: e.code, errorMessage: e.message);
  } else if (e.isAccessTokenExpired) {
    // CMN_007 — 자동 refresh 트리거 (보통 인터셉터가 처리)
  } else if (e.isRefreshTokenExpired || e.isRefreshTokenInvalid) {
    // ATH_002/003 — refresh 도 실패 → signOut
    await ref.read(authServiceProvider).signOut();
  } else {
    // 그 외 — 일반 에러 메시지
    state = state.copyWith(errorCode: safeErrorCode(e), errorMessage: safeErrorMessage(e));
  }
}
```

전체 에러 코드 매핑은 [`api-contract/error-codes.md`](../api-contract/error-codes.md).

### 3-3. PII 보호

- **`message` 직접 노출 금지**: 서버가 디버그 정보를 잘못 흘릴 수 있음 — `safeErrorMessage()` 거쳐서만 사용
- **stack trace 노출 금지**: 운영 빌드에선 `e.toString()` 사용 X. Sentry 에 reportError 후 사용자에겐 i18n 메시지만
- **상세 PII**: `e.details` 의 `email`, `userId` 등은 운영 로그에만 — UI 에 노출 X

### 3-4. Sentry 연동

```dart
} catch (e, st) {
  await ref.read(crashServiceProvider).reportError(e, st);
  state = state.copyWith(errorCode: safeErrorCode(e));
}
```

- **모든 비즈니스 catch 에서 `reportError` 호출 권장** — 강제는 아니나 운영 디버깅에 필수
- DSN 미주입 시 Debug 폴백 (`DebugCrashService`) 으로 자동 처리 — 콘솔만

상세는 [`error-handling.md`](./error-handling.md), [`integrations/sentry.md`](../integrations/sentry.md).

---

## 4. 모듈 의존 방향

```
features/  →  common/  →  kits/  →  core/
```

**규칙**:
- 단방향만 허용. 화살표 역방향 import 금지.
- `core/` 는 모든 곳에서 import 가능
- `kits/` 끼리 직접 import 금지 — `requires` 로 명시 + provider 경유 ([kits.md §3](./kits.md))
- `features/` 는 `common/` 의 provider 만 사용 (kits 직접 import 자제)

**예외 — `core/` 인터페이스 import**:
- `core/storage/token_storage.dart` 같은 인터페이스 클래스는 어디서든 import OK
- `core/cache/cached_repository.dart` 같은 추상 헬퍼도 OK

상세 근거는 [`ADR-002 · Layered Modules`](../philosophy/adr-002-layered-modules.md).

---

## 5. 새 화면 추가 — Step by Step

페르소나 시나리오: "가계부 앱이라 `ExpenseListScreen` 추가". 1-2년차가 막힘 없이 따라갈 수 있는 절차.

### 5-1. 디렉토리 생성

```
lib/features/expense/
├── list/
│   ├── expense_list_screen.dart
│   └── expense_list_view_model.dart
├── detail/
│   ├── expense_detail_screen.dart
│   └── expense_detail_view_model.dart
└── models/
    └── expense.dart
```

### 5-2. 모델 정의

```dart
// models/expense.dart

class Expense {
  const Expense({
    required this.id,
    required this.amount,
    required this.category,
    required this.createdAt,
  });

  factory Expense.fromJson(Map<String, dynamic> json) {
    return Expense(
      id: (json['id'] as num).toInt(),
      amount: (json['amount'] as num).toInt(),       // 정수 (원 단위)
      category: json['category'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),  // ISO 8601 UTC
    );
  }

  final int id;
  final int amount;
  final String category;
  final DateTime createdAt;
}
```

> 응답 스키마 규칙은 [`api-contract/response-schema.md`](../api-contract/response-schema.md). camelCase, ISO 8601 UTC, 금액은 정수 (원 단위).

### 5-3. Repository (선택 — 단순한 경우 ViewModel 에서 직접 호출 OK)

```dart
// expense_repository.dart

class ExpenseRepository {
  ExpenseRepository(this._api);
  final ApiClient _api;

  Future<List<Expense>> fetchAll() async {
    final response = await _api.get<PageResponse<Expense>>(
      '/expenses',
      queryParameters: {'page': 0, 'size': 50},
      fromData: (data) => PageResponse.fromJson(data, Expense.fromJson),
    );
    return response.data!.content;
  }
}

final expenseRepositoryProvider = Provider<ExpenseRepository>(
  (ref) => ExpenseRepository(ref.watch(apiClientProvider)),
);
```

### 5-4. ViewModel + Screen 작성

위 §1-2, §1-3 양식 따라 작성.

### 5-5. 라우트 등록

GoRouter 통합은 두 가지 옵션:

**옵션 A — `common/router/app_router.dart` 의 routes 에 직접 추가** (단순한 경우):

```dart
GoRoute(
  path: '/expenses',
  builder: (_, __) => const ExpenseListScreen(),
),
GoRoute(
  path: '/expenses/:id',
  builder: (_, state) => ExpenseDetailScreen(
    id: int.parse(state.pathParameters['id']!),
  ),
),
```

**옵션 B — 도메인 kit 으로 분리** (커진 경우):

`lib/kits/expense_kit/` 만들어 `routes` 기여 — [`kits.md §4`](./kits.md) 참조.

### 5-6. i18n

```bash
# lib/core/i18n/app_ko.arb 에 추가
"expenseListTitle": "가계부",
"expenseAddButton": "추가",

# lib/core/i18n/app_en.arb 에 동일 키 추가
"expenseListTitle": "Expenses",
"expenseAddButton": "Add",

# 생성
flutter gen-l10n
```

### 5-7. 테스트

```
test/features/expense/
├── expense_list_view_model_test.dart    # ViewModel 단위 테스트
└── models/expense_test.dart              # fromJson 테스트
```

상세는 [`testing/testing-strategy.md`](../testing/testing-strategy.md).

### 5-8. 검증

```bash
flutter analyze              # 0 issues
flutter test                 # 그린
flutter run                  # 화면 라우팅 동작 확인
```

---

## 6. 자주 빠지는 함정

1. **`autoDispose` 누락** — 화면 벗어나도 Provider 살아있어 메모리 누수
2. **`copyWith` 안 쓰고 `state.x = ...`** — Dart 의 `final` 필드라 컴파일 에러. 또는 mutable 필드면 UI 갱신 안 됨
3. **에러 catch 후 reportError 누락** — 운영에서 무엇이 실패했는지 모름
4. **i18n 키만 추가하고 `flutter gen-l10n` 안 돌림** — 빌드 실패
5. **도메인 모델 안 만들고 `Map<String, dynamic>` 직접 사용** — 타입 안전 X, 리팩토링 어려움
6. **PageResponse 안 쓰고 List 직접 받음** — 페이지네이션 깨짐

---

## 7. 관련 문서

- [`journey/architecture.md`](../journey/architecture.md) — 모듈 구조 10분 한눈 요약
- [`viewmodel-mvvm.md`](./viewmodel-mvvm.md) — MVVM 패턴 상세
- [`naming.md`](./naming.md) — 명명 규약
- [`error-handling.md`](./error-handling.md) — ApiException 처리 패턴
- [`loading-ux.md`](./loading-ux.md) — Skeleton / Pull-to-refresh / 버튼 스피너 / TopBar
- [`i18n.md`](./i18n.md) — ARB 작성 규약
- [`theme-tokens.md`](./theme-tokens.md) — 디자인 토큰 사용
- [`kits.md`](./kits.md) — Kit 작성 규약
- [`api-contract/`](../api-contract/) — 백엔드 계약
- [`ADR-002 · Layered Modules`](../philosophy/adr-002-layered-modules.md) — 의존 방향
- [`ADR-005 · Riverpod MVVM`](../philosophy/adr-005-riverpod-mvvm.md) — 상태 관리 결정
