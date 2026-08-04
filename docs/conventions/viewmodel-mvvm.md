# ViewModel + MVVM 패턴

Screen 은 UI 만, ViewModel 은 로직만 맡아요. 상태 관리는 `Notifier<TState>` + `ConsumerWidget` 조합 하나로 통일해요. 이 규약의 근거는 [`ADR-005 · Riverpod + MVVM`](../philosophy/adr-005-riverpod-mvvm.md) 를 참조하세요.

---

## 기본 구조

```text
features/<domain>/
├── <domain>_screen.dart         # UI 전용
├── <domain>_view_model.dart     # State 클래스 + ViewModel 클래스 + Provider
└── models/                       # (필요 시) 도메인 모델
```

---

## State 클래스

불변 데이터 클래스예요. `copyWith` 로 갱신해요.

```dart
class LoginState {
  final bool isLoading;
  final String? errorCode;     // ← i18n 키 or ErrorCode 상수
  final String? errorMessage;  // ← 서버 제공 메시지 (nullable)
  final LoginMode mode;

  const LoginState({
    this.isLoading = false,
    this.errorCode,
    this.errorMessage,
    this.mode = LoginMode.signIn,
  });

  LoginState copyWith({
    bool? isLoading,
    String? errorCode,
    String? errorMessage,
    LoginMode? mode,
  }) {
    return LoginState(
      isLoading: isLoading ?? this.isLoading,
      errorCode: errorCode,         // ← nullable 폴백 없이 그대로 받음
      errorMessage: errorMessage,   // ← null 로 clear 가능
      mode: mode ?? this.mode,
    );
  }
}
```

### copyWith 의 nullable 관용

```dart
// ❌ 잘못된 copyWith (에러를 지울 수 없음)
errorMessage: errorMessage ?? this.errorMessage

// ✅ 올바른 copyWith (null 로 명시적 clear 가능)
errorMessage: errorMessage
```

이유는 `copyWith(errorMessage: null)` 로 에러 state 를 clear 하는 게 관용적이기 때문이에요. 기본값 폴백을 넣으면 이 시나리오가 안 돼요. 모든 nullable 필드는 this 폴백 없이 그대로 받아요.

---

## ViewModel 클래스

`Notifier<TState>` 를 상속해요. 초기 상태는 `build()` 가 돌려주고, `Ref` 는 베이스 클래스가 `ref` 로 제공해요.

```dart
class LoginViewModel extends Notifier<LoginState> {
  @override
  LoginState build() => const LoginState();

  Ref get _ref => ref;

  Future<void> signInWithEmail(String email, String password) async {
    // 1. 로딩 시작 + 이전 에러 clear
    state = state.copyWith(
      isLoading: true,
      errorCode: null,
      errorMessage: null,
    );

    try {
      // 2. Service 호출
      await _ref.read(authServiceProvider).signInWithEmail(
        email: email,
        password: password,
      );
      // 3. 성공 → 로딩 해제
      state = state.copyWith(isLoading: false);
    } catch (e) {
      // 4. 실패 → code + message 저장
      state = state.copyWith(
        isLoading: false,
        errorCode: safeErrorCode(e, fallbackCode: 'LOGIN_FAILED'),
        errorMessage: safeErrorMessage(e),
      );
    }
  }

  void toggleMode() {
    state = state.copyWith(
      mode: state.mode == LoginMode.signIn ? LoginMode.signUp : LoginMode.signIn,
      errorCode: null,
      errorMessage: null,
    );
  }
}
```

### ViewModel 규칙

- **`BuildContext` 를 받지 않아요** — UI 의존 금지예요. `S.of(context)` 도 금지고, i18n 은 Screen 에서 해요
- **`try/catch` 로 에러를 처리해요** — `safeErrorCode` · `safeErrorMessage` 로 안전하게 추출해요 ([`ADR-009`](../philosophy/adr-009-backend-contract.md))
- **외부 서비스는 `_ref.read` 로 조회해요** — 상태 변경 시점에만 읽어요 ([`ADR-007`](../philosophy/adr-007-late-binding.md))
- **`_ref.watch` 는 지양해요** — ViewModel 내부에서 watch 를 쓰면 재생성 체인이 복잡해져요

---

## Provider 선언

`NotifierProvider` 가 기본이에요. 같은 파일 하단에 선언해요.

```dart
final NotifierProvider<LoginViewModel, LoginState> loginViewModelProvider =
    NotifierProvider<LoginViewModel, LoginState>(
  LoginViewModel.new,
  // 화면 단위 ViewModel 은 필수. 기본값이 non-autoDispose 라 빼면 화면을 떠나도 상태가 남는다.
  isAutoDispose: true,
);
```

### autoDispose 를 명시하는 이유

riverpod 3 의 provider 는 기본이 non-autoDispose 라, 화면 단위 ViewModel 에는 `isAutoDispose: true` 를 명시해야 이렇게 동작해요.

- 화면 이탈 시 자동으로 정리돼요 → 메모리 누수를 방지해요
- 재진입 시 **초기 상태로 시작해요** → 예전 에러 · 로딩이 남아있는 걸 방지해요

### autoDispose 예외 (전역 수명)

`authStateProvider` 같이 **앱 전체 수명** 상태는 autoDispose 하지 않아요:

```dart
// lib/common/providers.dart 발췌
final authStateProvider = Provider<AuthStateNotifier>((ref) {
  final notifier = AuthStateNotifier();
  ref.onDispose(notifier.dispose);
  return notifier;
});
```

---

## Screen 구조

`ConsumerWidget` 이 기본이에요. `ref.watch` 로 상태를 구독하고, `ref.read` 로 액션을 호출해요. 아래 예시는 `TextEditingController` 가 필요해서 `ConsumerStatefulWidget` 이에요 (아래 Screen 규칙 4번).

```dart
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(loginViewModelProvider);
    final vm = ref.read(loginViewModelProvider.notifier);
    final s = S.of(context);

    return Scaffold(
      appBar: AppBar(title: Text(s.login)),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            // 에러 배너
            if (state.errorCode != null)
              ErrorBanner(message: _localizedError(context, state.errorCode!)),

            // 입력 필드
            AppTextField(controller: _emailController, labelText: s.email),
            AppTextField(
              controller: _passwordController,
              labelText: s.password,
              obscureText: true,
            ),

            const SizedBox(height: 16),

            // 버튼 (로딩 상태 전달)
            PrimaryButton(
              text: s.login,
              isLoading: state.isLoading,                  // ← state 구독
              onPressed: () => vm.signInWithEmail(         // ← action 호출
                _emailController.text,
                _passwordController.text,
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _localizedError(BuildContext context, String code) {
    final s = S.of(context);
    switch (code) {
      case 'LOGIN_FAILED':
      case 'ATH_001':                                      // ErrorCode.invalidCredentials
        return s.loginFailed;
      case 'NETWORK_ERROR': return s.errorNetworkUnavailable;
      default: return s.errorUnknown;
    }
  }
}
```

### Screen 규칙

- **`ref.watch` = 상태 구독이에요** — 값이 변경되면 리빌드돼요
- **`ref.read` = 단발성 호출이에요** — `.notifier` 로 ViewModel 메서드를 호출할 때 써요
- **`if (mounted)` 체크는 필요 없어요** — StatelessWidget 이라 life cycle 간섭이 없어요
- **`StatefulWidget` 은 `TextEditingController` 등 controller 가 필요할 때만 써요** — 그 외엔 `ConsumerWidget` 을 써요

---

## Service 레이어

ViewModel 이 의존하는 로직이에요. `lib/core/` 또는 `lib/kits/<kit>/` 에 정의해요.

```dart
// lib/kits/auth_kit/auth_service.dart 개요
class AuthService {
  final ApiClient _apiClient;
  final TokenStorage _tokenStorage;
  final AuthStateNotifier _authState;

  AuthService({
    required ApiClient apiClient,
    required TokenStorage tokenStorage,
    required AuthStateNotifier authState,
  }) : _apiClient = apiClient,
       _tokenStorage = tokenStorage,
       _authState = authState;

  Future<void> signInWithEmail({required String email, required String password}) async {
    // 실제 구현은 lib/kits/auth_kit/auth_service.dart 참조 — 여기는 패턴 예시
    final response = await _apiClient.postRaw(
      ApiEndpoints.emailSignIn,  // '/api/apps/{slug}/auth/email/signin'
      data: {'email': email, 'password': password},
    );
    // Spring AuthResponse 구조: { user, tokens: { accessToken, refreshToken } }
    final data = response.data as Map<String, dynamic>;
    final tokens = (data['tokens'] as Map<String, dynamic>?) ?? data;
    await _tokenStorage.saveTokens(
      accessToken: tokens['accessToken'] as String,
      refreshToken: tokens['refreshToken'] as String,
    );
    _authState.emit(AuthState.authenticated(/* CurrentUser.fromJwt */));
  }

  // ...
}
```

Service 는 **Provider 를 몰라요** — 생성자로 의존성을 주입받을 뿐이에요. Provider 설정은 `providers.dart` 에서 해요:

```dart
// lib/common/providers.dart 발췌
final authServiceProvider = Provider<AuthService>((ref) {
  return AuthService(
    apiClient: ref.watch(apiClientProvider),
    tokenStorage: ref.watch(tokenStorageProvider),
    authState: ref.watch(authStateProvider),
  );
});
```

---

## 전체 흐름 예시 (로그인)

```text
LoginScreen 의 PrimaryButton onPressed
  ↓
ref.read(loginViewModelProvider.notifier).signInWithEmail(...)
  ↓
LoginViewModel.signInWithEmail()
  ↓ state = copyWith(isLoading: true)
  ↓ UI 자동 리빌드 → 버튼 스피너 표시
  ↓
_ref.read(authServiceProvider).signInWithEmail(email, password)
  ↓
AuthService → ApiClient.postRaw(ApiEndpoints.emailSignIn, ...) → JWT 토큰 저장 → authState.emit(authenticated)
  ↓ (authState 변화 → go_router refreshListenable 트리거 → /home 으로 이동)
  ↓
LoginViewModel 로 복귀 → state = copyWith(isLoading: false)
```

에러가 나면 이렇게 흘러요:
```text
AuthService 가 ApiException(code: 'ATH_001') throw  ← Spring AuthError.INVALID_CREDENTIALS
  ↓
LoginViewModel catch → state = copyWith(errorCode: 'ATH_001', errorMessage: '...')
  ↓ UI 리빌드 → ErrorBanner 표시 + 스피너 해제
```

---

## 자주 하는 실수

### ❌ ViewModel 에서 BuildContext 쓰기

```dart
// 금지
class BadViewModel extends Notifier<...> {
  Future<void> doSomething(BuildContext context) async {  // ← context 받지 말기
    ScaffoldMessenger.of(context).showSnackBar(...);      // ← 금지
  }
}
```

**올바르게**: ViewModel 은 state 에 `showSnackbar: true` 같은 플래그만 세팅해요. Screen 이 watch 해서 SnackBar 를 띄워요.

### ❌ ViewModel 이 직접 ApiClient · SecureStorage 생성

```dart
// 금지
class BadViewModel extends Notifier<...> {
  final _client = ApiClient();  // ← 금지
  // ...
}
```

**올바르게**: 의존성은 `_ref.read` 또는 생성자 주입으로 받아요.

### ❌ copyWith 에 nullable 폴백

```dart
// 금지 — 에러를 clear 할 수 없음
state = state.copyWith(errorMessage: errorMessage ?? this.errorMessage);

// 올바르게
state = state.copyWith(errorMessage: errorMessage);  // null 도 값으로 받음
```

### ❌ Screen 에서 ViewModel 메서드 직접 정의

```dart
// 금지
class LoginScreen extends ConsumerWidget {
  Future<void> _handleSignIn() async {
    // 비즈니스 로직을 Screen 에
    await http.post(...);
  }
}
```

**올바르게**: 비즈니스 로직은 ViewModel 로 옮겨요. Screen 은 `vm.signInWithEmail()` 만 호출해요.

---

## 관련 문서

- [`naming.md`](./naming.md) — ViewModel · State · Provider 네이밍
- [`error-handling.md`](./error-handling.md) — ViewModel 의 `safeErrorCode` 사용
- [`ADR-005 · Riverpod + MVVM`](../philosophy/adr-005-riverpod-mvvm.md) — 이 규약의 근거
- [`ADR-007 · Late Binding`](../philosophy/adr-007-late-binding.md) — `ref.read` 사용의 근거
