<a id="loading_ux"></a>

# Loading_UX

**Status**: Accepted. 현재 유효. 2026-04-24 기준 `lib/core/widgets/` 에 `SkeletonLoading` · `TopProgressBar` · `LoadingView` · `PrimaryButton` (스피너 내장) 등 로딩 관련 위젯. `skeletonizer` 패키지 기반.

## 결론부터

첫 조회는 Skeleton, 사용자 새로고침은 `RefreshIndicator`, 버튼 액션은 버튼 안의 스피너, 백그라운드 작업은 `TopProgressBar`로 표현해요. 일반 작업 때문에 화면 전체를 가리는 로딩 오버레이를 피하고, 관련 액션의 중복 실행을 막아요. 부팅용 `LoadingView`와 데이터 없는 상태의 `EmptyView`는 각각 구분해서 사용해요.

## 왜 이런 고민이 시작됐나?

로딩 UX 가 일관되지 않으면 같은 앱 안에서도 **화면마다 다른 경험** 이 생겨요.

- 홈 화면: 풀스크린 `CircularProgressIndicator`
- 설정 화면: skeleton
- 프로필 화면: 아무것도 없이 빈 화면
- 로그인 버튼 누르면: 전체 UI 가 회색 오버레이 + 스피너

이런 **뒤섞인 경험** 은 프로답지 못하고, 무엇보다 **개발자가 매번 "이번엔 어떻게?"** 결정해야 해서 시간 소모. 압력들이 부딪혀요.

**압력 A — UX 일관성**  
같은 앱에서 같은 종류의 로딩은 같은 UI. 화면 별 편차가 있으면 브랜드 인상 저하.

**압력 B — 맥락별 적절한 피드백**  
"첫 진입" 과 "버튼 눌러서 저장" 은 다른 맥락. 같은 스피너 UI 로 처리하면 어색. 맥락별 패턴 필요.

**압력 C — 풀스크린 블로킹의 UX 저해**  
풀스크린 오버레이 + 스피너는 "앱이 멈춘 것처럼 느껴짐" — 사용자가 뒤로가기 · 다른 탭으로 이탈 시도. 모바일 UX 금기 중 하나.

**압력 D — 개발자의 결정 피로**  
매번 "이 화면엔 어떤 로딩?" 이 되면 시간 소모. 몇 개 패턴으로 **선택지를 강제로 좁혀** 야 결정 비용 낮아짐.

이 결정이 답해야 했던 물음이에요.

> **모든 로딩 상황을 몇 개 패턴으로 축소하되, 패턴 안에서 맥락별 적절한 피드백을 제공하려면 어떻게 하는가?**

## 고민했던 대안들

<a id="option-1--각-화면이-자유롭게"></a>

### Option 1 — 각 화면이 자유롭게

디자인 가이드 없이 개발자가 매번 선택.

- **장점**: 유연.
- **단점 1**: 일관성 상실. 앱 내 UX 편차.
- **단점 2**: 결정 피로 누적.
- **탈락 이유**: 압력 A · D 정면 위반.

<a id="option-2--풀스크린-스피너-한-가지"></a>

### Option 2 — 풀스크린 스피너 한 가지

모든 로딩에 `Center(child: CircularProgressIndicator())`.

- **장점**: 결정 제로.
- **단점 1**: 압력 C 정면 위반. 풀스크린 블로킹이 모든 맥락에 과해요.
- **단점 2**: 버튼 누른 직후 갑자기 화면 전체가 회색 → UX 불친절.
- **탈락 이유**: 맥락을 무시한 획일화.

<a id="option-3--4가지-패턴-규약화--채택"></a>

### Option 3 — 4가지 패턴 규약화 ★ (채택)

맥락별로 4개 패턴 선택. 그 밖의 케이스는 "이 4개 중 무엇에 해당?" 판단.

- **압력 A 만족**: 같은 맥락 → 같은 패턴 → 일관성.
- **압력 B 만족**: 맥락별 적절한 피드백.
- **압력 C 만족**: 풀스크린 스피너 금지.
- **압력 D 만족**: 4개 선택지만 있음 → 결정 짧게.

## 결정

### 4가지 패턴

| 맥락 | 패턴 | 위젯 | 왜 이걸? |
|------|------|------|---------|
| **첫 진입** (목록 · 상세 처음 로딩) | Skeleton | `SkeletonLoading` | 레이아웃 유지 → 콘텐츠 위치 예측 가능 |
| **새로고침** (이미 데이터 있음) | Pull-to-refresh | `RefreshIndicator` | 사용자 주도 액션 → 즉각 피드백 |
| **버튼 액션** (로그인 · 저장) | 버튼 스피너 (액션 중 비활성) | `PrimaryButton(isLoading: true)` | 동작 중임을 버튼에 국한 |
| **백그라운드** (동기화 · 업로드) | TopProgressBar | `TopProgressBar` | 앱 사용 계속 가능 + 작업 중 표시 |

### 1. Skeleton (첫 진입)

```dart
import 'package:app_template/core/widgets/empty_view.dart';
import 'package:app_template/core/widgets/skeleton_loading.dart';
import 'package:flutter/material.dart';

Widget buildItemList({
  required bool isLoading,
  required List<({String title, String subtitle})> items,
  required String emptyTitle,
}) {
  final showSkeleton = isLoading && items.isEmpty;
  if (!isLoading && items.isEmpty) {
    return EmptyView(title: emptyTitle);
  }
  return SkeletonLoading(
    enabled: showSkeleton,
    child: ListView.builder(
      itemCount: showSkeleton ? 6 : items.length,
      itemBuilder: (_, index) => ListTile(
        title: Text(showSkeleton ? 'Placeholder' : items[index].title),
        subtitle: Text(
          showSkeleton ? 'Placeholder subtitle' : items[index].subtitle,
        ),
      ),
    ),
  );
}
```

`emptyTitle` 은 호출 화면에서 번역한 빈 상태 문구예요. 예제의 record 대신 앱 모델을 사용할 수 있고, rename 후에는 import 의 Dart 패키지명도 맞춰요. skeletonizer 는 실제 위젯 위에 로딩 효과를 적용해요. 더미와 실제 데이터의 길이가 다르면 레이아웃이 달라질 수 있으므로 표시 결과를 확인해요.

**금지**: 별도 스켈레톤 위젯 작성. `SkeletonBox(...)` 같은 것 만들지 말고 **실제 위젯을 그대로 쓰면서 enabled 로 감쌈**.

### 2. Pull-to-refresh (새로고침)

```dart
RefreshIndicator(
  onRefresh: () => ref.read(myViewModelProvider.notifier).refresh(),
  child: ListView(
    physics: const AlwaysScrollableScrollPhysics(),
    children: [...],
  ),
)
```

사용자가 **명시적으로 당겨야** 작동. 진행률 표시는 `RefreshIndicator` 가 자동 — 개발자 추가 코드 없음.

### 3. 버튼 스피너 (액션 중 비활성)

로그인 화면에서는 현재 LoginState, LoginViewModel 과 입력한 email·password 를 사용해 다음처럼 연결할 수 있어요.

```dart
PrimaryButton(
  text: S.of(context).login,
  isLoading: state.isLoading,
  onPressed: () => vm.signInWithEmail(email, password),
)
```

`PrimaryButton` 위젯이 내부적으로:
- 스피너 표시 (text 대신, `CircularProgressIndicator.adaptive`)
- `onPressed: null` 로 비활성화 → 중복 탭 방지

전체 화면 오버레이 없음. **버튼만 "작업 중" 상태** 로 표현 — 사용자는 다른 필드 수정 등 계속 가능.

### 4. TopProgressBar (백그라운드)

```dart
TopProgressBar(
  isLoading: state.isSyncing,
  child: Scaffold(
    appBar: AppBar(title: Text('홈')),
    body: ...,
  ),
)
```

child 위에 겹쳐 표시하는 화면 상단의 얇은 진행 표시줄이에요. 내부 `SafeArea`가 상태 표시줄 영역을 피해 배치해요. **indeterminate 전용** 이에요 — 생성자가 받는 건 `isLoading` (bool) · `child` · `color` 뿐이고, 내부의 `LinearProgressIndicator` 에 `value` 를 넘기지 않아요. 진행률 퍼센트를 보여주려면 위젯에 `value` 파라미터를 먼저 추가해야 해요. 사용자는 계속 앱 사용 가능하고, 작업 진행은 시각적으로만 알려요.

### 금지 사항

- ❌ 풀스크린 스피너 오버레이 (회색 배경 + 가운데 CircularProgressIndicator) — "앱 멈춤" 같은 UX
- ❌ 버튼 옆에 별도 스피너 위젯 — 버튼 내부에 통합이 더 깔끔
- ❌ `null` 데이터에 `Text('')` — skeleton 또는 `EmptyView` 명시적 사용

### 설계 선택 포인트

**포인트 1 — Skeleton 은 "실제 위젯 + 더미 데이터"**  
`SkeletonBox(width: 200, height: 20)` 같이 **별도 스켈레톤 위젯** 만들지 않음. 실제 `ListTile` 을 더미 데이터로 채우고 `SkeletonLoading(enabled: true)` 로 감싸기. 이유: 실제 위젯과 로딩 위젯이 **같은 레이아웃** 이라 완료 시 튐 없음.

**포인트 2 — 버튼 스피너는 `PrimaryButton` 내부에**  
버튼 옆에 별도 스피너 위젯 두면 레이아웃이 왔다갔다. 버튼 내부에 스피너 integrate → 버튼 크기 불변 + 라벨만 교체.

**포인트 3 — `TopProgressBar` 는 백그라운드 전용**  
사용자 명시적 액션은 버튼 스피너, 사용자 모르게 자동 처리는 TopProgressBar. 이 구분이 "개입 여부" 신호.

**포인트 4 — 로딩 상태는 ViewModel 에 bool**  
`state.isLoading: bool`. 복잡한 `Status.idle / loading / error / success` enum 도 가능하지만 대부분 bool 로 충분. 에러는 별도 `errorCode` 필드.

**포인트 5 — EmptyView 는 로딩과 구분**  
조회가 끝난 뒤 데이터가 없으면 `EmptyView(title: emptyTitle)` 를 표시해요. `title` 은 필수 named 인자이고 `subtitle`, `icon`, `action` 은 선택 인자예요. 로딩 중의 더미 목록과 빈 상태를 별도로 처리해요.

## 이 선택이 가져온 것

### 긍정적 결과

화면 상황에 따라 버튼 로딩, skeleton, 상단 진행 표시, 당겨서 새로고침을 선택해요. PrimaryButton 은 로딩 중 비활성화할 수 있어요. 화면 일부를 계속 보여주되 필요한 입력은 막을 수 있으므로 모든 로딩이 비차단이라는 뜻은 아니에요. skeleton 을 사용해도 실제 데이터 길이와 레이아웃이 다르면 화면 변화가 생길 수 있어요.

### 부정적 결과

폼의 일부 입력까지 막을지, 진행 표시를 어디에 둘지 앱에서 정해야 해요. skeleton 에는 실제 위젯을 그릴 더미 데이터가 필요하고, 네트워크 이미지 같은 부수 효과도 확인해야 해요. PrimaryButton 외의 버튼은 필요한 로딩 동작을 따로 연결해요. TopProgressBar 는 화면의 배치 규약과 함께 사용해요.

## 교훈

<a id="교훈-1--선택지를-좁히는-것-이-디자인"></a>

### 교훈 1 — "선택지를 좁히는 것" 이 디자인

자주 쓰는 상황에 공통 패턴을 정하면 화면마다 로딩 방식을 새로 설계하는 일을 줄일 수 있어요. 네 가지 패턴으로 설명하기 어려운 동작은 요구를 확인하고 확장해요.

<a id="교훈-2-풀스크린-스피너는-ux-재앙"></a>
<a id="교훈-2--풀스크린-스피너는-ux-재앙"></a>

### 교훈 2 — 기존 내용을 유지하며 진행 상태를 보여줘요

기존 내용을 보여줄 수 있다면 화면 전체를 지우지 않고 해당 작업의 진행 상태를 표시해요. 중복 요청이나 잘못된 입력을 막을 범위는 별도로 정해요.

<a id="교훈-3--skeleton-은-실제-ui-를-복제하지-말고-감쌀-것"></a>

### 교훈 3 — Skeleton 은 실제 UI 를 복제하지 말고 감쌀 것

실제 화면 위젯을 skeleton 으로 감싸면 구조를 두 벌로 유지하는 부담을 줄일 수 있어요. 다만 적절한 더미 데이터, 이미지 처리, 로딩 중 상호작용은 앱에서 준비해야 해요. 효과만 켜면 모든 레이아웃과 데이터 문제가 해결되는 것은 아니에요.

## 관련 사례 (Prior Art)

- [Material Design 3 — Progress indicators](https://m3.material.io/components/progress-indicators/overview) — 공식 가이드
- [Skeletonizer 패키지](https://pub.dev/packages/skeletonizer) — 본 ADR 이 채택한 라이브러리
- [Nielsen Norman Group — Response Times](https://www.nngroup.com/articles/response-times-3-important-limits/) — 0.1s / 1s / 10s 경계와 UX
- [Apple Human Interface Guidelines — Loading](https://developer.apple.com/design/human-interface-guidelines/loading) — iOS 관용
- [Android Material Design 의 ProgressIndicator](https://github.com/material-components/material-components-android/blob/master/docs/components/ProgressIndicator.md)

## Code References

**4가지 패턴 위젯**
- [`lib/core/widgets/skeleton_loading.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/core/widgets/skeleton_loading.dart) — Skeletonizer 래퍼
- [`lib/core/widgets/top_progress_bar.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/core/widgets/top_progress_bar.dart) — child 위에 SafeArea 로 배치하는 화면 상단 진행 표시줄
- [`lib/core/widgets/primary_button.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/core/widgets/primary_button.dart) — 스피너 내장 버튼
- [`lib/core/widgets/loading_view.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/core/widgets/loading_view.dart) — 스플래시 등 특수 케이스

**기타 상태 위젯**
- [`lib/core/widgets/empty_view.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/core/widgets/empty_view.dart) — 데이터 없음
- [`lib/core/widgets/error_view.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/core/widgets/error_view.dart) — 에러 상태

**사용 예시**
- [`lib/common/router/app_router.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/common/router/app_router.dart) — splash 라우트에서 `LoadingView` 사용
- [`lib/kits/auth_kit/ui/login/login_screen.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/auth_kit/ui/login/login_screen.dart) — `PrimaryButton(isLoading: ...)` 사용

**관련 ADR**:
- [`ADR-002 · 3계층 모듈 구조`](./adr-002-layered-modules.md) — 위젯이 `core/widgets/` 에 있는 이유
- [`ADR-005 · Riverpod + MVVM`](./adr-005-riverpod-mvvm.md) — `state.isLoading` 을 ViewModel 이 관리
- [`ADR-015 · 팔레트 런타임 교체`](./adr-015-palette-registry.md) — 로딩 위젯의 색상 (progress tint 등) 이 팔레트 기반
