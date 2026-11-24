# Secrets Management

이 문서는 로컬 `.env` 파일, CI 의 GitHub Secrets, 빌드 시 값을 전달하는 `--dart-define` 을 구분해 설명해요. `--dart-define` 값은 앱에 포함되므로 비밀 저장소로 쓰면 안 돼요. Sentry DSN·OAuth Client ID 같은 앱 설정과, 배포 권한이 있는 서비스 계정 키·서명키를 구분해서 관리해요.

---

## 3층 구조

```
┌─────────────────────────────────────────┐
│  로컬 개발                                │
│  .env (gitignore)                        │
│  flutter run --dart-define=KEY=$VALUE   │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  CI · 배포                                │
│  GitHub Secrets                          │
│  .github/workflows/*.yml 에서 참조          │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  런타임                                   │
│  String.fromEnvironment('KEY')           │
│  (빌드 시점 상수로 주입됨)                  │
└─────────────────────────────────────────┘
```

---

## 로컬 `.env` 파일

### 파일 위치

레포 루트의 `.env` 에 둬요 (git 무시). `.env.example` 을 복사해서 시작해요:

```bash
cp .env.example .env
$EDITOR .env
```

### 내용

```bash
# .env (커밋 금지) — .env.example 참조
SENTRY_DSN=https://xxx@sentry.io/yyy
POSTHOG_KEY=phc_xxx
POSTHOG_HOST=https://us.i.posthog.com    # default 와 동일이면 생략 가능
BASE_URL=https://api.example.com
APP_ENV=dev
SSL_PINS=sha256/AAA=,sha256/BBB=         # 옵션
KAKAO_NATIVE_KEY=...                     # auth_kit + kakao 활성 시
NAVER_CLIENT_ID=...                      # Naver native 설정에 연결할 값 (자동 전달되지 않음)
NAVER_CLIENT_SECRET=...                  # Android metadata / iOS Nid* 설정에 전달
```

> Google OAuth (Google Sign-In) 의 Client ID 는 `google-services.json` / `GoogleService-Info.plist` 안에 포함되므로 별도 환경변수가 필요 없어요.

### 실행 시 주입

`.env` 파일은 자동으로 앱에 전달되지 않아요. 실행할 때 파일을 지정해요.

```bash
<repo> dev start --dart-define-from-file=.env
```

래퍼인 [`scripts/run/start.sh`](../../scripts/run/start.sh) 는 flavor 와 `APP_ENV` 를 맞추고 필요한 실행 옵션을 Flutter 에 전달해요. 값을 `grep`·`cut` 으로 나누면 `=` 이 들어 있는 값이 잘릴 수 있어요. `.env` 를 셸 스크립트로 실행하는 대신 Flutter 의 파일 주입 옵션을 사용해요.

---

## GitHub Secrets

### 등록

Repository → Settings → Secrets and variables → Actions → New repository secret

또는 스크립트로 일괄 업로드:

```bash
./scripts/signing/upload-secrets-to-github.sh <app-slug>
# → ~/Documents/keystores-pending/<app-slug>/ 의 키스토어 + passwords.txt 를 읽어
#   ANDROID_KEYSTORE_* 4종을 gh secret set.
#   (Play/GOOGLE_SERVICES_JSON_PROD/Sentry secret 은 수동 등록 안내 출력)
```

`GOOGLE_SERVICES_JSON_PROD` 는 gitignore 된 `android/app/src/prod/google-services.json` 을 CI 에서 복원하려고 두는 secret 이에요. 없으면 `google-services` 플러그인이 붙지 않아 `default_web_client_id` 가 생성되지 않고, **출시 빌드에서만 구글 로그인이 안 돼요** — `release-android` 워크플로가 fail-fast 로 막아 줘요.

```bash
base64 -i android/app/src/prod/google-services.json | gh secret set GOOGLE_SERVICES_JSON_PROD
```

### 워크플로우에서 참조

아래 예제는 `.env.prod` 에 실제 HTTPS `BASE_URL` 등 앱 설정을 준비하고, `main.dart` 의 지원 메일·개인정보처리방침 주소를 운영 값으로 바꿨다는 전제예요. CI 에서 이 파일을 사용할 경우 저장소에 커밋하지 않고 빌드 전에 필요한 값으로 생성해요.

```yaml
- name: Build
  run: flutter build appbundle --release --flavor prod --dart-define-from-file=.env.prod --dart-define=APP_ENV=prod --dart-define=SENTRY_DSN="$SENTRY_DSN"
  env:
    SENTRY_DSN: ${{ secrets.SENTRY_DSN }}
```

### Environment secrets

staging · production 분리가 필요하면 Environment 단위 secret 을 써요:

```yaml
jobs:
  deploy-prod:
    environment: production  # ← 이 환경의 secret 사용
    steps:
      - run: ...
```

---

## `--dart-define` 주입

### 빌드 시점 상수

```bash
flutter build appbundle --release --flavor prod \
  --dart-define-from-file=.env.prod --dart-define=APP_ENV=prod \
  --dart-define=SENTRY_DSN=https://xxx
```

### 코드에서 접근

```dart
// lib/kits/observability_kit/observability_env.dart (실제 코드)
class ObservabilityEnv {
  static const String sentryDsn = String.fromEnvironment('SENTRY_DSN');
  static const String postHogKey = String.fromEnvironment('POSTHOG_KEY');
  static const String postHogHost = String.fromEnvironment(
    'POSTHOG_HOST',
    defaultValue: 'https://us.i.posthog.com',  // ← default 가 의미 있는 경우만
  );
  static bool get isSentryEnabled => sentryDsn.isNotEmpty;
  static bool get isPostHogEnabled => postHogKey.isNotEmpty;
}
```

### defaultValue 관용

```dart
// default 없는 경우 — 미주입 시 빈 문자열 (Dart fromEnvironment 기본 동작)
static const dsn = String.fromEnvironment('SENTRY_DSN');
// → !dsn.isEmpty 로 활성 여부 판단

// default 가 의미 있는 경우만 명시
static const host = String.fromEnvironment('POSTHOG_HOST', defaultValue: 'https://us.i.posthog.com');
```

기본값을 지정하지 않은 `String.fromEnvironment` 는 값이 없을 때 빈 문자열을 반환해요. 이런 설정은 `isEmpty` 로 확인해요. `defaultValue` 를 지정했다면 그 값이 사용돼요.

---

## 절대 커밋 금지 목록

### `.gitignore` 확인

```gitignore
# 환경 변수
.env
.env.local
.env.production

# 자격 증명 (iOS)
*.mobileprovision
*.p8
*.p12
ios/fastlane/app_store_connect_api_key.json

# 자격 증명 (Android)
*.jks
*.keystore
android/app/upload-keystore.jks
android/play-store-credentials.json
android/key.properties

# Firebase
google-services.json
GoogleService-Info.plist

# Flutter 빌드 결과물
build/
.dart_tool/
```

### 실수로 커밋한 경우

먼저 노출된 값이 어떤 권한을 갖는지 확인해요. 서비스 계정 키나 인증 토큰처럼 비밀이어야 하는 값은 발급처에서 폐기·교체하고, 앱과 CI 의 참조도 바꿔요. Firebase 앱 설정 파일처럼 공개 식별자를 포함한 파일은 연결된 키의 제한 설정과 노출 범위를 함께 확인해요.

현재 파일에서 값을 지우는 것만으로 과거 커밋에서는 사라지지 않아요. 기록 정리가 필요하면 백업과 협업자 영향을 확인한 뒤 저장소의 절차에 따라 처리해요. 기록을 다시 써도 이미 복제된 저장소나 캐시까지 회수되지는 않으므로, 자격증명 교체를 기록 정리로 대신하지 않아요.

---

## 환경별 분리

<a id="개발--스테이징--프로덕션"></a>

### 개발 / 스테이징 / 프로덕션

```bash
# .env.dev
SENTRY_DSN=https://dev-dsn@sentry.io/...
BASE_URL=http://localhost:8081

# .env.staging
SENTRY_DSN=https://staging-dsn@sentry.io/...
BASE_URL=https://staging-api.example.com

# .env.prod
SENTRY_DSN=https://prod-dsn@sentry.io/...
BASE_URL=https://api.example.com
```

> ⚠️ 템플릿 기본 `.gitignore` 는 `.env` · `.env.local` · `.env.dev` · `.env.prod` · `.env.production` · `.env.*.local` 만 커버해요 — **`.env.staging` 은 포함되지 않아요**. staging 파일을 만들기 전에 `.gitignore` 에 `.env.staging` 라인을 먼저 추가하세요 (커밋 유출 방지).

### 빌드 타입별 주입

```bash
# staging 서버를 사용하는 prod flavor 빌드 예시
flutter build appbundle --release --flavor prod \
  --dart-define=APP_ENV=prod \
  --dart-define-from-file=.env.staging
```

템플릿의 native flavor 는 `dev` 와 `prod` 두 개예요. `.env.staging` 을 만들었다고 별도 staging flavor 가 생기지는 않아요. 위 예제는 prod 앱 식별자로 staging 서버에 연결하므로 배포 대상을 확인해서 사용해요.

---

## 키 갱신 주기 권장

| 키 | 갱신 |
|----|------|
| JWT_SECRET (백엔드) | 6개월 ~ 1년 |
| Sentry Auth Token | 1년 or 팀원 이탈 시 |
| Play Store JSON Key | 필요 시만 |
| App Store API Key | 1년 |
| Firebase Server Key | 거의 안 바꿈 |
| Android 키스토어 | 업로드 키와 앱 서명키를 구분해 보관해요. 분실·교체가 필요하면 해당 앱의 Play App Signing 설정과 키별 복구 절차를 확인해요 |

---

## 팀원 간 공유

### 안 되는 방법

- Slack · 이메일 · GitHub Issue 평문 — 금지
- 스크린샷 공유 — 금지

### 되는 방법

- **Bitwarden · 1Password** 공유 vault
- **Fastlane match** (인증서 암호화 git repo)
- GitHub 조직 Secrets (멤버 단위 권한)

---

## 파생 레포 체크리스트

- [ ] `.gitignore` 에 모든 비밀 파일 패턴 확인
- [ ] `.env.example` 에 필요 키 이름 · 설명 (값 없이)
- [ ] 팀 `.env` 공유 수단 (Bitwarden 등) 결정
- [ ] `scripts/signing/upload-secrets-to-github.sh` 실행 → GHA Secrets 설정
- [ ] 주기적 키 갱신 일정 설정

---

## 관련 문서

- [`security.md`](./security.md) — 난독화 · 키 보관
- [`android-deployment.md`](./android-deployment.md) · [`ios-deployment.md`](./ios-deployment.md)
- [`ci-cd.md`](./ci-cd.md)
