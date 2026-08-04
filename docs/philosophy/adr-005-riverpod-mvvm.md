# Riverpod_MVVM

**Status**: Accepted. 현재 유효. 2026-04-24 작성 / 2026-07-15 수치 재실측 / 2026-08-01 riverpod 3 이관 반영. `flutter_riverpod ^3.4.2` 사용, `StateNotifier` → `Notifier` 이관 완료 (ViewModel 4개 + PaginationController 1개, 테스트 631개 통과 — 교훈 2). `lib/common/providers.dart` (156줄) 중앙 DI.

## 결론부터

상태 관리는 **`Notifier` + `ConsumerWidget` + `NotifierProvider`** 조합 하나로 통일해요 (riverpod 3 의 provider 는 기본이 non-autoDispose 라 화면 단위 ViewModel 은 `isAutoDispose: true` 를 명시해요 — 별도 수식어가 없어요). Screen 은 UI 만, ViewModel 은 로직만, `state` 는 **불변 데이터 클래스 + `copyWith`** 로 다뤄요. 전역 DI 는 `lib/common/providers.dart` 에 모아두고 Kit 이 필요 시 `providerOverrides` 로 교체 (ADR-003). 이 한 벌의 규약이 **15개 Kit + 파생 레포 N 개** 전부에서 똑같이 돌아가게 하는 게 목표예요.

## 왜 이런 고민이 시작됐나?

Flutter 에는 상태 관리 "정답" 이 없어요. `setState`, `InheritedWidget`, `Provider`, `BLoC`, `GetX`, `Riverpod`, `MobX`, `Redux`, `signals` ... 어느 것이든 앱 하나 정도는 굴러가요. 하지만 이 레포는 단일 앱이 아니라 **앱 공장** 이에요. 세 가지 압력이 동시에 붙어요.

**압력 A — 러닝 커브 1회로 끝**  
솔로 개발자 본인도, AI 에이전트도, 파생 레포에서 유지보수하게 될 미래의 본인도, 상태 관리 패러다임을 **한 번 배우고 모든 앱에 동일하게 적용** 할 수 있어야 해요. 앱마다 "이 앱은 BLoC, 저 앱은 Riverpod" 이면 제약 2 (시간 희소) 가 N 배로 드는 셈.

**압력 B — 테스트 용이성**  
ViewModel 이 HTTP / SecureStorage / 시계 같은 외부에 직접 의존하면 단위 테스트 자체가 불가능. 대체 가능한 경계 (mock · fake · override) 가 패러다임 수준에서 지원돼야 해요.

**압력 C — 보일러플레이트 최소**  
솔로 개발자에게 "Event 클래스 → Bloc 클래스 → State 클래스 → `mapEventToState` 전환 → `BlocBuilder`" 같은 4파일 체인은 **앱 1개당 10일** 을 더 태워요. 목표는 **ViewModel 1파일 + Screen 1파일** 로 끝내는 것.

이 결정이 답해야 했던 물음이에요.

> 솔로가 N 개 앱에 **한 번 배우고 평생 쓸** 상태 관리 · DI 표준을 고르려면 어떤 선택이 합리적인가?

## 고민했던 대안들

### Option 1 — Pure `setState` + `InheritedWidget`

Flutter 기본 제공. 추가 패키지 없음.

- **장점**: 학습 거의 필요 없음. Flutter 공식 튜토리얼 수준.
- **단점 1**: DI · 의존성 교체가 `InheritedWidget` 상속 체인으로만 가능 → 테스트에서 HTTP 모킹이 지옥.
- **단점 2**: 화면 간 공유 상태 (로그인 토큰, 테마) 가 생길 때마다 `InheritedWidget` 새로 만들어야 함 — 반복 비용.
- **탈락 이유**: 압력 B 위반. 앱 공장의 scale 을 못 버팀.

### Option 2 — BLoC + `bloc_test`

업계 표준 중 하나. Event → State 일방향 흐름 엄격.

- **장점**: 흐름이 극도로 명확. 대규모 팀에서 실수 방지 효과.
- **단점 1**: 1 ViewModel = 3~4 파일 (Event / State / Bloc / mapEventToState). 솔로가 매번 이 오버헤드를 감당 불가.
- **단점 2**: DI 는 `BlocProvider` + `get_it` 같은 별도 패키지 필요 → 2개 패러다임 학습.
- **단점 3**: "event 를 새로 추가 → Bloc 에 handler 추가 → State copyWith" 루프가 피로 누적.
- **탈락 이유**: 압력 C 위반. 대규모 팀 도구를 솔로가 쓰면 과비용.

### Option 3 — GetX

한국·동남아 개발자 사이에 인기. 상태 + DI + 라우팅 통합.

- **장점**: 보일러플레이트 진짜 거의 없음. 빠른 프로토타이핑에 최적.
- **단점 1**: `Get.find` 의 **전역 접근** 이 테스트 격리를 깨뜨림 — 다른 테스트의 상태가 남음.
- **단점 2**: BuildContext 우회 (`Get.to()`, `Get.snackbar()`) 가 표준 Flutter 흐름에서 벗어남 → 공식 도구 (Flutter Inspector 등) 와 호환성 저하.
- **단점 3**: 유지보수 상태가 불안정 — 2024~2025년 major release 간격이 들쭉날쭉.
- **탈락 이유**: 압력 B 심각 위반. 테스트 격리가 안 되면 장기 운영에 부담.

### Option 4 — Riverpod + MVVM ★ (채택)

`flutter_riverpod` 의 `StateNotifier` (채택 당시 기준 — riverpod 3 이관 후엔 `Notifier`) 를 ViewModel 로 쓰고, `ConsumerWidget` 을 Screen 으로, `Provider` 를 DI 컨테이너로 삼음.

- **압력 A 만족**: 상태 + DI 가 **단일 패러다임 (Provider)** 으로 통일. 러닝 커브 1회.
- **압력 B 만족**: `ProviderContainer(overrides: [...])` 로 테스트마다 완전 격리. `overrideWithValue` / `overrideWith` 로 HTTP · 저장소 교체 간단.
- **압력 C 만족**: 1 ViewModel = 1 파일 (`LoginViewModel extends Notifier<LoginState>` + `copyWith`). Event 분리 없음.
- **추가 이점**: `autoDispose` 로 화면 이탈 시 상태 자동 정리 → 메모리 누수 방지. riverpod 3 에서는 기본값이 아니라 명시(`isAutoDispose: true`)해야 해요.

## 결정

`Notifier + ConsumerWidget + NotifierProvider` 조합을 표준으로 못 박아요. (채택 당시 표준은 `StateNotifier + StateNotifierProvider.autoDispose` 였는데, riverpod 3 에서 `StateNotifier` 가 제거돼 2026-08 에 `Notifier` 로 이관했어요 — 교훈 2.)

### ViewModel 표준 형태

```dart
// lib/kits/auth_kit/ui/login/login_view_model.dart 발췌
class LoginState {
  final bool isLoading;
  final String? errorCode;      // ← i18n 키 또는 ErrorCode enum 문자열
  final String? errorMessage;
  final LoginMode mode;

  const LoginState({
    this.isLoading = false,
    this.errorCode,
    this.errorMessage,
    this.mode = LoginMode.signIn,
  });

  LoginState copyWith({bool? isLoading, String? errorCode, String? errorMessage, LoginMode? mode}) {
    return LoginState(
      isLoading: isLoading ?? this.isLoading,
      errorCode: errorCode,
      errorMessage: errorMessage,
      mode: mode ?? this.mode,
    );
  }
}

class LoginViewModel extends Notifier<LoginState> {
  @override
  LoginState build() => const LoginState();   // ← 초기 상태는 build() 가 돌려줘요

  Ref get _ref => ref;                        // ← Ref 는 베이스 클래스가 제공해요

  Future<void> signInWithEmail(String email, String password) async {
    state = state.copyWith(isLoading: true, errorCode: null, errorMessage: null);
    try {
      await _ref.read(authServiceProvider).signInWithEmail(email: email, password: password);
      state = state.copyWith(isLoading: false);
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        errorCode: safeErrorCode(e, fallbackCode: 'LOGIN_FAILED'),  // ← ViewModel 은 code 만
        errorMessage: safeErrorMessage(e),                            // ← 서버가 준 메시지 그대로 (i18n 은 화면에서 code→ARB 매핑)
      );
    }
  }
}

/// riverpod 3 는 `.autoDispose` 수식어 대신 `isAutoDispose:` 인자를 써요 (기본값 false).
final NotifierProvider<LoginViewModel, LoginState> loginViewModelProvider =
    NotifierProvider<LoginViewModel, LoginState>(
      LoginViewModel.new,
      isAutoDispose: true,
    );
```

### Screen 표준 형태

```dart
// 사용 예시 (발췌)
class LoginScreen extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(loginViewModelProvider);
    final vm = ref.read(loginViewModelProvider.notifier);

    return Scaffold(
      body: state.isLoading
        ? const LoadingView()
        : Column(children: [
            if (state.errorMessage != null) ErrorBanner(message: state.errorMessage!),
            PrimaryButton(
              text: S.of(context).signIn,
              onPressed: () => vm.signInWithEmail(email, password),
            ),
          ]),
    );
  }
}
```

### 전역 DI (providers.dart 중앙 집중)

```dart
// lib/common/providers.dart 발췌
final secureStorageProvider = Provider<SecureStorage>((ref) => SecureStorage());
final tokenStorageProvider = Provider<TokenStorage>(
  (ref) => TokenStorage(storage: ref.watch(secureStorageProvider)),
);

// Debug 폴백 (ADR-006) — Kit 이 override 로 교체
final analyticsProvider = Provider<AnalyticsService>((ref) => DebugAnalyticsService());
final crashServiceProvider = Provider<CrashService>((ref) => DebugCrashService());
```

### 설계 선택 포인트

**포인트 1 — autoDispose 는 riverpod 3 에서 기본값이 아니에요**  
riverpod 3 의 provider 는 **기본이 non-autoDispose**(`isAutoDispose = false`) 예요. riverpod 2 의 `StateNotifierProvider.autoDispose` 와 같은 수명을 유지하려면 `isAutoDispose: true` 를 넘겨야 해요 — 빼먹으면 ViewModel 이 앱 수명 내내 살아남아 화면을 떠나도 이전 에러 문구·단계와 private 필드(비밀번호·2FA 토큰)가 남아요. (riverpod 2 시절엔 `StateNotifierProvider.autoDispose` 를 명시했어요). 화면이 stack 에서 빠지면 즉시 dispose → 불필요한 상태 · 구독 누적 방지. 예외는 "앱 전체 수명 = 상태 수명" 인 경우 (예: `authStateProvider`) — 이때는 기본값(non-autoDispose)을 그대로 쓰면 돼요.

**포인트 2 — ViewModel 은 `code` 만, UI 는 i18n 메시지**  
ViewModel 의 `state.errorCode` 는 서버 `ErrorCode` enum 문자열 또는 로컬 키 (`LOGIN_FAILED` 등). 실제 화면 표시 문구는 Screen 에서 `S.of(context).loginFailed` 같이 번역. **이유**: ViewModel 은 `BuildContext` 를 가지지 않으므로 i18n 에 직접 의존하면 안 됨. 테스트에서도 "code 비교" 가 "문구 비교" 보다 깨지지 않아요.

**포인트 3 — 순환 의존은 `ref.read` 콜백으로 해결 (ADR-007 과 연결)**  
`apiClientProvider` 가 `authServiceProvider` 를 필요로 하고, `authServiceProvider` 가 `apiClientProvider` 를 필요로 하는 순환은 `onTokenRefresh: () => ref.read(authServiceProvider).refreshToken()` 같은 **lazy 콜백** 으로 풀어요. 상세는 ADR-007.

**포인트 4 — `copyWith` 는 nullable 파라미터를 그대로 받음**  
`errorMessage: errorMessage ?? this.errorMessage` 가 아니라 `errorMessage: errorMessage` 인 이유는, **명시적으로 `null` 을 넘겨서 에러를 지우는 시나리오** 를 지원하기 위함이에요. `copyWith(errorMessage: null)` 로 에러를 clear. 이 관용 때문에 모든 nullable 필드는 this 폴백을 쓰지 않아요.

## 이 선택이 가져온 것

### 긍정적 결과

- **1 ViewModel = 1 파일**: 신규 화면 추가 비용이 극적으로 낮아요. Event / State / Bloc 분리 없이 `Notifier<MyState>` 한 클래스.
- **테스트 격리 완벽**: `ProviderContainer(overrides: [...])` 로 매 테스트가 독립 공간. `authServiceProvider.overrideWithValue(MockAuthService())` 한 줄로 mock 주입.
- **Kit 과 자연 통합**: ADR-003 의 `providerOverrides` 가 Riverpod 의 override 체인과 그대로 맞물려요. Kit 이 늘어날 때 DI 설계를 다시 안 해도 됨.
- **`autoDispose` 로 메모리 누수 방지**: riverpod 3 에서는 기본값이 아니라 `isAutoDispose: true` 명시가 필요해요. Flutter inspector 에서 "왜 이 화면 나갔는데 아직 stream 구독중?" 류 디버깅 시간 감소.
- **컴파일 안전성**: `ref.watch(loginViewModelProvider)` 반환 타입이 `LoginState` 로 추론 → IDE 자동완성 완벽.

### 부정적 결과

- **Riverpod 학습 곡선**: `Provider` / `NotifierProvider` / `AsyncNotifierProvider` / `FutureProvider` / `StreamProvider` 등 종류가 많아요. "뭘 언제 써야?" 의 결정 피로. 템플릿은 `NotifierProvider` 를 기본으로 못박아 이 피로를 줄여요.
- **메이저 버전 전환 비용은 실제로 발생함**: 채택 당시 "미래에 마이그레이션 비용 발생 가능" 이라 적었는데, riverpod 3.0 에서 `StateNotifier` 가 제거되면서 현실이 됐어요. 2026-08 에 `Notifier` 로 이관 완료 — 다행히 비용은 예상보다 작았어요. 상세는 교훈 2.
- **글로벌 provider 파일 (`providers.dart`) 이 비대해질 위험**: 현재 156줄. 30개 넘으면 쪼개야 해요. 아직은 유지.
- **`copyWith` 의 nullable 관용이 낯섬**: 처음 보는 개발자가 "왜 `this.errorMessage` 폴백이 없지?" 하고 의아해함 — README 에 명시 필요.

## 교훈

### 교훈 1 — "상태 관리 선택 피로" 는 진짜다

Flutter 커뮤니티에선 매년 "어떤 상태 관리가 최고?" 토론이 반복돼요. 앱 공장 관점에서 답은 **"선택하고 잊기"** 예요. "가장 좋은" 이 아니라 "충분히 좋고 변하지 않는" 이 중요해요. Riverpod 이 완벽해서 고른 게 아니라, 5년 뒤에도 **지금 작성한 ViewModel 이 그대로 돌아갈 것** 이라는 신뢰 때문에 고른 거예요.

**교훈**: 솔로 앱 공장에서는 **표준화가 기술적 우수성보다 가치가 커요**. 한 번 고르면 5년 간 바꾸지 말기.

### 교훈 2 — `StateNotifier` vs `Notifier` 전환은 미루기 (2026-08 개정: 결국 이관했어요)

**당시 판단 (2026-04)**: Riverpod 3.0 이 `Notifier` + `AsyncNotifier` 를 새 표준으로 밀고 있지만, `StateNotifier` 도 당분간 deprecated 는 아니니 마이그레이션 가이드가 성숙해질 때까지 기다리는 게 비용 대비 효율이 높다 — 그래서 미루기로 했어요.

**실제 결과 (2026-08)**: `flutter_riverpod` 을 3.4.2 로 올리는 시점에 riverpod 3 가 `StateNotifier` 를 아예 제거해서, 전환에 선택의 여지가 없어졌어요. ViewModel 4개 + PaginationController 1개를 `Notifier` 로 이관했는데, 미룬 덕에 치른 비용은 예상보다 작았어요:

- 형태 변경뿐: 초기 상태는 생성자 대신 `build()` 가 돌려주고, `Ref` 는 베이스 클래스가 제공. **메서드 본문 로직은 전혀 안 바뀌었어요** (`state = state.copyWith(...)` 관용이 `Notifier` 에서도 동일).
- 테스트 631개 전부 통과. `ProviderContainer` / `overrideWithValue` 를 쓰는 테스트 25곳도 수정 없이 그대로 동작.
- 자잘한 차이 두 가지만 흡수: `Override` 타입이 `flutter_riverpod` 에서 재수출되지 않아 `import 'package:riverpod/misc.dart' show Override;` 추가 (AppKit 의 `providerOverrides` 가 `List<Override>` 를 써요), `StateNotifier` 의 `mounted` 는 `ref.mounted` 로 이동.

**교훈**: "당장 깨지나?" × "마이그레이션 도구 있나?" 기준으로 미루는 전략 자체는 유효했지만, 실제 트리거는 "상위 버전에서 제거됨" 이라는 외부 강제였어요. 미루기가 안전하려면 **이관 비용이 작게 유지된다는 조건** 이 필요해요 — 이번엔 상태 갱신 관용(`state` + `copyWith`)이 두 API 에서 동일했던 덕에 성립했어요. 미룬 판단이 맞았다기보다, 전환 비용이 낮은 구조를 유지한 것이 안전판이었어요.

### 교훈 3 — `copyWith` 의 nullable 관용은 문서화 필수

처음 이 규약을 도입했을 때, 다른 ViewModel 에서 `errorMessage: errorMessage ?? this.errorMessage` 로 잘못 썼다가 "에러를 지울 수 없음" 버그가 나왔어요. 이 규약은 **모든 ViewModel 에 동일하게 적용되는 미묘한 불변량** 이라 README · ADR · 코멘트 세 곳에 적어두는 게 맞아요.

**교훈**: 코드 레벨의 미묘한 관용은 자연어 설명 없이는 유지 안 돼요. 전염 가능한 곳에 복수로 적기.

## 관련 사례 (Prior Art)

- [Riverpod 공식 가이드 — Notifier](https://riverpod.dev/docs/essentials/side_effects) — 본 ADR 이 따르는 주 레퍼런스
- [Riverpod 3.0 마이그레이션 가이드](https://riverpod.dev/docs/3.0_migration) — `StateNotifier` 제거와 `Notifier` 이관 경로
- [Flutter MVVM with Riverpod](https://codewithandrea.com/articles/flutter-state-management-riverpod/) — Andrea Bizzotto, MVVM + Riverpod 패턴 정리
- [Reso Coder — Clean Architecture in Flutter](https://resocoder.com/flutter-clean-architecture-tdd/) — ViewModel 계층 분리의 원리
- [BLoC 공식 비교 — Why BLoC?](https://bloclibrary.dev/#/faqs) — BLoC 의 설계 철학 (본 ADR 의 반대편)
- [Remi Rousselet 의 Riverpod 발표](https://www.youtube.com/watch?v=BJMcvDb9-c0) — Provider → Riverpod 동기 부여

## Code References

**전역 DI**
- [`lib/common/providers.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/common/providers.dart) — 156줄, 모든 전역 Provider 정의
- [`lib/main.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/main.dart) — `ProviderContainer` 생성 + `UncontrolledProviderScope` 주입

**ViewModel 파일럿**
- [`lib/kits/auth_kit/ui/login/login_view_model.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/auth_kit/ui/login/login_view_model.dart) — 본 ADR 의 샘플. 227줄
- [`lib/kits/auth_kit/ui/password_reset/password_reset_view_model.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/auth_kit/ui/password_reset/password_reset_view_model.dart)
- [`lib/kits/auth_kit/ui/verify_email/verify_email_view_model.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/auth_kit/ui/verify_email/verify_email_view_model.dart)

**테스트 패턴**
- [`test/kits/auth_kit/ui/login_view_model_test.dart`](https://github.com/storkspear/template-flutter/blob/main/test/kits/auth_kit/ui/login_view_model_test.dart) — `ProviderContainer(overrides:)` 로 mock 주입

**관련 ADR**:
- [`ADR-003 · FeatureKit 동적 레지스트리`](./adr-003-featurekit-registry.md) — Kit 의 `providerOverrides` 가 본 ADR 의 Provider 체인과 맞물림
- [`ADR-006 · 인터페이스 기반 서비스 교체 + Debug 폴백`](./adr-006-debug-fallback.md) — Debug 구현체 → 실제 구현체로 교체하는 override 패턴
- [`ADR-007 · Late Binding 으로 순환 의존 해결`](./adr-007-late-binding.md) — `apiClient ↔ authService` 순환을 `ref.read` 콜백으로 해결
- [`ADR-011 · 인터셉터 체인 + ErrorInterceptor`](./adr-011-interceptor-chain.md) — ViewModel 이 받는 `ApiException` 이 어디서 만들어지는지
