# Loading UX Conventions

일반 화면의 로딩은 첫 조회의 Skeleton, 새로고침의 `RefreshIndicator`, 액션 버튼의 스피너, 백그라운드 작업의 `TopProgressBar`로 표현해요. 진행 중인 작업과 관련 없는 화면 조작까지 막지 않도록 해요. 부팅용 `LoadingView`는 일반 화면에 덧씌우는 블로킹 오버레이와 구분해요.

---

## 4가지 패턴 한눈

| 맥락 | 패턴 | 위젯 |
|------|------|------|
| **첫 진입** (목록 · 상세 처음 로딩) | Skeleton | `SkeletonLoading` |
| **새로고침** (이미 데이터 있음) | Pull-to-refresh | `RefreshIndicator` |
| **버튼 액션** (로그인 · 저장) | 버튼 스피너 (액션 중 비활성) | `PrimaryButton(isLoading: true)` |
| **백그라운드** (동기화 · 업로드) | TopProgressBar | `TopProgressBar` |

**금지**:
- ❌ 풀스크린 스피너 오버레이
- ❌ 별도 스켈레톤 위젯 (예: `SkeletonListItem`)
- ❌ 버튼 옆에 별도 스피너

---

<a id="1-skeleton--첫-진입"></a>

## 1. Skeleton — 첫 진입

`SkeletonLoading(enabled: isLoading, child: 실제위젯)` 으로 감싸요. 로딩 중엔 shimmer 효과가 자동으로 붙어요. `skeletonizer` 패키지 기반이에요.

아래 지출 목록은 파생 앱의 가상 예제예요. `Expense`, `Expense.dummy()`, provider는 앱에서 정의해야 해요. 더미 데이터는 첫 조회 중에만 사용하고, 조회가 끝난 빈 목록에는 표시하지 않아요.

```dart
Widget build(BuildContext context, WidgetRef ref) {
  final state = ref.watch(expenseListViewModelProvider);
  final showPlaceholders = state.isLoading && state.items.isEmpty;

  return SkeletonLoading(
    enabled: showPlaceholders,
    child: ListView.builder(
      itemCount: showPlaceholders ? 6 : state.items.length,
      itemBuilder: (context, i) {
        final item = showPlaceholders ? Expense.dummy() : state.items[i];
        return ListTile(
          title: Text(item.title),
          subtitle: Text(item.date.toString()),
          trailing: Text('₩${item.amount}'),
        );
      },
    ),
  );
}
```

### 더미 아이템 개수

| 화면 유형 | 개수 |
|---------|------|
| ListView (세로 목록) | 5 ~ 8 |
| GridView (2열) | 4 ~ 6 |
| GridView (3열) | 6 ~ 9 |
| 상세 화면 | 1 |

화면을 "가득 채울" 정도로 잡아요.

### 규칙

- **실제 위젯 레이아웃을 유지해요** — 별도 Skeleton 위젯을 만들지 않아요
- **더미 데이터는 `Expense.dummy()` 같은 factory 로 만들어요** — `Text('Placeholder')` 보다 자연스러워요
- **Skeleton 표현은 `SkeletonLoading`에 맡겨요** — 기본 위젯이 `Skeletonizer`를 사용하므로 화면마다 색상·애니메이션을 따로 지정하지 않아요.

---

<a id="2-pull-to-refresh--새로고침"></a>

## 2. Pull-to-refresh — 새로고침

이미 데이터가 있는 상태에서 사용자가 당겨서 갱신하는 패턴이에요.

```dart
RefreshIndicator(
  onRefresh: () => ref.read(expenseListViewModelProvider.notifier).refresh(),
  child: ListView.builder(
    physics: const AlwaysScrollableScrollPhysics(),
    itemCount: state.items.length,
    itemBuilder: (context, i) => ExpenseTile(expense: state.items[i]),
  ),
)
```

### ViewModel 측

가상의 지출 목록 ViewModel에서 조회 메서드만 발췌한 예제예요. `build()`, repository 주입, 상태 클래스는 생략했어요. 목록이 짧아도 당겨서 갱신할 수 있도록 위 ListView에는 `AlwaysScrollableScrollPhysics`를 지정했어요.

```dart
Future<void> load() async {
  state = state.copyWith(isLoading: true);
  try {
    final items = await _repository.list();
    if (!ref.mounted) return;
    state = state.copyWith(isLoading: false, items: items);
  } catch (e) {
    if (!ref.mounted) return;
    state = state.copyWith(isLoading: false, errorCode: safeErrorCode(e));
  }
}

Future<void> refresh() async {
  try {
    final items = await _repository.list();
    if (!ref.mounted) return;
    state = state.copyWith(items: items);
  } catch (e) {
    if (!ref.mounted) return;
    state = state.copyWith(errorCode: safeErrorCode(e));
  }
}
```

### 규칙

- **`Future` 반환이 필수예요** — `RefreshIndicator` 가 `Future` 완료까지 스피너를 유지해요
- **isLoading 플래그는 건드리지 않아요** — RefreshIndicator 가 자체 관리해요
- **기존 데이터는 유지해요** — 새로고침 중에도 리스트는 보여줘요

---

<a id="3-버튼-스피너--버튼-액션"></a>

## 3. 버튼 스피너 — 버튼 액션

로그인 · 저장 · 제출 같은 CTA 버튼에 쓰는 패턴이에요. `PrimaryButton(isLoading: state.isLoading)` 만으로 끝나요.

```dart
PrimaryButton(
  text: S.of(context).confirm,
  isLoading: state.isLoading,          // ← state 구독
  onPressed: () => vm.save(),          // ← action 호출
)
```

### PrimaryButton 내부 동작

- `isLoading: true` 일 때:
  - text 대신 스피너를 표시해요 (`CircularProgressIndicator.adaptive`)
  - `onPressed: null` 로 비활성화돼서 중복 탭이 방지돼요
  - 버튼 크기가 변하지 않아 레이아웃이 흔들리지 않아요

### 여러 버튼이 있는 화면

```dart
Column(
  children: [
    PrimaryButton(
      text: s.confirm,
      isLoading: state.isSubmitting,
      onPressed: vm.submit,
    ),
    TextButton(
      onPressed: state.isSubmitting ? null : vm.cancel,  // ← submitting 중 cancel 비활성
      child: Text(s.cancel),
    ),
  ],
)
```

### 규칙

- **스피너는 버튼 내부에만 둬요** — 별도 CircularProgressIndicator 는 금지예요
- **같은 작업을 중복 실행하거나 충돌하는 버튼도 비활성화해요** — `onPressed: isLoading ? null : callback`을 사용해요. 관련 없는 화면 조작은 계속할 수 있게 해요.
- **TextField 비활성화는 선택이에요** — 단순 폼은 그대로 두고, 복잡한 multi-step 은 `IgnorePointer` 를 써요

---

<a id="4-topprogressbar--백그라운드"></a>

## 4. TopProgressBar — 백그라운드

사용자가 명시적으로 기다리지 않는 작업 (동기화 · 업로드) 에 쓰는 패턴이에요. 화면 최상단(status bar 바로 아래)에 얇은 progress 를 띄워요. Scaffold 를 `child` 로 감싸는 오버레이라 사용자 인터랙션은 막지 않아요.

```dart
TopProgressBar(
  isLoading: state.isSyncing,
  child: Scaffold(
    appBar: AppBar(title: Text(s.homeStubTitle)),
    body: ...,
  ),
)
```

### 동작

| `isLoading` | 표시 |
|------|------|
| `true` | 최상단에 indeterminate `LinearProgressIndicator` |
| `false` | 숨김 (child 만 렌더) |

> 퍼센트(진행률) 모드는 기본 위젯이 지원하지 않아요 — `isLoading` bool 뿐이에요. 색상만 `color` 로 커스터마이즈할 수 있어요.

### 규칙

- **Scaffold 를 `child` 로 감싸요** — AppBar.bottom 이 아니라 화면 전체를 감싸는 오버레이예요
- **사용자 액션을 차단하지 않아요** — 앱을 계속 사용할 수 있어요
- **완료 시 자동으로 숨어요** — `isLoading: false` 로 전환하면 돼요

---

## 5. EmptyView vs LoadingView

로딩과 "데이터 없음" 은 다른 상태예요. 별도 위젯으로 구분해요.

아래도 같은 지출 목록의 가상 예제예요. `emptyExpenses`·`addFirstExpense`는 파생 앱의 한국어·영어 ARB에 추가한 뒤 생성해야 해요. 첫 조회 실패는 빈 목록 안내보다 먼저 처리해요.

```dart
Widget _body() {
  if (state.items.isEmpty) {
    if (state.isLoading) {
      return SkeletonLoading(enabled: true, child: _buildPlaceholderList());
    }
    if (state.errorCode != null) {
      return ErrorView(
        message: _localizedError(context, state.errorCode!),
        onRetry: vm.load,
      );
    }
    return EmptyView(
      icon: AppIcons.folder,
      title: s.emptyExpenses,
      action: TextButton(
        onPressed: vm.addFirst,
        child: Text(s.addFirstExpense),
      ),
    );
  }
  return _buildList();
}
```

`_buildPlaceholderList()`는 첫 예제처럼 실제 목록 위젯에 더미 데이터를 넣는 함수예요. 별도 Skeleton 위젯을 만들지는 않아요. 이미 목록이 있는 새로고침 실패에서는 목록을 유지하고, 오류를 인라인 안내나 스낵바로 알려요.

---

## 6. 스플래시 (부팅)

현재 `main.dart`는 `SplashController.run()`을 기다린 뒤 `runApp`을 호출해요. 따라서 오래 걸리는 BootStep의 진행 상황을 아래 Dart `LoadingView`가 표시하는 구조는 아니에요. 아래 위젯은 앱 실행 후 라우터의 `/splash` 경로가 그려질 때 사용해요.

```dart
// lib/common/router/app_router.dart 발췌
GoRoute(
  path: Routes.splash,
  builder: (context, state) =>
      Scaffold(body: LoadingView(message: S.of(context).loading)),
),
```

`runApp` 전에는 Dart 화면이 그려지지 않고, 실행 후에는 라우터가 인증 상태와 설치된 규칙에 따라 첫 화면으로 이동해요. 이때 `/splash`가 잠깐 보이거나 바로 다른 경로로 전환될 수 있어요. 부팅 전용 화면에는 풀스크린 `CircularProgressIndicator`를 허용해요.

---

## 자주 하는 실수

<a id="-풀스크린-오버레이"></a>

### ❌ 풀스크린 오버레이

```dart
// 금지
Stack(children: [
  MyScreen(),
  if (isLoading) Container(color: Colors.black54, child: Center(child: CircularProgressIndicator())),
])
```

화면 전체를 가리고 관련 없는 조작까지 막을 수 있어요. 작업 범위에 맞게 표시해요:
- 버튼 액션이면 → `PrimaryButton(isLoading: true)`
- 데이터 로딩이면 → `SkeletonLoading(enabled: true)`

<a id="-별도-스켈레톤-위젯"></a>

### ❌ 별도 스켈레톤 위젯

```dart
// 금지
class SkeletonListItem extends StatelessWidget {
  const SkeletonListItem();
  @override
  Widget build(context) => Container(height: 60, color: Colors.grey[300]);
}
```

실제 UI 와 다른 별도 코드를 유지해야 해요. 대신 `SkeletonLoading(enabled: true, child: 실제ListTile())` 을 써요.

<a id="-버튼-옆-스피너"></a>

### ❌ 버튼 옆 스피너

```dart
// 금지
Row(children: [
  ElevatedButton(...),
  if (isLoading) CircularProgressIndicator(),
])
```

버튼 크기가 왔다갔다 해요. 대신 `PrimaryButton(isLoading: true)` 으로 내부에 통합해요.

<a id="-topprogressbar-를-child-없이-body-안에-배치"></a>

### ❌ TopProgressBar 를 child 없이 body 안에 배치

```dart
// 금지 — TopProgressBar 는 Scaffold 를 child 로 감싸는 오버레이
Scaffold(
  body: Column(children: [
    if (isSyncing) const LinearProgressIndicator(),
    Expanded(child: ...),
  ]),
)
```

대신 Scaffold 전체를 감싸요: `TopProgressBar(isLoading: ..., child: Scaffold(...))`.

---

## 관련 문서

- [`naming.md`](./naming.md) — Loading 관련 위젯 이름
- [`viewmodel-mvvm.md`](./viewmodel-mvvm.md) — `state.isLoading` 관리
- [`ADR-017 · 4가지 로딩 UX 패턴`](../philosophy/adr-017-loading-ux.md) — 근거
