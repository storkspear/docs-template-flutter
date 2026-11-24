<a id="viewmodel--mvvm-패턴"></a>

# ViewModel + MVVM 패턴

ViewModel은 `Notifier<TState>`로 화면 상태와 서비스 호출을 관리해요. 화면은 `ref.watch`로 상태를 읽고 사용자 입력을 ViewModel에 전달해요. 단순 화면은 `ConsumerWidget`, 컨트롤러나 초기화 수명이 필요한 화면은 `ConsumerStatefulWidget`을 사용해요. 비동기 작업 뒤에는 provider나 위젯이 아직 살아 있는지 확인해요.

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

불변 데이터 클래스이며 `copyWith`로 갱신해요. 아래는 오류 상태와 로그인 모드만 보여주는 축약 예제예요. 실제 `LoginState`에는 회원가입 단계(`signupStage`), 개발용 코드(`devCode`), 2FA 전환 신호(`twoFactorRequired`)도 있어요. `LoginMode`는 같은 파일에 정의된 `signIn`·`signUp` 열거형이에요.

```dart
class LoginState {
  final bool isLoading;
  final String? errorCode;     // 서버 오류 코드 또는 AuthLocalErrorCode 같은 로컬 코드
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

오류 메시지는 상태가 바뀔 때 지울 수 있어야 해요. 반면 인증 코드나 2FA 비밀값처럼 다음 단계에서도 필요한 nullable 필드는 기존 값을 유지해야 할 수 있어요. 모든 nullable 필드에 같은 `copyWith` 규칙을 적용하지 말고, 각 필드의 초기화·유지·삭제 시점을 정해요.

---

## ViewModel 클래스

`Notifier<TState>` 를 상속해요. 초기 상태는 `build()` 가 돌려주고, `Ref` 는 베이스 클래스가 `ref` 로 제공해요.

아래는 실제 `LoginViewModel`의 이메일 로그인 메서드와 공통 후처리를 발췌한 예제예요. 클래스의 `build()`, 회원가입·소셜 로그인·2FA 제출 메서드는 생략했어요. `build()`와 모드 전환에서는 `_clearPending()`으로 이전 인증 정보를 지워요.

```dart
Future<void> signInWithEmail(String email, String password) async {
  state = state.copyWith(isLoading: true);
  try {
    final twoFactorToken = await ref
        .read(authServiceProvider)
        .signInWithEmail(email: email, password: password);
    _completeSignIn(twoFactorToken);
  } catch (e) {
    if (!ref.mounted) return;
    state = state.copyWith(
      isLoading: false,
      errorCode: safeErrorCode(e, fallbackCode: AuthLocalErrorCode.login),
      errorMessage: safeErrorMessage(e),
    );
  }
}

void _completeSignIn(String? twoFactorToken) {
  if (!ref.mounted) return;
  if (twoFactorToken != null) {
    _pendingTwoFactorToken = twoFactorToken;
    state = state.copyWith(isLoading: false, twoFactorRequired: true);
    return;
  }
  state = state.copyWith(isLoading: false);
}
```

2FA가 필요하면 임시 토큰은 ViewModel의 private 필드에 보관하고, 화면에는 `twoFactorRequired`만 알려요. 이 단계에서는 아직 로그인 완료 상태를 알리지 않아요.

### ViewModel 규칙

- **비동기 완료 후 화면 수명을 확인해요** — 성공과 catch 모두 `state`를 읽기 전에 `ref.mounted`를 검사해요. 화면 종료가 서비스의 토큰 저장이나 이미 시작한 가입 처리를 취소한다는 뜻은 아니에요.

- **`BuildContext` 를 받지 않아요** — UI 의존 금지예요. `S.of(context)` 도 금지고, i18n 은 Screen 에서 해요
- **`try/catch`로 오류 상태를 갱신해요** — `safeErrorCode`와 `safeErrorMessage`는 지원하는 예외에서 값을 꺼내요. 메시지의 민감 정보를 제거하는 함수는 아니에요([오류 처리 규칙](./error-handling.md)).
- **외부 서비스는 호출 시점에 `ref.read`로 조회해요** — ViewModel이 사용하는 서비스 인스턴스를 필드에 고정하지 않아요([ADR-007](../philosophy/adr-007-late-binding.md)).
- **ViewModel 내부의 `ref.watch`는 신중히 사용해요** — 의존 상태가 바뀔 때 ViewModel이 다시 초기화되는 흐름까지 의도한 경우에 사용해요.

---

## Provider 선언

`NotifierProvider` 가 기본이에요. 같은 파일 하단에 선언해요.

```dart
final NotifierProvider<LoginViewModel, LoginState> loginViewModelProvider =
    NotifierProvider<LoginViewModel, LoginState>(
  LoginViewModel.new,
  // 화면의 마지막 구독이 사라지면 정리되도록 설정해요.
  isAutoDispose: true,
);
```

### autoDispose 를 명시하는 이유

화면 단위 ViewModel에는 `isAutoDispose: true`를 명시해요. 마지막 구독이 사라지면 provider가 정리 대상이 되고, 정리된 뒤 다시 구독하면 `build()`에서 초기 상태를 만들어요. 화면 위에 다른 경로를 `push`해 기존 화면의 구독이 남아 있거나 다른 곳에서도 구독 중이면 즉시 정리되지 않아요. 따라서 화면 전환 자체가 상태 초기화를 보장하지는 않아요.

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

`ConsumerWidget`이 기본이에요. `ref.watch`로 상태를 구독하고, `ref.read`로 액션을 호출해요. 아래 예시는 컨트롤러의 수명이 필요한 `ConsumerStatefulWidget`에서 이메일 로그인 부분을 간소화한 거예요. 실제 화면은 가입 단계·소셜 로그인도 제공해요. `resolveAuthErrorText`는 `kits/auth_kit/ui/auth_error_text.dart`에서 가져와요.

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
    final errorText = resolveAuthErrorText(
      state.errorMessage,
      state.errorCode,
      s,
    );
    ref.listen(loginViewModelProvider, (previous, next) {
      if (!(previous?.twoFactorRequired ?? false) && next.twoFactorRequired) {
        context.push('/login/2fa');
      }
    });

    return Scaffold(
      appBar: AppBar(title: Text(s.login)),
      body: Padding(
        padding: AppSpacing.screenPadding,
        child: Column(
          children: [
            if (errorText != null)
              Text(
                errorText,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),

            // 입력 필드
            AppTextField(controller: _emailController, labelText: s.email),
            AppTextField(
              controller: _passwordController,
              labelText: s.password,
              obscureText: true,
            ),

            const SizedBox(height: AppSpacing.md),

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
}
```

### Screen 규칙

- **`ref.watch` = 상태 구독이에요** — 값이 변경되면 리빌드돼요
- **`ref.read` = 단발성 호출이에요** — `.notifier` 로 ViewModel 메서드를 호출할 때 써요
- 위젯 종류와 관계없이 `await` 뒤에 `BuildContext`를 쓰면 `context.mounted`를 확인해요. ViewModel에서 비동기 작업 뒤 상태를 바꿀 때는 `ref.mounted`를 확인해요.
- **화면 수명을 관리해야 하면 `ConsumerStatefulWidget`을 써요** — 컨트롤러, `initState`·`dispose`, 수명에 묶인 구독 등이 필요한 경우예요. 그 밖에는 `ConsumerWidget`을 사용해요.

---

## Service 레이어

ViewModel 이 의존하는 로직이에요. `lib/core/` 또는 `lib/kits/<kit>/` 에 정의해요.

아래는 실제 `AuthService`의 메서드 발췌예요. 생성자와 내부 헬퍼는 같은 파일에 있어요.

```dart
Future<String?> signInWithEmail({
  required String email,
  required String password,
}) async {
  final response = await _apiClient.postRaw(
    ApiEndpoints.emailSignIn,
    data: {'email': email, 'password': password},
  );
  _ensureSuccess(response);
  return _handleAuthResponse(response.data as Map<String, dynamic>);
}
```

`_ensureSuccess`는 실패 응답을 오류로 처리해요. `_handleAuthResponse`는 2FA 대기 응답이면 임시 토큰을 반환해요. 일반 로그인 성공이면 `tokens` 안의 토큰을 저장하고 인증 상태를 알린 뒤 `null`을 반환해요. 따라서 호출자는 반환값을 확인해야 해요.

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

기본 경로를 기준으로 한 흐름이에요. 파생 앱에서 `AuthKit`의 경로 인자를 바꾸면 목적지도 달라져요.

```text
LoginScreen의 버튼 → LoginViewModel.signInWithEmail()
  ↓ isLoading: true → 버튼 스피너
AuthService → ApiClient.postRaw(ApiEndpoints.emailSignIn, ...)
  ├─ 일반 성공: 토큰 저장 → 인증 상태 알림 → 라우터가 기본 홈 /로 이동
  └─ 2FA 대기: 임시 토큰 반환 → ViewModel에 보관
       → twoFactorRequired: true → 화면의 ref.listen이 /login/2fa로 이동
  ↓
ViewModel이 아직 살아 있으면 로딩 상태 해제
```

오류가 나면 ViewModel이 `safeErrorCode`와 `safeErrorMessage`로 상태를 갱신해요. 화면은 `resolveAuthErrorText`로 표시할 문구를 정하고 스피너를 해제해요. 이때도 상태 갱신 전에 `ref.mounted`를 확인해요.

---

## 자주 하는 실수

<a id="-viewmodel-에서-buildcontext-쓰기"></a>

### ❌ ViewModel 에서 BuildContext 쓰기

```dart
// 금지
class BadViewModel extends Notifier<...> {
  Future<void> doSomething(BuildContext context) async {  // ← context 받지 말기
    ScaffoldMessenger.of(context).showSnackBar(...);      // ← 금지
  }
}
```

**올바르게**: ViewModel은 작업 결과를 상태로 알려요. Screen은 `ref.listen`에서 필요한 상태 전이를 확인해 `AppSnackBar.show`를 호출해요. `ref.watch`로 만드는 UI의 빌드 과정에서 스낵바를 띄우지 않아요.

<a id="-viewmodel-이-직접-apiclient--securestorage-생성"></a>

### ❌ ViewModel 이 직접 ApiClient · SecureStorage 생성

```dart
// 금지
class BadViewModel extends Notifier<...> {
  final _client = ApiClient();  // ← 금지
  // ...
}
```

**올바르게**: ViewModel은 `ref.read`로 서비스를 읽고, 서비스가 필요한 다른 의존성은 생성자로 받아요.

<a id="-copywith-에-nullable-폴백"></a>

### ❌ copyWith 에 nullable 폴백

오류 필드처럼 새 작업에서 지워야 하는 값에 `?? this.errorMessage`를 쓰면 이전 오류가 남아요. 다음 단계까지 유지할 nullable 필드는 앞의 [copyWith 설명](#copywith-의-nullable-관용)처럼 별도로 판단해요.

```dart
// 금지 — 에러를 clear 할 수 없음
state = state.copyWith(errorMessage: errorMessage ?? this.errorMessage);

// 올바르게
state = state.copyWith(errorMessage: errorMessage);  // null 도 값으로 받음
```

<a id="-screen-에서-viewmodel-메서드-직접-정의"></a>

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
