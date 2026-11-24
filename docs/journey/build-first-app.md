<a id="build-first-app--첫-기능-완성-walkthrough"></a>

# Build First App — 첫 기능 완성 walkthrough

이 문서는 아이템 목록 조회 기능을 모델·Repository·ViewModel·화면·테스트로 나누어 구현하는 과정을 다뤄요. 목록은 첫 페이지까지 조회하고 새로고침·빈 상태·오류를 처리해요. 추가·수정·삭제는 후속 확장 과제로 구분해요.

> **가정**: [`Onboarding`](./onboarding.md) 을 마쳐서 시뮬레이터에 템플릿 홈이 떠 있는 상태예요. 앱 유형은 `backend-auth-app` recipe 를 선택했다고 가정할게요.

---

## §1 기획 (10분)

만들 앱의 윤곽을 먼저 정해두면 이후 흐름이 꼬이지 않아요.

### 결정할 것

- **앱 유형**: local-only / local-notifier / backend-auth
- **핵심 기능**: 5개 이하 (MVP)
- **첫 기능**: 한 개만 선정 (이 문서에선 "아이템 목록")
- **백엔드 연동 여부**: 있음 / 없음
- **디자인 키 컬러**: HEX 하나 (예: `#FF6B35`)
- **앱 이름**: 사용자에게 보이는 이름

### 예시

| 항목 | 값 |
|------|---|
| 앱 이름 | My Items |
| 유형 | backend-auth (서버 연동 + 로그인) |
| 키 컬러 | `#FF6B35` (오렌지) |
| 첫 기능 | 아이템 목록 조회 (추가·수정·삭제는 후속 확장 과제) |

---

## §2 앱 정체성 설정 (5분)

```bash
./factory install                                  # 1회 — symlink 등록
<repo> local init my-items com.example.myitems     # rename + .env + pub get
```

`app_kits.yaml` recipe 복사:

```bash
cp recipes/backend-auth-app.yaml app_kits.yaml
```

`lib/main.dart`의 Kit 설치 목록과 YAML을 수동으로 맞춰요. `BackendApiKit`과 `AuthKit`은 목록 조회에 필요한 기본 조합이에요. 다른 Kit도 사용할 때는 해당 생성자와 플랫폼 설정을 함께 준비해요.

기존 `UpdateKit`의 `BackendAppUpdateService` 콜백과 `ApiClient.onUpgradeRequired` 연결은 유지하세요. 콜백이 `ProviderContainer`를 읽는 시점까지 포함한 조립 예제는 [현재 main.dart](https://github.com/storkspear/template-flutter/blob/main/lib/main.dart)에 있어요. 목록만 복사하면서 필수 인자를 생략하지 않아요.

```bash
dart run tool/configure_app.dart --audit
```

이 검사는 YAML 안의 이름·의존성을 확인해요. 실제 Dart 설치 목록과의 일치는 별도로 대조해야 해요.

---

## §3 디자인 시스템 적용 (15분)

### 팔레트 커스터마이징

```dart
// lib/theme/my_items_palette.dart
import 'package:flutter/material.dart';
import 'package:my_items/core/theme/app_palette.dart';

class MyItemsPalette extends AppPalette {
  @override String get id => 'my-items-default';
  @override String get name => 'My Items';
  @override Color get seed => const Color(0xFFFF6B35);  // 오렌지
  @override Color get accent => const Color(0xFF1A1A2E);
}
```

### main.dart 에서 교체

```dart
// lib/main.dart
AppPaletteRegistry.install(MyItemsPalette());
```

`flutter run` 을 실행하면 앱 색상이 오렌지 톤으로 바뀐 걸 확인할 수 있어요.

---

## §4 AppConfig 설정 (5분)

```dart
// lib/main.dart
AppConfig.init(
  appSlug: 'my-items',                              // ← 백엔드와 동일
  baseUrl: 'https://api.example.com',
  environment: Environment.dev,
  supportEmail: 'support@example.com',
  privacyUrl: 'https://example.com/privacy',
  termsUrl: 'https://example.com/terms',
  appVersion: '1.0.0',
);
```

환경 변수로 baseUrl + environment 스위칭 (template 기본 패턴 — `lib/main.dart` 에 적용돼 있어요):

```dart
baseUrl: const String.fromEnvironment(
  'BASE_URL',
  defaultValue: 'http://localhost:8081',
),
environment: Environment.values.byName(
  const String.fromEnvironment('APP_ENV', defaultValue: 'dev'),
),
```

빌드 시 주입:

```bash
# local (mock 자동 폴백 — 백엔드/OAuth 없이)
<repo> local start

# dev (Firebase dev project + 실 OAuth — <repo> dev init 후)
<repo> dev start --dart-define-from-file=.env.dev

# prod release
<repo> prod start --release --dart-define-from-file=.env.prod
```

환경 파일은 명시적으로 전달해야 해요. 예를 들어 `<repo> dev start --dart-define-from-file=.env.dev`로 실행해요. release에서는 실제 서버 주소·지원 이메일·개인정보처리방침 URL과 staging/prod 환경을 설정해야 `AppConfig` 검증을 통과해요.

---

## §5 도메인 모델 정의 (15분)

### 모델 클래스

```dart
// lib/features/item/models/item.dart
class Item {
  const Item({
    required this.id,
    required this.title,
    required this.createdAt,
    this.description,
  });

  factory Item.fromJson(Map<String, dynamic> json) => Item(
    id: json['id'] as int,
    title: json['title'] as String,
    description: json['description'] as String?,
    createdAt: DateTime.parse(json['createdAt'] as String),
  );

  final int id;
  final String title;
  final String? description;
  final DateTime createdAt;

  Map<String, dynamic> toJson() => {
    'id': id,
    'title': title,
    'description': description,
    'createdAt': createdAt.toIso8601String(),
  };
}
```

---

## §6 Repository (15분)

이 단계에서는 목록의 첫 페이지를 조회해요. `/items`는 템플릿 백엔드에 기본 제공되지 않으므로 파생 백엔드에 먼저 구현하거나 §12의 개발용 목록 저장소를 주입해야 해요. 응답의 `data`는 `content`, `page`, `size`, `totalElements`, `totalPages`를 포함하는 `PageResponse<Item>` 형식이어야 해요.

```dart
// lib/features/item/item_repository.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:my_items/common/providers.dart';
import 'package:my_items/features/item/models/item.dart';
import 'package:my_items/kits/backend_api_kit/api_client.dart';
import 'package:my_items/kits/backend_api_kit/api_response.dart';

class ItemRepository {
  ItemRepository(this._api);
  final ApiClient _api;

  Future<PageResponse<Item>> list({int page = 0}) async {
    final response = await _api.get<PageResponse<Item>>(
      '/items',
      queryParameters: {'page': page, 'size': 20},
      fromData: (data) => PageResponse<Item>.fromJson(
        data as Map<String, dynamic>,
        Item.fromJson,
      ),
    );
    final result = response.data;
    if (result == null) {
      throw const FormatException('Expected an item page');
    }
    return result;
  }
}

final itemRepositoryProvider = Provider<ItemRepository>(
  (ref) => ItemRepository(ref.watch(apiClientProvider)),
);
```

추가·수정·삭제는 후속 과제로 남겨요. 추가 폼의 입력 검증, 삭제 실패 시 화면 복구, 변경 후 목록 갱신까지 함께 구현한 뒤 UI에 액션을 노출하세요.

---

<a id="7-viewmodel--state-20분"></a>

## §7 ViewModel + State (20분)

첫 조회와 새로고침은 같은 목록 조회를 사용해요. 동시에 같은 요청을 시작하지 않고, 완료 전에 화면 provider가 정리되면 상태를 갱신하지 않아요. 새로고침 실패 시에는 기존 목록을 유지해요.

```dart
// lib/features/item/item_list_view_model.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:my_items/features/item/item_repository.dart';
import 'package:my_items/features/item/models/item.dart';
import 'package:my_items/kits/backend_api_kit/api_exception.dart';

class ItemListState {
  const ItemListState({
    this.isLoading = false,
    this.hasLoaded = false,
    this.items = const [],
    this.errorCode,
  });
  final bool isLoading;
  final bool hasLoaded;
  final List<Item> items;
  final String? errorCode;

  ItemListState copyWith({
    bool? isLoading,
    bool? hasLoaded,
    List<Item>? items,
    String? errorCode,
  }) => ItemListState(
    isLoading: isLoading ?? this.isLoading,
    hasLoaded: hasLoaded ?? this.hasLoaded,
    items: items ?? this.items,
    errorCode: errorCode,
  );
}

class ItemListViewModel extends Notifier<ItemListState> {
  @override
  ItemListState build() => const ItemListState();

  Future<void> load() async {
    if (state.isLoading) return;
    state = state.copyWith(isLoading: true);
    try {
      final page = await ref.read(itemRepositoryProvider).list();
      if (!ref.mounted) return;
      state = state.copyWith(
        isLoading: false,
        hasLoaded: true,
        items: page.content,
      );
    } catch (error) {
      if (!ref.mounted) return;
      state = state.copyWith(
        isLoading: false,
        hasLoaded: true,
        errorCode: safeErrorCode(error, fallbackCode: 'FETCH_FAILED'),
      );
    }
  }

  Future<void> refresh() => load();
}

final itemListViewModelProvider =
    NotifierProvider<ItemListViewModel, ItemListState>(
      ItemListViewModel.new,
      isAutoDispose: true,
    );
```

---

## §8 Screen (20분)

처음에는 실제 목록과 같은 형태의 더미 행을 Skeleton으로 보여줘요. 조회가 끝나면 오류·빈 목록·목록을 구분해요. 짧거나 빈 목록에서도 당겨서 새로고침할 수 있게 스크롤 물리를 지정해요.

```dart
// lib/features/item/item_list_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:my_items/core/i18n/app_localizations.dart';
import 'package:my_items/core/widgets/empty_view.dart';
import 'package:my_items/core/widgets/error_view.dart';
import 'package:my_items/core/widgets/skeleton_loading.dart';
import 'package:my_items/features/item/item_list_view_model.dart';

class ItemListScreen extends ConsumerStatefulWidget {
  const ItemListScreen({super.key});
  @override
  ConsumerState<ItemListScreen> createState() => _ItemListScreenState();
}

class _ItemListScreenState extends ConsumerState<ItemListScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      ref.read(itemListViewModelProvider.notifier).load();
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(itemListViewModelProvider);
    final vm = ref.read(itemListViewModelProvider.notifier);
    final s = S.of(context);
    ref.listen(itemListViewModelProvider, (previous, next) {
      if (next.errorCode != null &&
          next.errorCode != previous?.errorCode &&
          next.items.isNotEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(s.errorGeneric)),
        );
      }
    });

    Widget body;
    if (!state.hasLoaded || (state.isLoading && state.items.isEmpty)) {
      body = SkeletonLoading(
        enabled: true,
        child: ListView.builder(
          itemCount: 6,
          itemBuilder: (_, _) => const ListTile(
            title: Text('Placeholder'),
            subtitle: Text('Placeholder description'),
          ),
        ),
      );
    } else if (state.errorCode != null && state.items.isEmpty) {
      body = ErrorView(message: s.errorGeneric, onRetry: vm.load);
    } else {
      body = RefreshIndicator(
        onRefresh: vm.refresh,
        child: state.items.isEmpty
            ? ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: [
                  SizedBox(height: 300, child: EmptyView(title: s.noItems)),
                ],
              )
            : ListView.builder(
                physics: const AlwaysScrollableScrollPhysics(),
                itemCount: state.items.length,
                itemBuilder: (_, index) {
                  final item = state.items[index];
                  return ListTile(
                    title: Text(item.title),
                    subtitle: item.description == null
                        ? null
                        : Text(item.description!),
                  );
                },
              ),
      );
    }
    return Scaffold(appBar: AppBar(title: Text(s.myItems)), body: body);
  }
}
```

추가 버튼과 스와이프 삭제는 아직 노출하지 않아요. `Dismissible`을 도입할 때는 삭제가 실패하면 항목이 화면에 어떻게 남거나 복구될지도 먼저 정해야 해요.

---

## §9 i18n 키 추가 (10분)

기존 ARB 파일에 아래 키를 합쳐요. `errorGeneric`처럼 이미 있는 키는 재사용하고 파일 전체를 덮어쓰지 않아요.

```json
// lib/core/i18n/app_ko.arb
{
  "myItems": "내 아이템",
  "noItems": "아이템이 없어요",
  "errorGeneric": "오류가 발생했어요"
}
```

```json
// lib/core/i18n/app_en.arb
{
  "myItems": "My Items",
  "noItems": "No items yet",
  "errorGeneric": "Something went wrong"
}
```

```bash
flutter gen-l10n
```

---

## §10 라우팅 추가 (10분)

화면 import와 조립은 `lib/app.dart`에서 해요. 기존 `AppRouter`를 만드는 곳의 `stubRoutes`에 다음 라우트를 추가하세요. `common/router/app_router.dart`가 `features/` 화면을 직접 import하게 만들지 않아요.

```dart
// lib/app.dart의 AppRouter(stubRoutes: [...]) 목록에 추가
GoRoute(
  path: '/items',
  builder: (context, state) => const ItemListScreen(),
),
```

기존 홈 화면에 `context.push('/items')`로 진입하는 버튼을 연결하세요. `ItemListScreen`과 `go_router`의 import도 추가해요. 탭 화면으로 확장하려면 [NavShellKit](../features/nav-shell-kit.md)에 이 화면을 등록할 수 있어요. `NavTab.label`은 문자열이므로 `main.dart`에서 정의되지 않은 `s.myItems`를 그대로 사용하지 않아요.

---

<a id="viewmodel-테스트"></a>

## §11 테스트 (20분)

Mockito 없이 실제 프로젝트처럼 작은 fake를 작성해요. 화면용 provider가 테스트 중 자동 정리되지 않도록 구독을 유지하고, 테스트가 끝나면 닫아요.

```dart
// test/features/item/item_list_view_model_test.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:my_items/features/item/item_list_view_model.dart';
import 'package:my_items/features/item/item_repository.dart';
import 'package:my_items/features/item/models/item.dart';
import 'package:my_items/kits/backend_api_kit/api_response.dart';

class FakeItemRepository implements ItemRepository {
  @override
  Future<PageResponse<Item>> list({int page = 0}) async => PageResponse<Item>(
    content: [
      Item(id: 1, title: 'Test', createdAt: DateTime.utc(2026)),
    ],
    page: page,
    size: 20,
    totalElements: 1,
    totalPages: 1,
  );

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      super.noSuchMethod(invocation);
}

void main() {
  test('load populates items', () async {
    final container = ProviderContainer(overrides: [
      itemRepositoryProvider.overrideWithValue(FakeItemRepository()),
    ]);
    final subscription = container.listen(itemListViewModelProvider, (_, _) {});
    addTearDown(() {
      subscription.close();
      container.dispose();
    });

    await container.read(itemListViewModelProvider.notifier).load();

    final state = container.read(itemListViewModelProvider);
    expect(state.items.single.title, 'Test');
    expect(state.isLoading, isFalse);
    expect(state.errorCode, isNull);
  });
}
```

실패 후 오류 상태, 새로고침 실패 시 기존 목록 유지, 요청 도중 화면을 닫았을 때의 완료 처리도 이어서 검증하세요. 저장소 테스트에서는 `MockDioAdapter`로 실제 `ApiClient`의 응답 파싱을 확인할 수 있어요.

---

<a id="12-실행--검증"></a>

## §12 실행 · 검증

실제 목록을 보려면 `/items`를 구현한 파생 백엔드를 실행하고 `BASE_URL`을 명시적으로 전달해요.

```bash
<repo> dev start --dart-define-from-file=.env.dev
```

`start` 래퍼는 `.env.dev`를 자동으로 읽지 않아요. `.env.dev`에는 필요한 `BASE_URL` 등 개발 설정을 두고 Git에서 제외하세요. 로컬 인증 mock은 인증 흐름만 제공하며 `/items` 응답을 만들어주지 않아요. 서버 없이 화면을 확인할 때는 테스트와 같은 `ItemRepository` fake를 개발용 파일에 정의해 `ProviderContainer`의 `itemRepositoryProvider` override로 넣을 수 있어요. 테스트 파일을 앱에서 import하지 말고, 이 override는 개발 모드에서만 사용하세요.

- [ ] 로그인 후 `/items` 진입
- [ ] 첫 조회에서 Skeleton 표시
- [ ] 빈 응답에서 EmptyView 표시
- [ ] 첫 조회 실패에서 오류와 재시도 표시
- [ ] 새로고침 실패 시 기존 목록 유지와 메시지 표시
- [ ] 짧거나 빈 목록에서도 Pull-to-refresh 동작
- [ ] 한국어·영어 문구 표시
- [ ] 요청 도중 화면을 닫아도 상태 갱신 오류 없음

이 예제는 첫 페이지 조회까지 구현해요. 추가·수정·삭제, 다음 페이지 로드, 캐시 정책은 아래 확장 과제로 진행하세요.

---

## 가계부 모델로 바꾸기

아이템 목록 예제를 가계부에 적용한다면 `lib/features/expense/` 아래에 `models/`, `list/`, `detail/`을 나눌 수 있어요. 화면 수가 적을 때부터 빈 디렉터리나 상세 화면을 만들 필요는 없어요.

```dart
class Expense {
  const Expense({
    required this.id,
    required this.amount,
    required this.category,
    required this.createdAt,
  });
  factory Expense.fromJson(Map<String, dynamic> json) => Expense(
    id: (json['id'] as num).toInt(),
    amount: (json['amount'] as num).toInt(),
    category: json['category'] as String,
    createdAt: DateTime.parse(json['createdAt'] as String),
  );
  final int id;
  final int amount;
  final String category;
  final DateTime createdAt;
}
```

이 예제의 `amount`는 원 단위 정수라는 서버 계약을 가정해요. 다른 통화나 결제 API의 `amountCents`까지 같은 단위로 해석하지 않아요. 시각 필드는 UTC 표현을 받고 날짜 전용 필드는 별도 날짜 계약을 따라요.

Repository에서는 `/expenses`에 `page: 0`, `size: 50`을 전달하고 `PageResponse<Expense>.fromJson(data as Map<String, dynamic>, Expense.fromJson)`으로 파싱할 수 있어요. 응답에 페이지가 있는지 확인한 뒤 `content`를 반환해요. 이 엔드포인트도 파생 서버가 구현해야 해요.

State의 일회성 오류 필드는 새 작업 때 지우고, 비동기 완료 뒤 `ref.mounted`를 확인해요. 라우트는 `app.dart`의 `AppRouter.stubRoutes`에서 조립하고, `expenseListTitle`·`expenseAddButton` 같은 번역 키는 두 ARB에 함께 추가해요. 모델 파싱과 ViewModel의 성공·오류·수명 종료를 검증한 뒤 기기에서 화면 진입을 확인하세요.

---

## 다음 단계

- 추가·수정·삭제와 실패 시 화면 복구
- 다음 페이지 조회와 캐시 정책
- 더 많은 화면 추가
- 인증 후 자동 redirect · 토큰 refresh 확인
- PostHog 이벤트 트래킹
- 배포 ([`Deployment`](./deployment.md))

---

<a id="-책-목차--journey-5단계"></a>

## 📖 책 목차 — Journey 5단계

| 방향 | 문서 | 한 줄 |
|---|---|---|
| ← 이전 | [`Onboarding`](./onboarding.md) | 파생 레포 최초 셋업 (2단계) |
| → 다음 | [`Deployment`](./deployment.md) | 배포 준비 · 첫 운영 배포 (6 · 7단계) |

**막혔을 때**: [`함정`](./dogfood-pitfalls.md) / [`FAQ`](./dogfood-faq.md)
