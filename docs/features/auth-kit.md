<a id="auth_kit"></a>

# auth_kit

이메일·비밀번호와 Google·Apple·Kakao·Naver 로그인을 제공해요. 로그인, 비밀번호 재설정·변경, 이메일 인증, 2FA 화면을 포함하며 HTTP 통신에는 `BackendApiKit`이 필요해요. 활성화할 로그인 방식과 2FA 관리 화면은 파생 앱의 조립에서 선택해요.

---

## 개요

토큰은 `TokenStorage`가 순서대로 저장하고 실패 시 정리를 시도해요. 401 갱신은 인터셉터가 인증 서비스에 위임하며, 부팅 시 `AuthCheckStep`이 로컬 토큰 상태를 확인하고 필요하면 갱신해요. 기본 라우트는 로그인·비밀번호 찾기·이메일 인증·비밀번호 변경·로그인 2FA의 다섯 개예요. `twoFactorEnabled`를 켜면 설정 2FA 허브와 setup·disable·backup-codes 네 경로를 추가해요.

---

## 활성화

```yaml
# app_kits.yaml
kits:
  backend_api_kit: {}
  auth_kit: {}
```

```dart
// lib/main.dart
await AppKits.install([
  BackendApiKit(),
  AuthKit(
    providers: const {
      AuthProvider.email,
      AuthProvider.google,
      AuthProvider.apple,
      // AuthProvider.kakao, AuthProvider.naver  // 한국 시장 앱일 때 활성화
    },
  ),
  // ...
]);
```

> `providers` 는 YAML 선언과 Dart 의 AuthKit 구성에서 함께 맞춰요. configure_app 은 YAML 의 지원 provider 이름을 검사하지만 `main.dart` 의 실제 값과 일치하는지까지 비교하지는 않아요.

의존성 순서에 주의하세요 — `backend_api_kit` 이 먼저예요.

---

## 제공 기능

| 항목 | 설명 |
|------|------|
| `AuthService` | 로그인 · 가입 · 로그아웃 · refresh · withdraw |
| `AuthStatus` (enum: `unknown` · `authenticated` · `unauthenticated`) | 앱 인증 상태 enum |
| `AuthState` (클래스: `status` + `user`) | enum + `CurrentUser?` 묶음 |
| `AuthStateNotifier` | 상태 브로드캐스트 (Stream) |
| `CurrentUser` | 로그인된 유저 정보 |
| `TokenStorage` | SecureStorage 기반 토큰 저장 (core 제공) |
| `AuthCheckStep` | 부팅 시 토큰 유효성 검증 |
| `LoginScreen` · `PasswordResetScreen` · `VerifyEmailScreen` | 표준 UI |
| `LoginViewModel` · `PasswordResetViewModel` · `VerifyEmailViewModel` | 로직 |

---

## 핵심 API

### AuthService

```dart
// 이메일 로그인
await authService.signInWithEmail(email: 'x@y.com', password: 'pw');

// 가입 — verify-before-signup 3단계 (이메일 코드 인증 후 계정 생성)
//   1) 코드 발송 (dev/non-prod 백엔드는 devCode 를 응답에 담아줘요. prod 는 null + 메일 발송)
final devCode = await authService.sendSignupCode(email: 'x@y.com');
//   2) 코드 검증 → proofToken (약 30분 유효)
final proofToken = await authService.verifySignupCode(
  email: 'x@y.com',
  code: '123456',
);
//   3) proofToken 과 함께 계정 생성 (성공 시 자동 로그인)
await authService.signUpWithEmail(
  email: 'x@y.com',
  password: 'pw',
  displayName: 'Alice',
  proofToken: proofToken,
);
// LoginScreen 은 이 3단계를 signUp 모드 내부 단계(enterDetails → enterCode)로 자동 처리해요.

// 소셜 로그인 — 각 provider SDK 로 받은 토큰을 인자로 전달
await authService.signInWithGoogle(idToken: googleIdToken);
await authService.signInWithApple(identityToken: appleIdentityToken);
await authService.signInWithKakao(accessToken: kakaoAccessToken);
await authService.signInWithNaver(accessToken: naverAccessToken);

// 비번 재설정 요청 / 확정
await authService.requestPasswordReset(email: 'x@y.com');
await authService.confirmPasswordReset(
  email: 'x@y.com', // 요청 때 입력한 이메일 — 서버가 코드를 그 계정과만 대조
  token: 'code-from-email',
  newPassword: 'new',
);

// 이메일 인증 / 재발송 — email 은 인증 대상 계정 이메일 (세션 프로필 값)
await authService.verifyEmail(email: 'x@y.com', token: 'token-from-email');
await authService.resendEmailVerification();

// 로그아웃 — 로컬 정리 후 서버에 refresh token 폐기 요청 (best-effort)
await authService.signOut();

// 회원 탈퇴 — 서버가 204 로 성공해야 로컬 정리. 실패하면 세션을 유지한 채
// ApiException (화면이 안내 후 재시도). 401 거절은 refresh 정리 흐름이 처리.
await authService.withdraw();

// 토큰 갱신 (AuthInterceptor 가 401 시 자동 호출하므로 직접 호출 거의 불필요)
final success = await authService.refreshToken();
```

> 보통은 `LoginScreen` 이 제공하는 SocialLoginBar 위젯이 provider SDK 호출 + 토큰 추출 + `signInWithXxx()` 호출까지 처리하므로 직접 호출할 일은 드물어요. 커스텀 로그인 화면을 작성할 때만 위 메서드를 직접 사용해요.

### AuthState 구독

```dart
// Screen
final state = ref.watch(authStreamProvider);
state.whenData((auth) {
  if (auth.isAuthenticated) { /* 로그인 */ }
});

// Service 내부 (sync)
final current = ref.read(authStateProvider).current;
if (current.isAuthenticated) { /* ... */ }
```

`authStreamProvider` 는 구독 즉시 **현재 상태**를 먼저 내려줘요. 세션 복원은 `runApp` 전(스플래시) 에 끝나기 때문에, 변경만 흘리는 stream 이었다면 앱이 켜진 뒤 구독한 화면은 다음 로그인/로그아웃까지 `loading` 에 머물러요.

---

## 라우팅

`auth_kit` 이 기여하는 라우트:

| 경로 | 화면 | 용도 |
|------|------|------|
| `/login` | `LoginScreen` | 이메일/소셜 로그인 · 가입 토글 |
| `/forgot-password` | `PasswordResetScreen` | 비번 재설정 요청 |
| `/verify-email` | `VerifyEmailScreen` | 이메일 인증 (가입 후) |
| `/settings/password` | `PasswordChangeScreen` | 비번 변경 (로그인 상태 — 현재 비번으로 본인 확인) |
| `/login/2fa` | `TwoFactorLoginScreen` | 2FA 2단계 로그인 (서버 결정 — 상시 등록) |
| `/settings/2fa`(+`/setup`·`/disable`·`/backup-codes`) | `TwoFactor*Screen` | 2FA 관리 (**`twoFactorEnabled: true`** 일 때만) |

### 리다이렉트 규칙

`AuthKit.buildRedirect()`:

```text
상태 = unknown (부팅 중)
  → splash 로 유지 (홈 깜빡임 방지)

상태 = unauthenticated
  → 인증 흐름 (/login · /forgot-password · /verify-email · /login/2fa) 만 허용
  → 그 외 경로 접근 시 /login 으로

상태 = authenticated
  → /login · /forgot-password · /login/2fa 접근 시 homePath (기본 '/') 로 리다이렉트
  → /verify-email 은 인증 후에도 접근 허용 (보안 이벤트)
```

### 경로 커스터마이징 (파생 레포에서)

`AuthKit` 의 default 값:
- `loginPath: '/login'`, `homePath: '/'`, `splashPath: '/splash'`
- `forgotPasswordPath: '/forgot-password'`, `verifyEmailPath: '/verify-email'`
- `changePasswordPath: '/settings/password'`

이 경로들은 **Flutter GoRouter 의 클라 라우트** 예요 (백엔드 API endpoint 와 무관). 파생 레포가 변경하려면:

```dart
AuthKit(
  providers: const {AuthProvider.email, AuthProvider.google},
  loginPath: '/sign-in',          // 클라 라우트만 변경
  homePath: '/dashboard',
  forgotPasswordPath: '/reset-password',
)
```

> API endpoint (`/api/apps/{slug}/auth/email/signin` 등) 는 [`api_endpoints.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/backend_api_kit/api_endpoints.dart) 에서 관리해요. 백엔드와 1:1 로 일치해야 해서 일반적으로 변경하지 않아요.

---

## 시연 모드 (Dev Mock)

백엔드와 OAuth 키 없이 인증 화면 흐름을 확인하는 개발용 모드예요. 실제 인증·권한·토큰 검증을 대신하는 테스트는 아니에요.

```bash
flutter run --dart-define=AUTH_DEV_MOCK=true
```

활성 조건: dart-define 주입 + 백엔드 unreachable. 자동으로 `BackendReachability.probe()` 가 baseUrl 의 `/actuator/health` 핑 → 실패 시 `DevOfflineAuthInterceptor` 가 `/auth/*` 응답을 fake JWT 로 가로채요.

> release 에서는 개발용 mock 을 사용하지 않아요. `AUTH_DEV_MOCK=true` 를 명시하면 소셜 인증 coordinator 생성 시 release 가드가 오류를 던져요. 래퍼도 release 실행에서는 mock 자동 폴백을 켜지 않아요.

자세한 메커니즘 · 핵심 코드 위치 · 운영 빌드 안전장치는 [`auth_kit/README.md` Dev Mock 섹션](../../lib/kits/auth_kit/README.md#dev-mock-백엔드-없이-시연) 을 참고하세요.

---

## 일반 사용 예

### 로그인 화면 (이미 제공됨)

`/login` 라우트는 `AuthKit` 이 자동으로 기여해요. 파생 레포에서 커스텀 로그인 화면을 원하면 위 경로를 override 하고 자체 Screen 을 등록하면 돼요.

### 로그아웃 버튼

```dart
// 설정 화면 등
ElevatedButton(
  onPressed: () async {
    await ref.read(authServiceProvider).signOut();
    // authState 변화 → 라우터 자동으로 /login 리다이렉트
  },
  child: Text(s.logout),
)
```

### 현재 유저 정보 표시

```dart
class ProfileScreen extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authStreamProvider);
    return auth.when(
      data: (state) {
        if (state.user == null) return const SizedBox();
        // CurrentUser 는 JWT 클레임 기반 4필드: userId · email · appSlug · role
        return Text('Hi, ${state.user!.email}');
      },
      loading: () => const LoadingView(),
      error: (e, _) => Text('Error: $e'),
    );
  }
}
```

### 401 처리

ViewModel 은 요청 실패를 화면 상태로 전달해요. 갱신 토큰의 거절에 따른 세션 정리는 AuthService 가 처리하므로, 원 요청의 401 만 보고 무조건 로그아웃하지 않아요.

```dart
try {
  final data = await repo.fetchData();
  if (!ref.mounted) return;
  // data 로 화면 상태를 갱신해요.
} catch (e) {
  if (!ref.mounted) return;
  state = state.copyWith(errorCode: safeErrorCode(e));
}
```

이 코드는 기존 ViewModel 메서드 안에 넣는 일부 예제예요. 네트워크·서버 장애로 갱신이 실패한 경우에는 기존 토큰을 보존해요.

---

## 파생 레포 체크리스트

### Google Sign-In

- [ ] 사용할 플랫폼의 OAuth Client ID 와 앱 식별자를 발급·등록해요.
- [ ] Android SHA 지문은 Google/Firebase 콘솔에 등록하고, dev/prod 의 package name 과 설정 파일을 맞춰요.
- [ ] iOS 는 환경별 plist 와 reversed Client ID 설정을 확인해요.
- [ ] 세부 절차는 [Google/Apple 통합 가이드](../integrations/google-apple-auth.md) 를 따라요.

### Sign in with Apple

- [ ] App ID 와 Xcode 에서 Sign in with Apple capability 를 켜요.
- [ ] 백엔드에 identity token 의 audience 를 검증할 Bundle ID 를 설정해요.
- [ ] 현재 iOS 흐름에는 Service ID·Team ID·서버 교환용 p8 키가 필요하지 않아요. 다른 로그인 흐름을 추가한다면 별도로 검토해요.

### 백엔드

- [ ] `template-spring` 쌍 운영 전제
- [ ] 유저 테이블이 `appSlug` 기반 격리 ([`ADR-012`](../philosophy/adr-012-per-app-user.md))
- [ ] 다음 endpoint 제공 (`template-spring/common/common-web/.../ApiEndpoints.java` 의 `Auth.*`):
  - `POST /api/apps/{slug}/auth/email/send-code` (200, `{data:{devCode}}` — devCode 는 non-prod 만)
  - `POST /api/apps/{slug}/auth/email/verify-code` (200, `{data:{proofToken}}` — 약 30분 유효)
  - `POST /api/apps/{slug}/auth/email/signup` (201, body 에 `proofToken` 필수 — verify-before-signup)
  - `POST /api/apps/{slug}/auth/email/signin` (200)
  - `POST /api/apps/{slug}/auth/{google|apple|kakao|naver}` (200)
  - `POST /api/apps/{slug}/auth/refresh` (200, AuthTokens — 회전)
  - `POST /api/apps/{slug}/auth/logout` (204, body `{refreshToken}` — 이 기기 세션 폐기)
  - `POST /api/apps/{slug}/auth/withdraw` (204, 인증 필요)
  - `POST /api/apps/{slug}/auth/verify-email` (204)
  - `POST /api/apps/{slug}/auth/resend-verification` (204, 인증 필요)
  - `POST /api/apps/{slug}/auth/password-reset/request` (204)
  - `POST /api/apps/{slug}/auth/password-reset/confirm` (204)
  - `PATCH /api/apps/{slug}/auth/password` (204, 인증 필요)
  - `GET /api/apps/{slug}/users/me` (인증 필요)
- [ ] **로그아웃은 `signOut()` 하나로 충분** — 로컬 정리 + 서버 `POST /auth/logout` 폐기 요청까지 처리 ([auth-flow.md §로그아웃](../api-contract/auth-flow.md) 참조)
- [ ] 응답 envelope `{data, error}`, signin/signup 은 `{user, tokens: {accessToken, refreshToken}}` nested, refresh 는 `{accessToken, refreshToken}` root

---

## Code References

- [`lib/kits/auth_kit/auth_kit.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/auth_kit/auth_kit.dart) — `AppKit` 구현
- [`lib/kits/auth_kit/auth_service.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/auth_kit/auth_service.dart)
- [`lib/kits/auth_kit/auth_state.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/auth_kit/auth_state.dart)
- [`lib/kits/auth_kit/auth_check_step.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/auth_kit/auth_check_step.dart)
- [`lib/kits/auth_kit/ui/`](https://github.com/storkspear/template-flutter/tree/main/lib/kits/auth_kit/ui) — 기능별 화면 · ViewModel · 공용 위젯
  - `login/` — 로그인 화면 · ViewModel · 소셜 로그인 바/버튼
  - `password_reset/` — 비밀번호 재설정 화면 · ViewModel
  - `verify_email/` — 이메일 인증 화면 · ViewModel
  - `two_factor/` — 2FA 화면 5종(로그인·설정·해제·백업코드) · 백업코드 뷰 · ViewModel
  - `auth_error_text.dart` — 에러코드 → 사용자 문구 매핑(전 화면 공용)
- [`lib/core/storage/token_storage.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/core/storage/token_storage.dart) — 원자 저장

---

## 관련 문서

- [`backend-api-kit.md`](./backend-api-kit.md) — 의존 Kit
- [`ADR-010 · 401 refresh`](../philosophy/adr-010-queued-interceptor.md)
- [`ADR-012 · 앱별 독립 유저`](../philosophy/adr-012-per-app-user.md)
- [`ADR-013 · 토큰 원자 저장`](../philosophy/adr-013-token-atomic-storage.md)
- [`ADR-018 · 라우팅 우선순위`](../philosophy/adr-018-redirect-priority.md)
