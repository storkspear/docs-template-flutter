# Scripts

이 문서는 루트의 `factory` 통합 dispatcher, `scripts/` 의 bash 도구, `tool/` 의 Dart 스크립트를 정리해요.

---

## factory (root)

통합 명령어 dispatcher 예요. `./factory install` 로 symlink 를 등록하면 어디서든 `<repo> <cmd>` 로 호출할 수 있어요.

| 명령 | 용도 | 실행 시점 |
|------|------|---------|
| `./factory install` | `~/.local/bin/<repo>` symlink 등록 | clone 직후 1회 |
| `<repo> test` | 개발 준비 검증 (7 step) | 셋업 완료 후 / 수시 |
| `<repo> test --no-backend` | template-spring 미실행 환경 | 백엔드 없이 점검 |
| `<repo> test --skip-tests` | flutter test 생략 (빠른 점검) | 정적 분석만 확인 |
| `<repo> test --with-build` | apk debug 빌드 포함 | 배포 직전 점검 |
| `<repo> --help` | 명령 목록 + 사용법 | 항상 |

env-verb dispatch 방식이에요 — 첫 인자가 `local`/`dev`/`prod`/`all` 이면 env 고, 아니면 default `local` 이에요. verb `test` 는 짝 백엔드 (`template-spring`) 와 동일해서 양쪽 운영 시 명령어가 일관돼요.

---

## scripts/ (bash)

| 파일 | 용도 | 실행 시점 |
|------|------|---------|
| `lib/common.sh` | 공용 헬퍼 (info/ok/warn/fail/section) | factory 및 다른 sh 가 source |
| `lib/init-common.sh` | init 3종 공용 (prereq 검증 · 공동 작업자 모드 감지 · .env 생성 · placeholder 채움) | init-*.sh 가 source |
| `lib/firebase.sh` | Firebase 프로젝트/앱 생성 · plist/json 다운로드 헬퍼 | init-dev/prod 가 source |
| `verify/readiness-check.sh` | 개발 준비 7 step 검증 | factory 의 `test` verb |
| `init/setup.sh` | git hooks 활성화 | clone 직후 1회 |
| `app/rename-app.sh` | 앱 이름 · Bundle ID 일괄 치환 | 파생 레포 생성 시 |
| `init/init-local.sh` | rename + `.env` + `flutter pub get` 한 번에 | `<repo> local init` |
| `init/init-dev.sh` | Firebase dev 프로젝트 + 앱 등록 + plist/json + link-oauth | `<repo> dev init` |
| `init/init-prod.sh` | 동일 흐름의 prod 버전 (별도 Firebase 프로젝트) | `<repo> prod init` |
| `run/start.sh` | flutter run 래퍼 (mock 자동 폴백 · flavor 라우팅) | `<repo> <env> start` |
| `signing/link-oauth.sh` | GoogleService-Info plist → AppEnv-secrets xcconfig 주입 | `<repo> <env> link-oauth`. env 를 생략하면(`local link-oauth`) **prod 기본값**이라 `AppEnv-secrets-prod.xcconfig` 를 갱신해요 — dev 를 쓰려면 `<repo> dev link-oauth` |
| `app/regenerate-assets.sh` | 런처 아이콘 + 스플래시 재생성 | 아이콘 · 스플래시 변경 후 |
| `verify/coverage.sh` | 테스트 커버리지 측정 + HTML 리포트 | 월 1회 정기 점검 |
| `signing/generate-upload-keystore.sh` | Android 업로드 keystore 생성 (비대화형) | 첫 Android 배포 전 |
| `signing/batch-backup-keystores.sh` | pending keystore 들을 암호화 7z 로 일괄 백업 | 정기 운영 |
| `signing/upload-secrets-to-github.sh` | Android 서명 Secrets 4종 GHA 업로드 | 첫 배포 전 · 키 갱신 시 |
| `docs/sync-docs.sh` | docs/ → docs-template-flutter mirror | docs 변경 push 시 (CI) |

---

## factory + test verb

### factory

env-verb 패턴 통합 dispatcher 예요 (340줄 bash).

```bash
# 첫 사용 (clone 직후)
./factory install                       # ~/.local/bin/<repo> symlink 등록
./factory install --symlink=mt          # 사용자 alias 로 등록 (긴 레포명 단축)

# 이후 어디서든
<repo> test                             # default = local
<repo> local test                       # env 명시
<repo> --help                           # 명령 목록
```

**메타 레포 가드**: `git remote get-url origin` 이 `*/template-flutter` 면 `install` 을 차단해요 — 메타 레포 자체에선 직접 `./factory <cmd>` 호출만 허용해요.

### test verb (개발 준비 검증)

7 step fail-fast 검증이에요. 짝 백엔드 (`template-spring`) 의 `<repo> test` 와 동일한 명령어라 양쪽 운영이 일관돼요.

```bash
<repo> test                             # default 동작
<repo> test --no-backend                # template-spring 미실행 환경
<repo> test --skip-tests                # flutter test 생략 (빠른 점검)
<repo> test --with-build                # apk debug 빌드 추가 (~35s)
<repo> test --verbose                   # 각 step 의 raw 출력
```

내부적으로 `scripts/verify/readiness-check.sh` 를 호출해요. 직접 호출도 가능하지만 (`bash scripts/verify/readiness-check.sh`) factory 경유가 권장돼요.

| Step | 검증 |
|---|---|
| 1 | Flutter env (`flutter doctor`) |
| 2 | Dependencies (`flutter pub get`) |
| 3 | Config audit (`dart run tool/configure_app.dart --audit`) |
| 4 | Code analysis (`flutter analyze`) |
| 5 | Format check (`dart format --output=none --set-exit-if-changed lib/ test/`) |
| 6 | Tests (`flutter test --reporter=compact`) — `--skip-tests` 로 생략 가능 |
| 7 | Backend ping (`$BASE_URL/actuator/health`) — `--no-backend` 로 생략 가능 |
| 8 | Build smoke (`flutter build apk --debug --flavor dev`) — `--with-build` 로 활성. flavor 를 명시해야 해요 — 이 템플릿은 productFlavors(dev/prod)를 쓰므로 flavor 없이는 Gradle 이 `app-dev-debug.apk` 를 만드는데 flutter 는 `app-debug.apk` 를 찾다 실패해요 |

마지막 출력이 "🎉 개발할 준비가 완료되었습니다" 면 코딩을 시작하면 돼요.

**환경변수**: `BASE_URL` (default: `http://localhost:8081` — template-spring 기본 포트)

---

## setup.sh

```bash
#!/bin/bash
# git hooks 활성화
git config core.hooksPath .githooks
```

**1회만 실행해요**. `.githooks/commit-msg` · `.githooks/pre-commit` · `.githooks/pre-push` 가 자동 적용돼요.

```bash
./scripts/init/setup.sh
```

---

## coverage.sh

### 용도

`flutter test --coverage` 를 실행하고, `lcov` 가 설치돼 있으면 HTML 리포트 생성 + 브라우저 오픈까지 해줘요.
**CI 게이트가 아닌 수동 측정 도구** 예요 — 한 달에 한 번 정도 돌려서 "테스트가 안 닿는 코드 영역" 을 가시화해요.

### 사용법

```bash
./scripts/verify/coverage.sh             # 측정 + HTML 리포트 + 브라우저 오픈
./scripts/verify/coverage.sh --no-open   # 측정만 (CI/원격 환경)
```

### 의존성

- `lcov` (선택) — 미설치 시 lcov.info 생성 + 단순 라인 요약만 출력
  - macOS: `brew install lcov`
  - Ubuntu: `sudo apt install lcov`

### 산출물

- `coverage/lcov.info` — 원본 커버리지 데이터 (`.gitignore` 처리됨)
- `coverage/html/` — HTML 리포트 (lcov 설치 시)

### 게이트가 아닌 이유

솔로 운영 컨텍스트에서 임계값 자동 차단보다 **시각화 + 정기 점검** 이 ROI 가 좋다고 판단했어요. 자세한 트레이드오프를 다룬 별도 ADR 은 없어요 (단순 도구라 결정이 가벼워요).

---

## rename-app.sh

### 용도

파생 레포 생성 직후 앱 정체성을 일괄 변경해요.

### 사용법

```bash
./scripts/app/rename-app.sh <slug> <bundle_id>

# 예
./scripts/app/rename-app.sh my-tracker com.example.myTracker
```

### 변경 범위

- `pubspec.yaml` 의 `name:` → `<APP_NAME>` (slug 의 `-` 를 `_` 로 변환)
- `lib/main.dart` 의 `AppConfig.init(appSlug: ...)` → `<slug>`
- `android/app/build.gradle.kts` 의 `namespace` · `applicationId` → `<bundle_id>`
- `android/app/src/main/AndroidManifest.xml` 의 `android:label` → `<DisplayName>`
- Android Kotlin 파일의 `package` 선언 + 디렉토리 이동
- iOS Bundle ID — `ios/Flutter/AppEnv-{dev,prod}.xcconfig` 의 `BUNDLE_ID_BASE` → `<bundle_id>`
  (Runner 타깃의 `PRODUCT_BUNDLE_IDENTIFIER` 는 `$(BUNDLE_ID_BASE)$(BUNDLE_ID_SUFFIX)` 로 변수화돼 pbxproj 엔 직접 박혀있지 않아요. `Info.plist` 의 `CFBundleIdentifier` 도 `$(PRODUCT_BUNDLE_IDENTIFIER)` 변수 참조라 자동 반영돼요. iOS Swift 파일은 건드리지 않아요.)
- iOS RunnerTests 번들 ID — `project.pbxproj` 의 RunnerTests config 6개가 들고 있는 `BUNDLE_ID_BASE` → `<bundle_id>`
  (이 타깃은 baseConfiguration 이 `Pods-RunnerTests.*.xcconfig` 라 `AppEnv-*.xcconfig` 를 상속하지 않아요.)
- iOS 표시 이름 — `AppEnv-{dev,prod}.xcconfig` 의 `APP_DISPLAY_NAME` → `<DisplayName>`
  (`Info.plist` 의 `CFBundleDisplayName` 은 `$(APP_DISPLAY_NAME)` 변수 참조예요. dev 는 `DISPLAY_NAME_SUFFIX` 가 붙어 `<DisplayName> (DEV)` 로 보여요.)
- `ios/Runner/Info.plist` 의 `CFBundleName`
- `app_kits.yaml` 의 `app.name` · `app.slug`
- `android/fastlane/Appfile` 의 `package_name` → `<bundle_id>`
- import 경로 (`package:app_template/...` → `package:<APP_NAME>/...`, lib/ + test/ 일괄)

### 입력 규칙

- `<slug>` — 소문자 · 숫자 · 하이픈만 (`^[a-z][a-z0-9-]*$`). `AppConfig` 가 부팅 때 같은 정규식으로 검증하고 어긋나면 `ArgumentError` 로 크래시하므로 언더스코어는 거부해요 (`my_tracker` ✗ → `my-tracker` ✓).
- `<bundle_id>` — 영숫자 segment 2개 이상 (`com.example.myTracker`). Android 와 iOS 에 **같은 문자열** 이 들어가는데 Apple 은 언더스코어를, Android 는 하이픈을 허용하지 않아서 교집합인 영숫자만 받아요. 단어 구분이 필요하면 camelCase 를 쓰세요 (`com.foo.my_app` ✗ → `com.foo.myApp` ✓).

### 주의

- **번들 ID 는 unique 하고 되돌리기 어려워요**. App Store · Play Store 등록 후엔 변경할 수 없어요.
- 스토어 등록 전에 마지막으로 체크하세요.

---

## regenerate-assets.sh

### 용도

`flutter_launcher_icons.yaml` · `flutter_native_splash.yaml` 변경 후 아이콘 · 스플래시를 재생성해요.

### 사용법

```bash
./scripts/app/regenerate-assets.sh                  # 아이콘 + 스플래시 둘 다
./scripts/app/regenerate-assets.sh --dry-run        # 호출 명령만 출력
./scripts/app/regenerate-assets.sh --skip-splash    # 아이콘만 (--skip-icons 도 있음)
```

내부적으로:

```bash
dart run flutter_launcher_icons -f flutter_launcher_icons.yaml
dart run flutter_native_splash:create --path=flutter_native_splash.yaml
```

전제: `assets/icon/app_icon.png` (1024×1024) · `assets/icon/app_icon_foreground.png` · `assets/splash/logo.png` 교체가 완료돼 있어야 해요.

### 커스터마이징

아이콘 / 스플래시 이미지 경로는 각 YAML 파일에서 바꿔요:

```yaml
# flutter_launcher_icons.yaml 발췌
flutter_launcher_icons:
  image_path: "assets/icon/app_icon.png"  # ← 여기
  android: "launcher_icon"
  adaptive_icon_background: "#FFFFFF"
  adaptive_icon_foreground: "assets/icon/app_icon_foreground.png"
  min_sdk_android: 24
  ios: true
  remove_alpha_ios: true
```

---

## generate-upload-keystore.sh

### 용도

Android 업로드 keystore 를 생성해요 (Play App Signing 에 등록할 키).

### 사용법

```bash
./scripts/signing/generate-upload-keystore.sh <app-slug>   # slug 인자 필수
```

**완전 비대화형** — 물어보는 것 없이 keystore/key 비밀번호를 `openssl rand` 로 자동 생성하고, `-dname "CN=<app-slug>, ..."` 으로 keytool 을 바로 실행해요.

### 출력

- `android/app/upload-keystore.jks` — **커밋 금지** (이미 `.gitignore`)
- `android/key.properties` — fastlane 이 읽는 서명 설정 (이미 `.gitignore`)
- `~/Documents/keystores-pending/<app-slug>/` — 원본 사본 + `passwords.txt` (임시 백업, `batch-backup-keystores.sh` 로 영구 이전)

### 백업 필수

이 파일을 잃으면 **Play Store 에 같은 앱을 다시 업로드할 수 없어요**. Play App Signing 으로 복구할 수는 있지만 지원 요청이 필요하고 시간이 걸려요.

- Bitwarden · 1Password 에 base64 인코딩해서 저장해요
- 물리 USB 에 사본을 둬요

---

## batch-backup-keystores.sh

### 용도

`~/Documents/keystores-pending/` 에 쌓인 여러 앱의 keystore 를 한 번에 영구 백업해요 (앱 공장 운영 시).

### 사용법

```bash
./scripts/signing/batch-backup-keystores.sh ~/backup-keys
```

동작:

1. pending 폴더의 앱들을 **암호화 7z 아카이브** (`keystores-<타임스탬프>.7z`, 비밀번호 자동 생성 + 헤더 암호화) 로 묶어 `<backup-dir>` 에 생성해요
2. 아카이브 비밀번호를 화면에 출력해요 — **업무 노트에 꼭 저장하세요** (분실 시 복구 불가)
3. 저장 확인 (y) 후 pending 폴더를 비워요

의존성: `7z` (`brew install p7zip`).

---

## upload-secrets-to-github.sh

### 용도

Android **서명 Secrets 4종** 을 GHA Secrets 에 자동 업로드해요. (`.env` 파싱이나 Play JSON 자동 업로드는 하지 않아요.)

### 사용법

```bash
./scripts/signing/upload-secrets-to-github.sh <app-slug>   # slug 인자 필수
```

내부 — `~/Documents/keystores-pending/<app-slug>/` 를 읽어:

1. `upload-keystore.jks` base64 인코딩 → `ANDROID_KEYSTORE_BASE64`
2. `passwords.txt` 에서 추출 → `ANDROID_KEYSTORE_PASSWORD` · `ANDROID_KEY_PASSWORD` · `ANDROID_KEY_ALIAS`

나머지는 **수동 등록** 안내만 출력해요:

```bash
gh secret set PLAY_STORE_JSON_KEY   # Play Console service account JSON 내용
base64 -i android/app/src/prod/google-services.json | gh secret set GOOGLE_SERVICES_JSON_PROD
                                    # prod Firebase google-services.json (base64) — 릴리스 빌드 구글 로그인용
gh secret set SENTRY_AUTH_TOKEN     # sentry-cli 용 Auth Token
gh secret set SENTRY_ORG
gh secret set SENTRY_PROJECT
```

### 전제

- `./scripts/signing/generate-upload-keystore.sh <app-slug>` 이 선행돼야 해요 (pending 폴더가 있어야 해요)
- `gh` CLI 설치 + `gh auth login` 완료 + 파생 레포 git 루트에서 실행해요
- 레포에 write 권한이 필요해요

---

## tool/ (Dart)

| 파일 | 용도 |
|------|------|
| `configure_app.dart` | `app_kits.yaml` 선언 · 의존 검증 (`main.dart` 는 읽지 않음 — 수동 대조) |

### configure_app.dart

```bash
# 현재 상태 리포트
dart run tool/configure_app.dart

# CI 용 (불일치 시 exit 1)
dart run tool/configure_app.dart --audit
```

검증 범위는 **`app_kits.yaml` 선언 쪽** 이에요 — Kit 이름이 `lib/kits/` 에 실존하는지, `kit_manifest.yaml` 의 `requires` 의존이 모두 활성인지, `auth_kit.providers` 이름이 지원 목록에 있는지. `lib/main.dart` 의 `AppKits.install([...])` 은 읽지 않으니 yaml ↔ main.dart 일치는 수동 대조가 필요해요.

출력 예:

```text
=== Configure App ===
app.name  : Template App
app.slug  : template
palette   : DefaultPalette

--- Kits ---
  [x] auth_kit
  [x] backend_api_kit
  [x] observability_kit
  [x] update_kit
  [ ] ads_kit (available, not enabled)
  ...

Status: OK
```

### 의존성 검증

```text
--- Dependency Issues ---
  ✗ auth_kit requires backend_api_kit, which is not enabled
Status: ISSUES FOUND
```

자세한 건 [`ADR-004`](../philosophy/adr-004-manual-sync-ci-audit.md) · [`Conventions Overview`](../conventions/README.md) 를 보세요.

---

## 새 스크립트 추가 가이드

새 `scripts/<기능폴더>/*.sh` 작성 시 (기능별 폴더: `app/`·`init/`·`run/`·`signing/`·`verify/`·`docs/`, 공용 헬퍼는 `lib/`):

```bash
#!/bin/bash
set -euo pipefail   # 에러 시 즉시 종료

# 설명 주석
# 사용법 출력

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

if [[ "$#" -lt 1 ]]; then
  echo "Usage: $0 <arg>"
  exit 1
fi

# 실제 로직
```

실행 권한은 `chmod +x scripts/<기능폴더>/new-script.sh` 로 줘요.

---

## 관련 문서

- [`recipes.md`](./recipes.md) — Recipe 복사 → rename-app 흐름
- [`Android Deployment`](../infra/android-deployment.md) — 배포에서 스크립트 활용
- [`Secrets Management`](../infra/secrets-management.md)
