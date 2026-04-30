# Google / Apple 소셜 로그인 통합

> **목표**: Google Sign-In 과 Sign in with Apple 활성화. 콘솔 키 발급 → 플랫폼 설정 → 검증까지.

**관련 Kit**: [`auth_kit`](../features/auth-kit.md)
**관련 패키지**: `google_sign_in`, `sign_in_with_apple` (pubspec.yaml 에 이미 선언됨)

---

## 0. 필수 여부

- **Sign in with Apple**: iOS 앱에 다른 소셜 로그인 (Google/Kakao/Naver) 이 있으면 **Apple 도 의무**입니다. App Store 가이드라인 4.8.
- **Google Sign-In**: 선택. 글로벌 시장이면 강력 추천.

---

## 1. Google Sign-In

### 1-1. Google Cloud Console — OAuth 2.0 Client ID 발급

1. https://console.cloud.google.com 접속 (Google 계정)
2. **프로젝트 만들기** (또는 Firebase 프로젝트 선택)
3. **APIs & Services → Credentials** → **Create Credentials → OAuth client ID**
4. **3개의 client ID 발급** (Android, iOS, Web — 사용하는 플랫폼만):
   - **Android**:
     - Package name: `com.<org>.<slug>` (= `applicationId`)
     - SHA-1 fingerprint:
       ```bash
       # debug
       keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android | grep SHA1
       # release
       keytool -list -v -keystore android/app/upload-keystore.jks -alias <ALIAS> | grep SHA1
       ```
   - **iOS**:
     - Bundle ID: `com.<org>.<slug>`
     - 발급된 Client ID 의 **reversed 형태** 가 iOS URL Scheme 에 사용됨
   - **Web** (백엔드가 ID token 검증 시 사용):
     - 백엔드의 OAuth callback URL (template-spring 에선 보통 `https://api.example.com/auth/google/callback` 형태)
5. 각 client ID 복사 — 형태:
   - Android: `1234567890-abc.apps.googleusercontent.com`
   - iOS: `1234567890-def.apps.googleusercontent.com`
   - Web: `1234567890-ghi.apps.googleusercontent.com`

### 1-2. Firebase 통합 (선택, 권장)

FCM 도 함께 쓸 거라면 Firebase 프로젝트 안에서 OAuth client ID 가 자동 관리되어 더 편함:

1. https://console.firebase.google.com → 프로젝트 생성 (Google Cloud Console 프로젝트와 연결)
2. Android/iOS 앱 추가 → `google-services.json` / `GoogleService-Info.plist` 다운로드
3. Firebase 가 OAuth client ID 자동 생성 → 위 §1-1 의 수동 작업 일부 생략 가능

**상세 FCM 셋업**: [`fcm.md`](./fcm.md)

### 1-3. Android — `android/app/build.gradle.kts`

google-services plugin 적용 (FCM 셋업과 동일):

```kotlin
plugins {
    id("com.android.application")
    id("kotlin-android")
    id("dev.flutter.flutter-gradle-plugin")
    id("com.google.gms.google-services")  // ← 추가 (Firebase 사용 시)
}
```

`google-services.json` 을 `android/app/` 에 배치 (gitignore 됨).

### 1-4. iOS — `ios/Runner/Info.plist`

reversed Client ID 를 URL Scheme 으로 등록:

```xml
<key>CFBundleURLTypes</key>
<array>
    <dict>
        <key>CFBundleURLSchemes</key>
        <array>
            <!-- Google iOS Client ID 의 점(.) 을 콜론(:) 으로 바꾼 reversed 형태 -->
            <!-- 예: "1234567890-def.apps.googleusercontent.com" → "com.googleusercontent.apps.1234567890-def" -->
            <string>com.googleusercontent.apps.1234567890-def</string>
        </array>
    </dict>
</array>
```

`GoogleService-Info.plist` 를 Xcode 에서 Runner 에 추가 (드래그 앤 드롭 + "Copy items if needed" 체크).

### 1-5. 키 주입

- **Android**: `google-services.json` 안에 OAuth client ID 가 포함되므로 별도 dart-define 불필요
- **iOS**: `GoogleService-Info.plist` 안에 포함 → 동일하게 별도 주입 불필요
- **백엔드 (template-spring)**: Web Client ID 를 `GOOGLE_CLIENT_ID` 환경변수로 주입 (백엔드가 ID token 검증 시 audience 비교)

---

## 2. Sign in with Apple

### 2-1. Apple Developer Console — Service 설정

1. https://developer.apple.com/account 로그인 (유료 멤버십 $99/year 필요 — App Store 출시도 함께)
2. **Certificates, Identifiers & Profiles → Identifiers**
3. 본인의 **App ID 선택** (없으면 새로 생성, Bundle ID = `com.<org>.<slug>`)
4. **Capabilities** 에서 **Sign In with Apple** 활성화 → Save

### 2-2. (선택, 백엔드 검증용) Service ID + Key 발급

JWT 검증을 백엔드에서 직접 한다면:

1. **Identifiers** → 새 Service ID 생성 (예: `com.<org>.<slug>.signinservice`)
2. **Sign In with Apple → Configure** → Primary App ID = 위 §2-1 App ID
3. **Keys** → 새 Key 생성 → **Sign In with Apple** 활성화 → Primary App ID 선택 → Download `.p8` 파일
4. Key ID + Team ID 메모

### 2-3. Xcode — Capability 추가

1. Xcode 에서 `ios/Runner.xcodeproj` 열기
2. Runner target → **Signing & Capabilities** → **+ Capability** → **Sign in with Apple**
3. 자동으로 entitlements 파일 추가됨 (`Runner.entitlements`)

### 2-4. 키 주입 (백엔드)

`.p8` 파일을 **백엔드 GHA Secrets** 에 등록 (Flutter 측은 SDK 가 처리하므로 키 주입 불필요):

```bash
# template-spring 측에서:
gh secret set APPLE_PRIVATE_KEY < AuthKey_ABC123.p8
gh secret set APPLE_TEAM_ID --body "ABCD1234"
gh secret set APPLE_KEY_ID --body "ABC123"
gh secret set APPLE_SERVICE_ID --body "com.org.slug.signinservice"
```

> Flutter 측은 Apple SDK 가 native 로 ID token 만 가져와서 백엔드에 전송. 백엔드가 JWKS + RS256 으로 검증.

### 2-5. iOS-only 제약

- **Android 에서는 Apple 로그인 작동 안 함** (Apple 이 iOS native API 만 제공). UI 에서도 자동으로 숨겨져야 함.
- 우리 템플릿: `social_login_bar.dart` 가 `Platform.isIOS` 체크 → iOS 에서만 Apple 버튼 노출.

---

## 3. Flutter 측 활성화

### 3-1. `app_kits.yaml`

```yaml
kits:
  auth_kit:
    providers:
      - email
      - google
      - apple        # iOS 에서만 노출 (Android 자동 숨김)
```

### 3-2. `lib/main.dart`

```dart
await AppKits.install([
  BackendApiKit(),
  AuthKit(
    providers: const {
      AuthProvider.email,
      AuthProvider.google,
      AuthProvider.apple,
    },
  ),
  // ...
]);
```

### 3-3. 검증

```bash
dart run tool/configure_app.dart
flutter analyze
flutter test
```

---

## 4. 검증 (실제 기기)

### 4-1. Google 로그인 시퀀스

```
앱 실행 → /login → "Google로 로그인" 버튼
  ↓
GoogleSignInGate.signInAndGetIdToken()
  ↓
google_sign_in SDK: 시스템 계정 선택기 또는 Web OAuth → ID token 획득
  ↓
authService.signInWithGoogle(idToken: '...')
  ↓
백엔드: POST /api/apps/{slug}/auth/google { idToken, appSlug }
  ↓
백엔드: oauth2.googleapis.com/tokeninfo 로 검증 + audience(aud) 비교
  ↓
백엔드: 우리 JWT 발급 (AuthResponse — user + tokens nested)
  ↓
AuthService._handleAuthResponse → 토큰 저장 + authenticated
```

### 4-2. Apple 로그인 시퀀스

```
앱 실행 (iOS) → /login → "Apple로 로그인" 버튼
  ↓
AppleSignInGate.signInAndGetIdentityToken()
  ↓
sign_in_with_apple SDK: Face ID/Touch ID + Apple ID 인증 → identity token 획득
  ↓
authService.signInWithApple(identityToken: '...')
  ↓
백엔드: POST /api/apps/{slug}/auth/apple
  ↓
백엔드: JWKS + RS256 검증 → iss/aud/exp 확인
  ↓
백엔드: JWT 발급
```

### 4-3. 흔한 트러블

| 증상 | 원인 | 해결 |
|---|---|---|
| Android: "DEVELOPER_ERROR" 또는 sign-in 즉시 닫힘 | OAuth client ID 와 Android 패키지명/SHA-1 불일치 | Console 에서 fingerprint 재발급 + 등록 |
| iOS: Google 버튼 누르면 빈 화면 | URL Scheme (reversed Client ID) 미등록 | Info.plist 의 CFBundleURLSchemes 확인 |
| Apple: "Sign in with Apple is not configured" | Xcode Capability 미추가 또는 App ID 의 Capability 비활성 | Xcode + Apple Developer 양쪽 다 확인 |
| Apple: "Hide My Email" 사용자 → 첫 로그인 후 email claim 빠짐 | Apple 정책 | `signInWithApple` 호출 시 첫 응답의 email 을 백엔드에 fallback 으로 전달 (auth_kit 자동 처리) |
| Apple: 두 번째 로그인부터 firstName/lastName 안 옴 | Apple 정책 (첫 로그인에만 제공) | 백엔드에서 첫 로그인 시 저장 → 이후 DB 에서 조회 |

---

## 5. 파생 레포 체크리스트

### Google
- [ ] Google Cloud Console (또는 Firebase) 에서 프로젝트 생성
- [ ] Android/iOS/Web Client ID 3개 발급 (사용 플랫폼만)
- [ ] Android: `google-services.json` 배치 + SHA-1 등록 (release/debug)
- [ ] iOS: `GoogleService-Info.plist` 배치 + Info.plist URL Scheme 등록
- [ ] 백엔드 (`template-spring`): `GOOGLE_CLIENT_ID` (Web Client ID) 환경변수
- [ ] `app_kits.yaml` + `main.dart` 에 `google` provider 활성화

### Apple
- [ ] Apple Developer 멤버십 가입 ($99/year)
- [ ] App ID Capabilities 에 Sign in with Apple 활성
- [ ] (백엔드 검증용) Service ID + Key (.p8) + Team ID 발급
- [ ] Xcode Capabilities → Sign in with Apple 추가
- [ ] 백엔드: `APPLE_PRIVATE_KEY`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_SERVICE_ID` GHA Secrets 등록
- [ ] `app_kits.yaml` + `main.dart` 에 `apple` provider 활성화

---

## 6. 개인정보 / 동의 정책

- **Google**: 수집 항목은 사용자가 동의 화면에서 직접 확인. 개인정보처리방침에 "Google (이메일, 이름, 프로필 이미지)" 명시
- **Apple**: "Hide My Email" 사용자의 경우 가짜 email (`xxx@privaterelay.appleid.com`) 받을 수 있음 — DB 저장 OK, 다만 실제 메일 발송은 작동
- **위탁사**: Google LLC (미국), Apple Inc. (미국)

---

## 7. Code References

- [`lib/kits/auth_kit/auth_provider.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/auth_kit/auth_provider.dart)
- [`lib/kits/auth_kit/social/social_auth_gates.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/auth_kit/social/social_auth_gates.dart)
- [`lib/kits/auth_kit/auth_service.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/auth_kit/auth_service.dart)
- [`api-contract/auth-flow.md`](../api-contract/auth-flow.md) — OAuth 2.0 시퀀스
- [`integrations/kakao-naver-auth.md`](./kakao-naver-auth.md) — 한국 시장 짝 가이드
- [`integrations/fcm.md`](./fcm.md) — Firebase 통합 (Google 통합 보완)
