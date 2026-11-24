<a id="kakao--naver-소셜-로그인-통합"></a>

# Kakao / Naver 소셜 로그인 통합

카카오·네이버 로그인을 추가할 때 필요한 콘솔 등록, native 설정, Kit 활성화, 검증 절차를 안내해요.

**관련 Kit**: [`auth_kit`](../features/auth-kit.md)
**관련 패키지**: `kakao_flutter_sdk_user`, `flutter_naver_login` (pubspec.yaml 에 이미 선언됨)

---

## 0. 본 템플릿의 위치

템플릿은 이메일과 Google·Apple·Kakao·Naver 인증을 지원해요. 앱에 필요한 provider 만 활성화하고, 사용하지 않는 소셜 SDK 를 제거할 때는 관련 import 와 native 설정도 함께 확인해요.

> Kit 목록에서 provider 를 끄는 것만으로 native SDK 가 앱에서 빠지지는 않아요. 의존성 제거 후 실제 산출물을 측정해야 용량 변화를 알 수 있어요. 자세한 범위는 [Features 의 tree-shaking 설명](../features/README.md) 을 참고해요.

---

<a id="1-kakao-developers-콘솔--앱-등록"></a>

## 1. Kakao Developers 콘솔 — 앱 등록

1. https://developers.kakao.com 가입 (한국 휴대폰 번호 인증 필요)
2. **내 애플리케이션 → 애플리케이션 추가하기**
   - 앱 아이콘 / 앱 이름 / 회사명 입력 (앱 슬러그 권장)
3. 발급된 **네이티브 앱 키** 복사 (예: `1234567890abcdefghij`)
4. **플랫폼 등록**:
   - **Android**: 패키지명 (`android/app/build.gradle.kts` 의 `applicationId`) + 키 해시
     ```bash
     # debug 키 해시
     keytool -exportcert -alias androiddebugkey -keystore ~/.android/debug.keystore -storepass android -keypass android | openssl sha1 -binary | openssl base64

     # release 키 해시
     keytool -exportcert -alias <YOUR_ALIAS> -keystore <YOUR_KEYSTORE>.jks -storepass <STORE_PASS> -keypass <KEY_PASS> | openssl sha1 -binary | openssl base64
     ```
   - **iOS**: Bundle ID (`ios/Runner.xcodeproj` 의 PRODUCT_BUNDLE_IDENTIFIER)
5. **카카오 로그인 활성화** (제품 설정 → 카카오 로그인):
   - 활성화 ON
   - OpenID Connect 활성화는 선택 — 현 백엔드는 ID token 이 아니라 **access token 검증 방식** (`/v1/user/access_token_info` 로 app_id 확인 + `/v2/user/me` 로 email 조회) 이라 OIDC 없이도 동작해요
   - **동의항목** 설정 — 이메일 (필수 여부 결정), 닉네임 등
6. **개인정보 동의 항목**: "이메일" 을 **필수 동의** 로 설정 권장 (백엔드가 email 없이는 처리 어려움)

---

<a id="2-naver-developers-콘솔--앱-등록"></a>

## 2. Naver Developers 콘솔 — 앱 등록

1. https://developers.naver.com 가입
2. **Application → 애플리케이션 등록**
   - 애플리케이션 이름
   - **사용 API**: 네이버 로그인 선택
   - **로그인 오픈 API 서비스 환경**: Android, iOS
3. 발급된 **Client ID** + **Client Secret** 복사
4. **플랫폼 등록**:
   - **Android**: 패키지명 + 마켓 URL (Play Store 출시 후)
   - **iOS**: Bundle ID + URL Scheme (보통 Client ID 그대로)
5. **제공 정보 선택**: 이메일 (필수), 이름 등

---

## 3. Flutter 측 활성화

<a id="3-1-app_kitsyaml"></a>

### 3-1. `app_kits.yaml`

```yaml
kits:
  auth_kit:
    providers:
      - email
      - google      # 한국 외 시장 대비
      - apple       # iOS 가이드라인 준수
      - kakao       # ← 추가
      - naver       # ← 추가
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
      AuthProvider.kakao,    // ← 추가
      AuthProvider.naver,    // ← 추가
    },
  ),
  // ...
]);
```

### 3-3. 검증

```bash
dart run tool/configure_app.dart
# Status: OK 확인
```

---

## 4. Native 셋업

### 4-1. Kakao SDK 초기화 (Flutter 측)

`lib/main.dart` 의 `main()` 안, `AppConfig.init` 직후 (주석 처리된 템플릿이 이미 있어요 — 주석 해제 후 사용):

```dart
import 'package:kakao_flutter_sdk_user/kakao_flutter_sdk_user.dart';

KakaoSdk.init(
  nativeAppKey: const String.fromEnvironment('KAKAO_NATIVE_KEY'),
);
```

<a id="4-2-android--androidmanifestxml"></a>

### 4-2. Android — `AndroidManifest.xml`

`android/app/src/main/AndroidManifest.xml` 의 `<application>` 안에 카카오 redirect activity 등록:

```xml
<activity
    android:name="com.kakao.sdk.auth.AuthCodeHandlerActivity"
    android:exported="true">
    <intent-filter>
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        <!-- 'kakao{NATIVE_APP_KEY}://oauth' -->
        <data android:scheme="kakao1234567890abcdef" android:host="oauth" />
    </intent-filter>
</activity>
```

> native 앱 키는 앱에 포함되는 설정이에요. base64 로 바꿔도 비밀이 되지 않아요. 발급처에 등록한 패키지명·Bundle ID·키 해시를 확인하고, 서버 권한을 가진 자격증명과 구분해 관리해요.

<a id="4-3-ios--infoplist"></a>

### 4-3. iOS — `Info.plist`

`ios/Runner/Info.plist`:

```xml
<key>LSApplicationQueriesSchemes</key>
<array>
    <string>kakaokompassauth</string>
    <string>kakaolink</string>
    <string>naversearchapp</string>
    <string>naversearchthirdlogin</string>
</array>

<key>CFBundleURLTypes</key>
<array>
    <!-- 카카오 -->
    <dict>
        <key>CFBundleURLSchemes</key>
        <array>
            <string>kakao1234567890abcdef</string>
        </array>
    </dict>
    <!-- 네이버 -->
    <dict>
        <key>CFBundleURLSchemes</key>
        <array>
            <string>naverlogin1234567890</string>
        </array>
    </dict>
</array>
```

---

## 5. 키 주입

Kakao 초기화 코드는 `KAKAO_NATIVE_KEY` 를 Dart 상수로 읽어요. `.env` 에 값을 넣고 실행할 때 파일을 명시해요.

```bash
<repo> dev start --dart-define-from-file=.env
```

Naver 는 설정 방식이 달라요. 현재 잠긴 `flutter_naver_login 2.1.1` 에는 Dart `FlutterNaverLogin.initSdk` 메서드가 없어요. `main.dart` 의 해당 주석을 그대로 해제하거나 `NAVER_CLIENT_ID` 를 dart-define 으로 전달하는 것만으로 초기화되지 않아요.

- Android: Manifest 의 `com.naver.sdk.clientId`, `com.naver.sdk.clientSecret`, `com.naver.sdk.clientName` metadata 를 앱 값으로 설정해요. 리소스를 참조한다면 해당 문자열 리소스도 빌드에 포함해야 해요.
- iOS: `Info.plist` 에 `NidClientID`, `NidClientSecret`, `NidAppName`, `NidUrlScheme` 를 설정해요. URL Scheme 및 앱 복귀 처리는 사용 중인 SDK 버전의 설정 절차와 함께 확인해요.

dev/prod 값을 나누려면 각 native 빌드 설정에서 올바른 값을 주입하는지도 확인해요. 현재 템플릿에는 이 Naver 설정 파일을 자동 생성하는 단계가 없어요.

CI 에서는 발급값을 GitHub Secrets 로 보관할 수 있어요.

```bash
gh secret set KAKAO_NATIVE_KEY
gh secret set NAVER_CLIENT_ID
gh secret set NAVER_CLIENT_SECRET
```

Secrets 를 등록하는 것만으로 앱에 반영되지는 않아요. 파생 레포의 빌드 단계에서 Kakao 의 dart-define 과 Naver 의 native 설정으로 연결해야 해요. 현재 Android 릴리스 워크플로우는 이 세 값을 자동 주입하지 않아요.

---

## 6. 검증

### 6-1. Kakao 로그인 시퀀스

```
앱 실행 → /login 화면 → "카카오로 로그인" 버튼
  ↓
SocialLoginBar → KakaoLoginGate.signInAndGetAccessToken()
  ↓
Kakao SDK: 카카오톡 앱 또는 웹뷰 OAuth → access token 획득
  ↓
authService.signInWithKakao(accessToken: '...')
  ↓
백엔드: POST /api/apps/{slug}/auth/kakao { accessToken } — appSlug 는 URL path 에서 derive
  ↓
백엔드: kapi.kakao.com /v1/user/access_token_info 로 app_id 검증 + /v2/user/me 로 email 추출
  ↓
백엔드: 우리 JWT 발급 (AuthResponse — user + tokens nested)
  ↓
AuthService._handleAuthResponse → 토큰 저장 + authenticated 상태
```

### 6-2. 흔한 트러블

| 증상 | 원인 | 해결 |
|---|---|---|
| Android: "카카오 SDK가 초기화되지 않았습니다" | `KakaoSdk.init` 호출 누락 또는 native key 미주입 | main.dart 에서 `KakaoSdk.init` 호출 + dart-define 확인 |
| Android: "key hash mismatch" | 콘솔에 등록한 키 해시와 빌드 keystore 해시 불일치 | release/debug 각각 해시 추출 → 콘솔에 추가 |
| iOS: 카카오톡 앱으로 redirect 안 됨 | `LSApplicationQueriesSchemes` 누락 | Info.plist 에 `kakaokompassauth` 추가 |
| Naver: 이메일 없음 → `socialAuthFailed (ATH_004)` (`details.reason = "email_required"`) | 사용자가 이메일 동의 거부 | 콘솔에서 이메일을 **필수** 동의로 설정 + 화면에 안내 메시지 |
| Apple "Hide My Email" 처리됨 → 카카오/네이버에서도 비슷한 정책? | 카카오/네이버는 hide email 정책 없음 — 동의 거부만 가능 | 콘솔에서 필수 설정 + 사용자 안내 |

---

## 7. 파생 레포 체크리스트

### Kakao
- [ ] Kakao Developers 콘솔에서 앱 등록 + 네이티브 앱 키 발급
- [ ] Android keystore 해시를 release/debug 모두 콘솔에 등록
- [ ] iOS Bundle ID 콘솔에 등록
- [ ] 카카오 로그인을 활성화해요. 현재 access token 검증 흐름에서 OpenID Connect 는 필수가 아니에요.
- [ ] 이메일을 **필수 동의** 항목으로 설정
- [ ] `AndroidManifest.xml` 에 redirect activity + `kakao{KEY}://oauth` scheme 등록
- [ ] `Info.plist` 에 `LSApplicationQueriesSchemes` + `CFBundleURLTypes` (카카오 scheme)
- [ ] `.env` 와 GHA Secrets 에 `KAKAO_NATIVE_KEY` 추가
- [ ] `app_kits.yaml` + `main.dart` 에 `kakao` provider 활성화

### Naver
- [ ] Naver Developers 콘솔에서 앱 등록 + Client ID/Secret 발급
- [ ] 사용 API "네이버 로그인" 선택
- [ ] Android 패키지명 + iOS Bundle ID 등록
- [ ] 이메일 제공 정보 필수 설정
- [ ] `Info.plist` 에 `LSApplicationQueriesSchemes` + URL Scheme 등록
- [ ] Naver Client ID·Secret·앱 이름을 Android metadata 와 iOS `Nid*` 설정에 연결해요. CI Secrets 를 쓰면 native 설정으로 전달하는 단계도 작성해요. spring 백엔드는 Client Secret 을 사용하지 않아요.
- [ ] `app_kits.yaml` + `main.dart` 에 `naver` provider 활성화

### 백엔드 (template-spring)
- [ ] `KakaoSignInService` / `NaverSignInService` 용 환경변수 주입 — `APP_CREDENTIALS_<SLUG>_KAKAO_APP_ID` (Kakao 앱 ID, 숫자), `APP_CREDENTIALS_<SLUG>_NAVER_CLIENT_ID`
- [ ] `/api/apps/{slug}/auth/kakao` 와 `/auth/naver` endpoint 가 응답 정상

---

<a id="8-개인정보--동의-정책"></a>

## 8. 개인정보 / 동의 정책

- 개인정보처리방침에는 실제 요청·전달·저장하는 항목과 처리 주체를 적어요. 템플릿이 닉네임이나 프로필 이미지를 모두 수집한다고 가정하지 않아요.
- 회원 탈퇴 시 삭제 범위와 별도 보관이 필요한 항목은 앱의 처리 방식과 적용 기준에 맞춰 정해요. 모든 데이터에 동일한 보관 연수를 적용하지 않아요.
- 이메일 미동의로 가입할 수 없으면 이유와 다시 시도할 방법을 안내해요. 예: "가입에 필요한 이메일을 확인할 수 없어요. 이메일 제공 동의를 확인한 뒤 다시 시도해주세요."

---

## 9. Code References

- [`lib/kits/auth_kit/auth_provider.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/auth_kit/auth_provider.dart) — AuthProvider enum
- [`lib/kits/auth_kit/social/social_auth_gates.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/auth_kit/social/social_auth_gates.dart) — Kakao/Naver Gate 인터페이스
- [`lib/kits/auth_kit/auth_service.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/auth_kit/auth_service.dart) — `signInWithKakao`, `signInWithNaver`
- [`api-contract/auth-flow.md`](../api-contract/auth-flow.md) — OAuth 2.0 흐름 시퀀스
- [`integrations/google-apple-auth.md`](./google-apple-auth.md) — Google/Apple 짝 가이드
