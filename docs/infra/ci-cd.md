<a id="ci--cd"></a>

# CI / CD

이 문서는 GitHub Actions 기반 **CI (분석 · 테스트 · 빌드)** 와 **CD (스토어 배포)** 를 다뤄요.

---

## 워크플로우 목록

| 파일 | 트리거 | 역할 |
|------|--------|------|
| `.github/workflows/ci.yml` | push · PR → main | analyze + test + android/ios 빌드 |
| `.github/workflows/release-android.yml` | tag `v*` | Android AAB → Play Internal |
| `.github/workflows/contract-sync.yml` | 매일 03:00 KST cron · 수동 | template-spring 의 계약 스냅샷 (`contract-snapshot.json`) 당김 → 변경 시 auto-PR (자동 머지 없음) |
| `.github/workflows/sync-docs.yml` | main push 의 `docs/**` 변경 · 수동 | `docs-template-flutter` 미러로 docs sync (PR 생성 + squash 자동 머지) |
| `.github/workflows/release-ios.yml` (예정) | tag `v*` | iOS → TestFlight |

---

## ci.yml

```yaml
# .github/workflows/ci.yml 발췌
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]   # main을 target으로 하는 PR만
  workflow_dispatch:   # 수동 실행 (gh workflow run ci.yml)

jobs:
  analyze-and-test:
    # push 이벤트일 때만 CI_ON_PUSH 게이트 적용 — PR·수동 실행은 항상 통과
    if: github.event_name != 'push' || vars.CI_ON_PUSH != 'false'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: subosito/flutter-action@v2
        with:
          channel: stable
          flutter-version: '3.44.8'
          cache: true
      - run: flutter pub get
      - run: dart format --output=none --set-exit-if-changed lib/ test/
      - run: dart run tool/configure_app.dart --audit         # Configure audit
      - run: bash tools/docs-check/docs-contract-test.sh      # Docs contract guard
      - run: flutter analyze
      - run: flutter test --reporter=expanded

  build-android:
    if: github.event_name != 'push' || vars.CI_ON_PUSH != 'false'
    needs: [analyze-and-test]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: {distribution: temurin, java-version: '17'}
      - uses: subosito/flutter-action@v2
      - run: flutter pub get
      # google-services.json 은 gitignored — CI 는 placeholder 를 생성해 빌드 가능성만 검증
      - run: <placeholder google-services.json 생성 (ci.yml 참고)>
      - run: flutter build apk --debug --flavor dev

  build-ios:
    if: github.event_name != 'push' || vars.CI_ON_PUSH != 'false'
    needs: [analyze-and-test]
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: subosito/flutter-action@v2
      - run: flutter pub get
      - run: flutter build ios --debug --no-codesign --flavor dev
```

<a id="cionpush-게이트-push-ci-는-기본적으로-꺼두는-스위치"></a>
<a id="ci_on_push-게이트--push-ci-는-기본적으로-꺼두는-스위치"></a>

### `CI_ON_PUSH` — push CI 실행 제어

세 job 모두 `github.event_name != 'push' || vars.CI_ON_PUSH != 'false'` 조건을 사용해요. `CI_ON_PUSH` 를 설정하지 않으면 push CI 가 실행되고, 값을 `false` 로 설정했을 때만 건너뛰어요. PR 과 수동 실행에는 이 설정이 적용되지 않아요.

push CI 를 끄면 러너 사용량을 줄일 수 있어요. 로컬 pre-push 훅은 분석·테스트 검사를 대신하지만 Android·iOS 빌드는 실행하지 않아요. 네이티브 설정이나 의존성을 변경했다면 CI 를 수동으로 실행해 빌드도 확인해요. 실제 실행 시간과 요금은 사용한 러너와 계정 정책에 따라 달라요.

```bash
# 끄기
gh variable set CI_ON_PUSH --body false --repo <owner>/<repo>
# 다시 켜기 (변수 삭제 = 게이트 해제)
gh variable delete CI_ON_PUSH --repo <owner>/<repo>
# 꺼진 상태에서 수동 1회 실행
gh workflow run ci.yml --repo <owner>/<repo>
```

### 단계 순서

1. **analyze-and-test** 를 먼저 통과해야 해요
2. 그다음 **build-android** / **build-ios** 가 병렬 실행돼요
3. 실패한 검사는 PR 에 표시돼요. 이 검사를 필수 상태 검사로 설정한 브랜치 보호 규칙이 있어야 머지가 차단돼요.

### 핵심 검증

- **`dart format --output=none --set-exit-if-changed lib/ test/`** — `lib/` 와 `test/` 의 포맷을 검사해요. 파일은 수정하지 않아요.
- **`dart run tool/configure_app.dart --audit`** — Kit 조합 정합성 ([`ADR-004`](../philosophy/adr-004-manual-sync-ci-audit.md)). `app_kits.yaml` 의 미존재 kit · `kit_manifest.requires` 미충족 · `auth_kit.providers` 의 unknown 이름을 PR 머지 전에 차단해요.
- **`bash tools/docs-check/docs-contract-test.sh`** — 목록에 등록된 옛 심볼이 남아 있는지, Dart `ErrorCode` 상수가 문서에 모두 나오는지 검사해요. 문서의 모든 설명이나 예제 동작을 검증하는 도구는 아니에요.
- **`flutter analyze`** — 정적 분석 ([`very_good_analysis`](https://pub.dev/packages/very_good_analysis) 룰셋 + 큐레이션, [`ADR-022`](../philosophy/adr-022-very-good-analysis.md))
- **`flutter test`** — `test/` 의 단위·위젯·Kit 조립·recipe fingerprint 테스트를 실행해요. 기기에서 수행하는 별도 통합 테스트까지 자동 실행하는 명령은 아니에요.

### CI 게이트 아님 (로컬 권장)

- **`./scripts/verify/coverage.sh`** — 커버리지 측정 + HTML 리포트 (월 1회 권장).

---

## release-android.yml

상세는 [`android-deployment.md`](./android-deployment.md) 를 참조하세요.

핵심 단계는 이래요:
1. `verify` job 이 먼저 돌아요 — format · configure audit · docs contract · analyze · test 로 `ci.yml` 의 analyze-and-test 와 같은 검사예요. 태그 push 는 `ci.yml` 을 트리거하지 않기 때문에(그쪽은 main 브랜치 push·PR 전용) 릴리스 경로에도 같은 게이트를 둬요. 이 job 이 실패하면 뒤 단계는 아예 시작하지 않아요.
2. Keystore · Play 자격증명을 디코딩해요
3. `flutter build appbundle --obfuscate --split-debug-info=...` 로 빌드해요
4. `fastlane android beta` 로 Play Internal 에 업로드해요
5. Sentry 심볼을 업로드해요 (`SENTRY_AUTH_TOKEN` · `SENTRY_ORG` · `SENTRY_PROJECT` 셋 중 하나라도 없으면 경고만 남기고 건너뛰어요)
6. 민감 파일을 삭제해요

---

## GitHub Secrets 관리

| Secret | 용도 |
|--------|------|
| `ANDROID_KEYSTORE_BASE64` | Android 업로드 키스토어 |
| `ANDROID_KEYSTORE_PASSWORD` · `ANDROID_KEY_PASSWORD` · `ANDROID_KEY_ALIAS` | 키스토어 비밀번호 |
| `PLAY_STORE_JSON_KEY` | Play Console 서비스 계정 |
| `GOOGLE_SERVICES_JSON_PROD` | prod Firebase `google-services.json` (base64) — 미등록 시 release-android 가 fail-fast |
| `APP_STORE_KEY_ID` · `APP_STORE_ISSUER_ID` · `APP_STORE_KEY_CONTENT` | App Store Connect API |
| `SENTRY_DSN` · `SENTRY_AUTH_TOKEN` · `SENTRY_ORG` · `SENTRY_PROJECT` | Sentry |
| `POSTHOG_KEY` | PostHog |

자세한 건 [`secrets-management.md`](./secrets-management.md) 를 보세요.

---

## Dependabot

```yaml
# .github/dependabot.yml (권장 설정 — 현재 템플릿엔 미포함. 아래를 추가하면 적용)
version: 2
updates:
  - package-ecosystem: pub
    directory: /
    schedule: {interval: weekly, day: monday}
    open-pull-requests-limit: 5
    labels: [dependencies]

  - package-ecosystem: github-actions
    directory: /
    schedule: {interval: weekly, day: monday}
    open-pull-requests-limit: 3
    labels: [dependencies, ci]
```

> Gradle 의존성 (`/android/app`) 은 현재 미포함이에요 — Android native 라이브러리 교체 빈도가 낮아 수동으로 관리해요. 필요하면 `package-ecosystem: gradle` 블록을 추가하세요.

추가하면 주 1회 PR 이 자동 생성돼요. 테스트가 통과하면 머지해요 (major 버전은 주의).

---

## Git Hooks (로컬)

`.githooks/` 에 pre-commit · commit-msg · pre-push 훅을 제공해요. `./scripts/init/setup.sh` 로 활성화해요:

```bash
./scripts/init/setup.sh
# → git config core.hooksPath .githooks
```

- **commit-msg**: `Co-Authored-By: Claude` 트레일러를 차단해요. AI 공동저자 표기는 금지하며, Conventional Commits 형식은 작성자가 확인해요.
- **pre-commit**: `dart format` 검사에 실패하면 커밋을 차단해요.
- **pre-push**: 먼저 `flutter pub get` 으로 의존성을 맞춘 뒤 CI 의 `analyze-and-test` 와 같은 순서로 format, configure audit, docs contract, analyze, test 를 실행해요. `.fvmrc` 와 설치된 FVM 이 있으면 핀 버전으로 검사해요. Android·iOS 빌드는 별도로 확인해야 해요.

---

## 배포 주기 권장

### 메이저 릴리스

- 월 1회 내외
- semver: `v1.0.0 → v2.0.0`
- changelog 수동 작성 or `conventional-changelog` 자동

<a id="마이너--패치"></a>

### 마이너 · 패치

- 필요 시
- `v1.1.0` · `v1.0.1`

### 핫픽스

- 긴급 버그
- main 직접 태그 or hotfix 브랜치 → tag
- 24시간 이내 Play Internal → Production 승격 목표

---

## 로컬 CI 재현

```bash
# 분석 · 테스트
flutter pub get
dart format --output=none --set-exit-if-changed lib/ test/
flutter analyze
dart run tool/configure_app.dart --audit
bash tools/docs-check/docs-contract-test.sh
flutter test

# Android 빌드 (dev/prod 플레이버 구성이라 --flavor 필수)
flutter build apk --debug --flavor dev

# iOS 빌드 (macOS)
cd ios && pod install && cd ..
flutter build ios --debug --no-codesign --flavor dev
```

CI 가 실패할 때 가장 빠른 디버깅은 로컬 재현이에요.

---

## 관련 문서

- [`android-deployment.md`](./android-deployment.md)
- [`ios-deployment.md`](./ios-deployment.md)
- [`secrets-management.md`](./secrets-management.md)
- [`ADR-004 · YAML ↔ Dart 동기화`](../philosophy/adr-004-manual-sync-ci-audit.md)
