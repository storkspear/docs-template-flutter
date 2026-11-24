<a id="google--apple-소셜-로그인-통합"></a>

# Google / Apple 소셜 로그인 통합

Google 과 Apple 로그인을 사용할 때 필요한 콘솔 등록, 플랫폼 설정, 실제 기기 검증을 안내해요.

**관련 Kit**: [`auth_kit`](../features/auth-kit.md)
**관련 패키지**: `google_sign_in`, `sign_in_with_apple` (pubspec.yaml 에 이미 선언됨)

---

## 0. 필수 여부

- **Sign in with Apple**: iOS 에 다른 소셜 로그인을 제공한다면 App Store 가이드라인 4.8 의 적용 조건과 예외를 확인해요.
- **Google Sign-In**: 앱의 대상 사용자와 로그인 요구에 맞게 선택해요.

---

## 1. Google Sign-In

<a id="1-1-google-cloud-console--oauth-20-client-id-발급"></a>

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
     - 백엔드는 OAuth callback 을 받지 않아요 (redirect 흐름 미사용) — Flutter 가 SDK 로 받은 idToken 을 `POST /api/apps/{slug}/auth/google` 로 전송하면, 백엔드가 idToken 의 `aud` claim 을 등록된 client ID 리스트와 비교 검증해요. 발급한 client ID 를 그 리스트에 등록하는 게 백엔드 측 작업의 전부 (아래 §1-5)
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

<a id="1-3-android--androidappbuildgradlekts"></a>

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

dev/prod 를 분리한다면 각 파일을 `android/app/src/dev/google-services.json`, `android/app/src/prod/google-services.json` 에 배치해요. `<repo> dev init` 과 `<repo> prod init` 은 이 flavor 구조에 맞춰 설정해요.

<a id="1-4-ios--iosrunnerinfoplist"></a>

### 1-4. iOS — `ios/Runner/Info.plist`

reversed Client ID 를 URL Scheme 으로 등록:

```xml
<key>CFBundleURLTypes</key>
<array>
    <dict>
        <key>CFBundleURLSchemes</key>
        <array>
            <!-- 발급받은 REVERSED_CLIENT_ID 값을 사용해요. 점을 콜론으로 바꾸지 않아요. -->
            <!-- 예: "1234567890-def.apps.googleusercontent.com" → "com.googleusercontent.apps.1234567890-def" -->
            <string>com.googleusercontent.apps.1234567890-def</string>
        </array>
    </dict>
</array>
```

현재 템플릿은 `GoogleService-Info-dev.plist` 와 `GoogleService-Info-prod.plist` 를 나눠 두고 빌드 시 해당 파일을 선택해요. `<repo> <env> link-oauth` 는 plist 의 Client ID 를 `AppEnv-secrets-<env>.xcconfig` 에 기록해요. `Info.plist` 의 기존 변수 참조를 유지하고 위 XML 을 중복으로 추가하지 않아요.

### 1-5. 키 주입

- **Android**: `google-services.json` 안에 OAuth client ID 가 포함되므로 별도 dart-define 불필요
- **iOS**: `GoogleService-Info.plist` 안에 포함 → 동일하게 별도 주입 불필요
- **백엔드 (template-spring)**: client ID 를 `APP_CREDENTIALS_<SLUG>_GOOGLE_CLIENT_IDS_0` (플랫폼별로 여러 개면 `_1`, `_2` …) 환경변수로 주입 — `app.credentials.<slug>.google-client-ids` 리스트에 바인딩되고, 백엔드가 ID token 의 `aud` 를 이 리스트와 비교 검증해요

---

## 2. Sign in with Apple

<a id="2-1-apple-developer-console--service-설정"></a>

### 2-1. Apple Developer Console — Service 설정

1. https://developer.apple.com/account 로그인 (유료 멤버십 $99/year 필요 — App Store 출시도 함께)
2. **Certificates, Identifiers & Profiles → Identifiers**
3. 본인의 **App ID 선택** (없으면 새로 생성, Bundle ID = `com.<org>.<slug>`)
4. **Capabilities** 에서 **Sign In with Apple** 활성화 → Save

<a id="2-2-service-id--key-발급--현-백엔드-미사용-건너뛰어도-돼요"></a>

### 2-2. Service ID + Key 발급 — 현 백엔드 미사용 (건너뛰어도 돼요)

Service ID + `.p8` Key 는 서버가 authorization code 를 Apple 토큰 엔드포인트와 직접 교환하는 흐름에서만 필요해요. **현 template-spring 은 Flutter 가 전달한 identity token 을 Apple JWKS 공개키 (RS256) 로 직접 검증**하므로 `.p8` 키가 필요 없어요. 나중에 서버 주도 교환 흐름으로 확장할 때만:

1. **Identifiers** → 새 Service ID 생성 (예: `com.<org>.<slug>.signinservice`)
2. **Sign In with Apple → Configure** → Primary App ID = 위 §2-1 App ID
3. **Keys** → 새 Key 생성 → **Sign In with Apple** 활성화 → Primary App ID 선택 → Download `.p8` 파일
4. Key ID + Team ID 메모

<a id="2-3-xcode--capability-추가"></a>

### 2-3. Xcode — Capability 추가

1. CocoaPods 설치 후 Xcode 에서 `ios/Runner.xcworkspace` 를 열어요.
2. Runner target → **Signing & Capabilities** → **+ Capability** → **Sign in with Apple**
3. 자동으로 entitlements 파일 추가됨 (`Runner.entitlements`)

### 2-4. 키 주입 (백엔드)

현 백엔드는 `.p8` 키 등록이 **필요 없어요** (JWKS 공개키 검증). 백엔드 설정은 `aud` 검증용 Bundle ID 하나뿐:

```bash
# template-spring 측 환경변수 (app.credentials.<slug>.apple-bundle-id 바인딩)
APP_CREDENTIALS_<SLUG>_APPLE_BUNDLE_ID=com.<org>.<slug>
```

> Flutter 측은 Apple SDK 가 native 로 ID token 만 가져와서 백엔드에 전송. 백엔드가 JWKS + RS256 으로 iss/aud/exp 를 검증 — 이때 `aud` 를 위 Bundle ID 와 비교해요.

### 2-5. iOS-only 제약

- 이 템플릿은 Apple 로그인을 iOS 에만 노출해요. `social_login_bar.dart` 에서 `Platform.isIOS` 를 확인해요.
- 다른 플랫폼의 Apple 웹 로그인 흐름은 현재 템플릿에 구현되어 있지 않아요.

---

## 3. Flutter 측 활성화

<a id="3-1-app_kitsyaml"></a>

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
백엔드: POST /api/apps/{slug}/auth/google { idToken }
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
| Apple: 신규 사용자 가입 시 이메일이 없음 | identity token 에 이메일이 없고 요청 fallback 도 없는 경우 | 현재 Flutter 는 identity token 만 보내요. 백엔드는 기존 소셜 계정은 식별자로 조회하지만 신규 계정에는 이메일이 필요해요. SDK 이메일 fallback 을 자동 전달하지 않는다는 점을 확인해요 |
| Apple: 이름이 사용자 정보에 반영되지 않음 | Flutter Gate 가 SDK 응답에서 identity token 만 반환해요 | SDK 의 이름 정보를 사용할 앱은 요청 계약과 저장 흐름을 별도로 연결해야 해요 |

---

## 5. 파생 레포 체크리스트

### Google
- [ ] Google Cloud Console (또는 Firebase) 에서 프로젝트 생성
- [ ] Android/iOS/Web Client ID 3개 발급 (사용 플랫폼만)
- [ ] Android: `google-services.json` 배치 + SHA-1 등록 (release/debug)
- [ ] iOS: `GoogleService-Info.plist` 배치 + Info.plist URL Scheme 등록
- [ ] 백엔드 (`template-spring`): `APP_CREDENTIALS_<SLUG>_GOOGLE_CLIENT_IDS_0` 환경변수 (`app.credentials` 리스트 — 플랫폼별 client ID 를 `_1`, `_2` … 로 추가)
- [ ] `app_kits.yaml` + `main.dart` 에 `google` provider 활성화

### Apple
- [ ] Apple Developer 멤버십 가입 ($99/year)
- [ ] App ID Capabilities 에 Sign in with Apple 활성
- [ ] Xcode Capabilities → Sign in with Apple 추가
- [ ] 백엔드: `APP_CREDENTIALS_<SLUG>_APPLE_BUNDLE_ID` 환경변수 등록 (JWKS 검증 방식이라 Service ID / `.p8` 키는 불필요 — §2-2)
- [ ] `app_kits.yaml` + `main.dart` 에 `apple` provider 활성화

---

<a id="6-개인정보--동의-정책"></a>

## 6. 개인정보 / 동의 정책

- Google 과 Apple 에서 요청하는 정보, 실제로 서버에 전달·저장하는 정보, 보관 기간을 구분해 개인정보 안내를 작성해요.
- Apple 의 이메일 가리기 주소는 가짜 주소가 아니라 중계 주소예요. 실제 메일 발송을 사용할 때는 발신 도메인과 중계 서비스 설정을 확인해요.
- 공급자와 처리 지역은 해당 앱의 서비스 설정을 기준으로 확인해요.

---

## 7. Code References

- [`lib/kits/auth_kit/auth_provider.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/auth_kit/auth_provider.dart)
- [`lib/kits/auth_kit/social/social_auth_gates.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/auth_kit/social/social_auth_gates.dart)
- [`lib/kits/auth_kit/auth_service.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/auth_kit/auth_service.dart)
- [`api-contract/auth-flow.md`](../api-contract/auth-flow.md) — OAuth 2.0 시퀀스
- [`integrations/kakao-naver-auth.md`](./kakao-naver-auth.md) — 한국 시장 짝 가이드
- [`integrations/fcm.md`](./fcm.md) — Firebase 통합 (Google 통합 보완)
