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

### `CI_ON_PUSH` 게이트 — push CI 는 기본적으로 꺼두는 스위치

세 job 전부에 `if: github.event_name != 'push' || vars.CI_ON_PUSH != 'false'` 가 걸려 있어요. Repo Variable `CI_ON_PUSH` 를 `false` 로 설정하면 push 트리거일 때 job 이 skip 되고, skip 된 job 은 러너를 잡지 않아 Actions 분을 전혀 소비하지 않아요. PR 과 `workflow_dispatch` 는 게이트와 무관하게 항상 실행돼요.

이렇게 꺼두는 이유는 러너 분 소모예요. private 레포는 러너별 분 배수가 달라 (Linux 1x / macOS 10x) ci.yml 1회 실행이 약 62분어치이고, 그중 macOS 러너의 Build iOS 가 약 78% 를 차지해요. Free 티어 월 2000분 기준 32회면 소진돼요. 그래서 push 시 CI 는 꺼두고, 같은 검증을 로컬 pre-push 훅 (아래 [Git Hooks](#git-hooks-로컬)) 이 대신해요.

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
3. 실패 시 PR 머지가 차단돼요

### 핵심 검증

- **`dart format --set-exit-if-changed lib/ test/`** — 포매팅 강제 (lib/test 한정)
- **`dart run tool/configure_app.dart --audit`** — Kit 조합 정합성 ([`ADR-004`](../philosophy/adr-004-manual-sync-ci-audit.md)). `app_kits.yaml` 의 미존재 kit · `kit_manifest.requires` 미충족 · `auth_kit.providers` 의 unknown 이름을 PR 머지 전에 차단해요.
- **`bash tools/docs-check/docs-contract-test.sh`** — Docs contract guard. `docs/api-contract/*.md` 의 claim 이 코드와 어긋나면 (죽은 심볼 참조, `ErrorCode` 상수의 문서화 누락) CI 에서 잡아요.
- **`flutter analyze`** — 정적 분석 ([`very_good_analysis`](https://pub.dev/packages/very_good_analysis) 룰셋 + 큐레이션, [`ADR-022`](../philosophy/adr-022-very-good-analysis.md))
- **`flutter test`** — 단위 · 위젯 · 통합 · fingerprint(recipe 재구성) 테스트 (golden 테스트는 현재 없음)

### CI 게이트 아님 (로컬 권장)

- **`./scripts/verify/coverage.sh`** — 커버리지 측정 + HTML 리포트 (월 1회 권장).

---

## release-android.yml

상세는 [`android-deployment.md`](./android-deployment.md) 를 참조하세요.

핵심 단계는 이래요:
1. Keystore · Play 자격증명을 디코딩해요
2. `flutter build appbundle --obfuscate --split-debug-info=...` 로 빌드해요
3. `fastlane android beta` 로 Play Internal 에 업로드해요
4. Sentry 심볼을 업로드해요
5. 민감 파일을 삭제해요

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

훅 내용:
- **commit-msg**: `Co-Authored-By: Claude` 트레일러를 차단해요 (AI 공동저자 표기 금지). ⚠️ Conventional Commits 포맷 자동 검증은 **하지 않아요** — 컨벤션 준수는 작성자 책임이에요.
- **pre-commit**: `dart format` 을 체크해요 (빠름, 1초 내) — 포맷 누락 시 commit 을 차단해요
- **pre-push**: ci.yml 의 analyze-and-test job 과 동일한 5개 검사를 순서대로 실행해요 (약 35초) — ① `dart format` 재확인 ② `dart run tool/configure_app.dart --audit` ③ `bash tools/docs-check/docs-contract-test.sh` ④ `flutter analyze` ⑤ `flutter test`. `.fvmrc` 가 있고 fvm 이 설치돼 있으면 `fvm flutter` / `fvm dart` 를 경유해 `.fvmrc` 핀 버전으로 검사해요 — push CI 를 `CI_ON_PUSH` 게이트로 꺼둔 상태에서 이 훅이 CI 검증을 대신해요.

---

## 배포 주기 권장

### 메이저 릴리스

- 월 1회 내외
- semver: `v1.0.0 → v2.0.0`
- changelog 수동 작성 or `conventional-changelog` 자동

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
