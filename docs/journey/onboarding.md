# Onboarding — 파생 레포 최초 셋업

파생 레포 생성 → 로컬에서 **앱이 시뮬레이터에 뜨기** 까지의 여정. 약 1시간 예상.

---

## §1 사전 설치 체크리스트

### 필수

- [ ] **Flutter SDK** `3.41.8` (`.fvmrc` 핀) — [fvm](https://fvm.app/) 으로 버전 관리 권장
- [ ] **Dart SDK** — Flutter 에 번들된 Dart 사용 (`pubspec.yaml` constraint: `^3.8.1`)
- [ ] **Git** 2.30+
- [ ] **Xcode** (iOS 빌드용) — macOS 전용. App Store 에서 설치
- [ ] **Android Studio** 또는 Android SDK Command-Line Tools
- [ ] **CocoaPods** (iOS 의존성) — `sudo gem install cocoapods`
- [ ] **node 18+** — `<repo> local init` 의 prereq 검증이 요구해요 (`brew install node`)
- [ ] **gh CLI** + 로그인 — `gh auth login` 까지 마쳐야 `local init` 이 통과해요

### 권장

- [ ] **VS Code** + Flutter extension 또는 **IntelliJ IDEA** + Flutter plugin
- [ ] **jq** — JSON 파싱용 (스크립트에서 사용)

### 확인

```bash
flutter doctor
```

모든 항목이 ✓ 거나, "Connected device" 만 비어있어야 정상. Android licenses · Xcode 설치 이슈는 `flutter doctor --android-licenses` 등으로 해결.

---

## §2 파생 레포 생성

### 1. GitHub 에서 "Use this template"

1. [`template-flutter`](https://github.com/storkspear/template-flutter) 접속
2. 우측 상단 **"Use this template"** → "Create a new repository"
3. 새 레포 이름 · 소유자 · 공개 여부 선택
4. 생성

> ⚠️ "Use this template" 은 히스토리가 끊긴 **독립 레포** 를 만들어요 (기존 레포에서 분기하는 방식이 아니에요). 자세한 배경은 [`ADR-001`](../philosophy/adr-001-template-cherry-pick.md).

### 2. 클론

```bash
# SSH (권장 — 이후 git push 도 OAuth 재인증 없이)
git clone git@github.com:<your-org>/<your-app>.git
cd <your-app>
```

> SSH key 미설정이면 즉시 `Permission denied (publickey)` 로 막혀요. 두 옵션:
> - **SSH key 셋업**: [GitHub 공식 가이드](https://docs.github.com/en/authentication/connecting-to-github-with-ssh)
> - **HTTPS 로 우회**: `git clone https://github.com/<your-org>/<your-app>.git` — gh CLI 가 로그인돼 있으면 토큰으로 자동 인증

### 3. git hooks 활성화

```bash
./scripts/init/setup.sh
# → git config core.hooksPath .githooks
```

commit-msg · pre-commit · pre-push 훅이 자동 적용돼요.

### 4. 템플릿 remote 등록 (선택, cherry-pick 전파용)

```bash
git remote add template https://github.com/storkspear/template-flutter.git
git fetch template
```

자세한 건 [`Migration from Template`](../reference/migration-from-template.md).

---

## §3 앱 정체성 설정 + 로컬 셋업 (`<repo> local init`)

`factory` CLI 의 `local init` verb 가 다음 4단계를 한 번에 처리해요:

1. **rename-app.sh 실행** — 아래 변경 목록을 자동 적용
2. **`.env.example` → `.env`** 복사 (placeholder 보존)
3. **`flutter pub get`** 실행
4. 다음 단계 안내 출력

### 사용

```bash
# 첫 1회 — factory shortcut 등록
./factory install                       # ~/.local/bin/<repo-name> symlink

# rename + .env + pub get 한 번에
<repo> local init <slug> <bundle_id>    # 인자 명시 (CI 친화)
<repo> local init                       # 또는 interactive prompt

# 예
<repo> local init my_tracker com.example.mytracker
```

> 옵션: `<repo> local init --skip-rename` (이미 rename 한 경우), `<repo> local init --reinit` (강제 재실행).

rename 단계에서 변경되는 곳:

- `pubspec.yaml` 의 `name:`
- `lib/main.dart` 의 `AppConfig.init(appSlug: ...)`
- `android/app/build.gradle.kts` 의 `namespace` · `applicationId`
- `android/app/src/main/AndroidManifest.xml` 의 `android:label`
- Android Kotlin 파일의 `package` 선언 + 디렉토리 이동
- `ios/Flutter/AppEnv-{dev,prod}.xcconfig` 의 `BUNDLE_ID_BASE`
  (iOS PRODUCT_BUNDLE_IDENTIFIER 가 `$(BUNDLE_ID_BASE)$(BUNDLE_ID_SUFFIX)` 변수로
  박혀있어 dev 빌드는 `<bundle_id>.dev`, prod 빌드는 `<bundle_id>` 로 자동 결정)
- `ios/Runner/Info.plist` 의 `CFBundleDisplayName` · `CFBundleName`
- `app_kits.yaml` 의 `app.name` · `app.slug`
- `android/fastlane/Appfile` 의 `package_name`
- import 경로 (`package:app_template/...` → `package:<APP_NAME>/...`, lib/ + test/ 일괄)

### 커밋

```bash
git add -A
git commit -m "chore: rename to <slug>"
```

> 직접 실행이 필요하면 (예: dry-run 검토): `bash scripts/app/rename-app.sh --dry-run <slug> <bundle_id>`.

---

## §4 Recipe 선택 (선택)

앱 유형이 명확하면 [`recipes/`](../reference/recipes.md) 중 하나 복사:

```bash
# 로컬 전용 앱
cp recipes/local-only-tracker.yaml app_kits.yaml

# 로컬 알림 앱
cp recipes/local-notifier-app.yaml app_kits.yaml

# 백엔드 연동 + 인증
cp recipes/backend-auth-app.yaml app_kits.yaml

# 소셜 로그인 중심 (Google/Apple/Kakao/Naver)
cp recipes/social-auth-app.yaml app_kits.yaml
```

### main.dart 동기화

선택한 recipe 에 맞게 `lib/main.dart` 의 `AppKits.install([...])` 수정.

예 (local-only-tracker):

```dart
// lib/main.dart — prefsStorage 는 main.dart 상단에서 이미 생성돼 있어요
await AppKits.install([
  LocalDbKit(database: () => AppDatabase()),
  OnboardingKit(steps: [...], prefs: prefsStorage),
  NavShellKit(tabs: [...]),
  ChartsKit(),
]);
```

### 검증

```bash
dart run tool/configure_app.dart
```

Status: OK 확인.

---

## §4.5 개발 준비 검증 (`<repo> test`)

지금까지 단계가 잘 됐는지 한 번에 확인하는 통합 명령어를 제공해요. 짝 백엔드 (`template-spring`) 의 `<repo> test` 와 동일 verb 라 양쪽 운영 시 일관됩니다.

```bash
./factory install                    # 첫 1회 — symlink 등록
<repo> test                          # 한 줄로 7 step 검증
```

검증 항목 (fail-fast):

1. Flutter env (flutter doctor)
2. Dependencies (flutter pub get)
3. Config audit (configure_app.dart --audit)
4. Code analysis (flutter analyze)
5. Format check (dart format)
6. Tests (flutter test)
7. Backend ping (`$BASE_URL/actuator/health`)

마지막 출력이 "🎉 개발할 준비가 완료되었습니다" 면 코딩 시작 가능.

### 옵션

| 플래그 | 동작 |
|---|---|
| `--no-backend` | template-spring 미실행 환경. Step 7 생략 |
| `--skip-tests` | Step 6 생략 (빠른 사전 점검) |
| `--with-build` | apk debug 빌드 추가 (~35s) |
| `--verbose` | 각 step 의 raw 출력 표시 |

---

## §5 첫 기동 (`<repo> local start`)

`<repo> local init` 단계에서 `flutter pub get` 까지 끝났으니 바로 빌드/실행으로 갑니다.

### iOS 만 — pod install (필요 시)

대부분 `local init` 후 첫 빌드 시 자동 실행되지만 명시적으로:

```bash
cd ios && pod install && cd ..
```

### 코드 생성 (필요 시)

`local_db_kit` 사용 시 `dart run build_runner build --delete-conflicting-outputs`.
i18n 추가 시 `flutter gen-l10n`.

### 시뮬레이터 / 에뮬레이터 준비

```bash
# iOS
open -a Simulator

# Android — AVD 부팅
flutter emulators --launch <AVD_ID>
```

### 앱 실행 — `local start` (Mock 자동 폴백)

```bash
<repo> local start                      # 자동 감지 + flutter run
<repo> local start -d <device-id>       # 디바이스 지정
```

`scripts/run/start.sh` 가 다음 규칙으로 분기해요 (debug 빌드 기준):

| 조건 | 동작 |
|---|---|
| `GoogleService-Info-{dev,prod}.plist` + `android/app/src/{dev,prod}/google-services.json` 모두 없음 | `--dart-define=AUTH_DEV_MOCK=true` 자동 주입 → 백엔드/OAuth 없이 keyless 시연 |
| 위 중 하나라도 있음 | 실 SDK 경로 (flutter run 그대로) |

처음 실행이면 빌드에 1~2분. 이후엔 hot reload.

### `AUTH_DEV_MOCK` 모드 동작 (선택 — Mock 폴백 진입 시)

template-spring 백엔드를 안 띄웠어도 인증 흐름 끝까지 keyless 시연 가능:

- 부팅 시 `BackendReachability.probe()` 가 `baseUrl/actuator/health` 핑 → connection refused
- `DevOfflineAuthInterceptor` 가 `/auth/*` 호출 가로채서 fake JWT 응답 반환
- Google / Apple 로그인 버튼은 SDK 모달 우회 → 즉시 fake credential 로 로그인 완료
- 로그인 후 `/home` 진입까지 백엔드 · OAuth 키 없이 시연 가능

자세한 메커니즘: [`auth_kit/README.md` Dev Mock 섹션](https://github.com/storkspear/template-flutter/blob/main/lib/kits/auth_kit/README.md#dev-mock-백엔드-없이-시연).

> ⚠️ **release 빌드 금지**: `<repo> local start --release` 는 `start.sh` 가 mock 자동 주입을 비활성화해요. 추가로 Dart 사이드의 `kReleaseMode + isDevMockEnabled` 가드가 startup 시 `StateError` throw — 이중 방어.

### 확인 포인트

- [ ] 시뮬레이터에 앱이 뜸
- [ ] 앱 이름이 `<slug>` 로 표시
- [ ] 스플래시 → 홈 화면
- [ ] `flutter run` 콘솔에 에러 없음

---

## §5.5 Firebase dev/prod 셋업 (실 OAuth 로 갈 때)

Mock 으로 흐름만 확인했으면, 실제 Google 로그인 동작까지 검증할 때 Firebase 자동화를 씁니다.

### 사전 1회 셋업

```bash
brew install firebase-cli                       # 또는 npm install -g firebase-tools
firebase login                                  # 인터랙티브 인증 1회
```

### dev 환경 (`<repo> dev init`)

```bash
<repo> dev init                                 # interactive 모드
# 또는
<repo> dev init --project=<slug>-dev            # project_id 명시
```

자동 수행:

1. Firebase `<slug>-dev` 프로젝트 생성
2. iOS 앱 등록 — Bundle ID = `<base>.dev` (AppEnv-dev.xcconfig 의 변수에서 읽음)
3. Android 앱 등록 — package = `<base>.dev` (productFlavors 의 applicationIdSuffix 가 부여)
4. `GoogleService-Info-dev.plist` + `android/app/src/dev/google-services.json` 다운로드 (둘 다 gitignored)
5. `.env.dev` placeholder 자동 채움 (Firebase IDs, OAuth Client IDs)
6. `link-oauth --env=dev` 자동 호출 → `ios/Flutter/AppEnv-secrets-dev.xcconfig` 생성 (gitignored)

### 사용자가 직접 마무리할 콘솔 1회 작업 (스크립트 출력에 URL 안내됨)

1. **Firebase Console → Authentication → Sign-in method → Google 활성화** (firebase CLI 미지원)
2. **Android SHA-1 추가** — debug.keystore SHA-1 자동 추출돼서 출력됨. 콘솔에 paste → 저장
3. plist 다시 다운로드 → `<repo> dev link-oauth` 재실행 (Auth 활성 후 CLIENT_ID 갱신)
4. `.env.dev` 의 `SENTRY_DSN` / `POSTHOG_KEY` / `BASE_URL` 직접 입력

### prod 환경 (`<repo> prod init`)

동일 흐름의 prod 버전 — Bundle ID 는 `.dev` suffix 없이 base 그대로, 별도 Firebase 프로젝트 (`<slug>-prod`).

```bash
<repo> prod init
```

### 빌드/실행 (실 OAuth)

```bash
<repo> dev start                                # dev flavor, com.<base>.dev Bundle ID
<repo> prod start                               # prod flavor, com.<base>
<repo> dev start --release                      # release 빌드 (mock 자동 주입 비활성)
```

---

## §6 다음 단계

로컬에서 앱이 뜨면 성공. 다음:

1. **Kit 조립 이해**: [`Journey 3단계 — Kit 조립`](./README.md#3-kit-조립은-어떻게--앱-유형-결정-30분) → 본인 앱 유형 확정
2. **외부 서비스 자격 증명**: Sentry · PostHog · Firebase · 소셜 로그인 ([`4단계`](./README.md#4-발급은-어디서--외부-서비스-자격-증명-1--2시간))
3. **첫 기능 구현**: [`Build First App`](./build-first-app.md)
4. **배포 준비**: [`Deployment`](./deployment.md)

막히면 [`Pitfalls`](./dogfood-pitfalls.md) 검색 먼저.

---

## 트러블슈팅

### `flutter pub get` 실패

- `pubspec.lock` 삭제 후 재시도
- Flutter 버전 확인 (`flutter --version`)
- 네트워크 / VPN 이슈

### iOS 빌드 실패 (pod install)

```bash
cd ios
pod repo update
pod install --repo-update
```

### Android 빌드 실패 (SDK licenses)

```bash
flutter doctor --android-licenses
# y 여러 번 눌러 수락
```

### `dart run tool/configure_app.dart` 가 ISSUES FOUND

- `app_kits.yaml` 의 Kit 이름이 `lib/kits/` 실제 폴더명과 일치하는지 확인 (오타 시 `not found in lib/kits/`)
- `requires` 누락 확인 (예: `auth_kit` 쓰면 `backend_api_kit` 도 활성)
- `auth_kit.providers` 에 지원 외 이름이 있는지 확인 (email/google/apple/kakao/naver 만)
- 참고: 이 도구는 `lib/main.dart` 를 읽지 않아요 — `AppKits.install([...])` 와의 일치는 수동 대조가 필요해요

더 많은 함정: [`Pitfalls`](./dogfood-pitfalls.md)

---

## 📖 책 목차 — Journey 2단계

| 방향 | 문서 | 한 줄 |
|---|---|---|
| ← 이전 | [`Architecture 한눈 요약`](./architecture.md) | 모듈 구조 한눈 (1단계) |
| → 다음 | [`Build First App`](./build-first-app.md) | 첫 기능 구현 (5단계) |

**막혔을 때**: [`함정`](./dogfood-pitfalls.md) / [`FAQ`](./dogfood-faq.md)
