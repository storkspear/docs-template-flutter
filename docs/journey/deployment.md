<a id="deployment--첫-운영-배포"></a>

# Deployment — 첫 운영 배포

첫 Android 내부 테스트 배포와 iOS TestFlight 업로드를 준비해요. Android 는 `release-android.yml` 로 자동 배포하고, iOS 는 파생 레포에서 Fastlane lane 을 작성하거나 Xcode Archive 를 사용해요. 최초 설정과 외부 심사에 걸리는 시간은 앱 상태에 따라 달라요.

---

## 개요

```text
로컬 개발 완료
  ↓
외부 서비스 자격증명 발급 (Sentry · PostHog · Firebase · 소셜 · 스토어)
  ↓
Android keystore · iOS 인증서 생성
  ↓
GitHub Secrets 등록
  ↓
스토어 앱 등록 + 최초 수동 업로드
  ↓
git tag v1.0.0 && git push --tags
  ↓
GHA 자동 배포 → Play Internal      (release-android.yml)
  ↓
iOS TestFlight 수동 배포            (fastlane beta 또는 Xcode Archive)
```

---

## §1 외부 서비스 자격증명 (1시간)

사용하는 서비스의 자격증명만 준비해요. Sentry·PostHog 는 해당 연동을 선택한 경우에, Firebase 원격 푸시 설정은 FCM 을 선택한 경우에 필요해요. 자세한 발급 절차는 [외부 서비스 설정](./README.md#4-발급은-어디서--외부-서비스-자격-증명-1--2시간) 에서 확인해요.

<a id="sentry-observability_kit"></a>

### Sentry (observability_kit)

- [ ] [Sentry](https://sentry.io) Flutter 프로젝트 생성
- [ ] DSN · Auth Token · Org · Project slug 확보

<a id="posthog-observability_kit"></a>

### PostHog (observability_kit)

- [ ] [PostHog](https://posthog.com) 프로젝트 생성
- [ ] Project API Key · Host 확보

<a id="firebase-notifications_kit-쓰면"></a>

### Firebase (notifications_kit 쓰면)

- [ ] [Firebase Console](https://console.firebase.google.com) 프로젝트 생성
- [ ] Android 는 `android/app/src/dev/` 와 `android/app/src/prod/` 에 각 환경의 `google-services.json` 을 배치해요.
- [ ] iOS 는 환경별 `GoogleService-Info-<env>.plist` 를 준비하고, 원격 푸시를 쓸 때 APNs 설정을 확인해요.

<a id="google-sign-in--apple-sign-in-auth_kit-쓰면"></a>

### Google Sign In / Apple Sign In (auth_kit 쓰면)

- [ ] OAuth 2.0 Client ID · Bundle ID 설정 ([`auth_kit`](../features/auth-kit.md))

---

## §2 Android 배포 준비 (30분)

### 1. 업로드 keystore 생성

```bash
./scripts/signing/generate-upload-keystore.sh <app-slug>
```

생성: `android/app/upload-keystore.jks` + `android/key.properties` (둘 다 gitignore). 비밀번호는 자동 생성돼 `~/Documents/keystores-pending/<app-slug>/passwords.txt` 에 임시 백업돼요.

키스토어와 비밀번호 파일이 `.gitignore` 에 포함되는지 확인하고 커밋하지 않아요. [Bitwarden](https://bitwarden.com/) 같은 비밀번호 관리 도구에 백업해요.

### 2. Play Console 앱 등록

- [Play Console](https://play.google.com/console) → 앱 만들기
- 앱 이름 · 기본 언어 · 앱/게임 구분 · 무료/유료
- **Play App Signing 활성화** (필수)
- 내부 테스트 track 활성화

<a id="3-서비스-계정--json-키"></a>

### 3. 서비스 계정 + JSON 키

- Play Console → Setup → API Access → Link Google Cloud Project
- 새 서비스 계정 생성 → **Android Publisher** 권한
- JSON 키 다운로드 → 안전하게 보관

### 4. 최초 AAB 수동 업로드

먼저 Play Console 에 앱을 등록하고 최초 AAB 를 수동으로 업로드해요. 이후 자동 배포 절차를 연결해요.

```bash
flutter build appbundle --release --flavor prod \
  --dart-define-from-file=.env.prod \
  --dart-define=APP_ENV=prod
# → build/app/outputs/bundle/prodRelease/app-prod-release.aab
```

이 앱에는 dev/prod flavor 가 있으므로 빌드할 flavor 를 지정해요. `prod` 는 출시용 앱 식별자를, `dev` 는 `.dev` 가 붙은 별도 식별자를 사용해요. Dart 설정인 `APP_ENV` 도 맞춰야 하며, 서버 주소와 서비스 키는 `.env.prod` 의 실제 값을 확인해요.

생성된 AAB 를 Play Console 에 올리고 내부 테스트 릴리스를 만들어요.

### 5. 내부 테스터 등록

Play Console → 내부 테스트 → 테스터 → 이메일 추가 (본인 포함)

---

## §3 iOS 배포 준비 (40분)

<a id="1-apple-developer-계정--bundle-id"></a>

### 1. Apple Developer 계정 · Bundle ID

- [Apple Developer](https://developer.apple.com) 유료 계정 ($99/년)
- Identifiers → `+` → App IDs → Bundle ID 등록
- Capabilities: Sign in with Apple · Push Notifications 등 필요 항목

### 2. Fastlane match 설정 (권장)

> ⚠️ 템플릿은 iOS fastlane 을 사전 셋업하지 않아요. `ios/fastlane/`, `ios/Gemfile` 모두 미존재. 아래는 첫 셋업 절차예요.

```bash
cd ios
bundle init
# Gemfile 에: gem 'fastlane'
bundle install
bundle exec fastlane match init
# git repo URL 입력 (인증서 암호화 저장소)

bundle exec fastlane match appstore --readonly=false
```

### 3. App Store Connect 앱 등록

- [App Store Connect](https://appstoreconnect.apple.com) → My Apps → `+`
- Bundle ID 선택 · SKU · 앱 이름

### 4. API Key

App Store Connect → Users and Access → Keys → `+`
- 권한: Developer
- `.p8` 파일 다운로드 · Key ID · Issuer ID 기록

### 5. 최초 TestFlight 업로드

§3.2 는 인증서 관리 설정이에요. 배포하려면 [iOS 배포 가이드](../infra/ios-deployment.md) 를 참고해 `beta` lane 도 작성해야 해요. 두 설정을 마친 뒤 실행해요.

```bash
cd ios
bundle exec fastlane beta
```

Xcode 로 배포한다면 prod scheme 을 선택하고 Product → Archive → Distribute 순서로 진행해요.

### 6. TestFlight 내부 테스터 등록

App Store Connect → TestFlight → Internal Testing → 본인 Apple ID 추가.

---

## §4 GitHub Secrets 등록 (20분)

<a id="1-android-서명-secrets--스크립트-자동-업로드"></a>

### 1. Android 서명 Secrets — 스크립트 자동 업로드

`generate-upload-keystore.sh` 가 만들어 둔 `~/Documents/keystores-pending/<app-slug>/` 를 읽어 서명 관련 4종만 자동 등록해요:

```bash
./scripts/signing/upload-secrets-to-github.sh <app-slug>
# [1/4] ANDROID_KEYSTORE_BASE64   (jks → base64)
# [2/4] ANDROID_KEYSTORE_PASSWORD
# [3/4] ANDROID_KEY_PASSWORD
# [4/4] ANDROID_KEY_ALIAS
```

전제: gh CLI 설치 + `gh auth login` + 파생 레포 git 루트에서 실행.

<a id="2-나머지-secrets--gh-secret-set-수동-등록"></a>

### 2. 나머지 Secrets — `gh secret set` 수동 등록

Play Console JSON 키 · Sentry · PostHog 값은 스크립트가 다루지 않아요. 발급받은 값을 직접 등록해요:

```bash
gh secret set PLAY_STORE_JSON_KEY < service-account.json   # Play Console 서비스 계정 JSON
base64 -i android/app/src/prod/google-services.json | gh secret set GOOGLE_SERVICES_JSON_PROD
                                   # prod Firebase google-services.json (base64) — 안 넣으면 릴리스 빌드에서 구글 로그인 불능 (워크플로가 fail-fast)
gh secret set SENTRY_AUTH_TOKEN    # sentry-cli 용 Auth Token (심볼 업로드)
gh secret set SENTRY_ORG           # 예: my-org
gh secret set SENTRY_PROJECT       # 예: my-app
gh secret set SENTRY_DSN           # 릴리스 빌드 --dart-define 주입용
gh secret set POSTHOG_KEY
gh secret set POSTHOG_HOST
```

iOS (TestFlight) 는 §3 처럼 로컬 fastlane 으로 진행하므로 GHA Secrets 등록이 필요 없어요.

---

## §5 첫 자동 배포 (10분)

### 버전 설정

```yaml
# pubspec.yaml
version: 1.0.0+1
#        |     |
#        |     +- build number
#        +- semver
```

### 태그 push

```bash
git commit -am "chore: prepare v1.0.0"
git tag v1.0.0
git push origin main --tags
```

### GHA 확인

- Repository → Actions
- `release-android.yml` 워크플로우 실행 확인
- 실행 결과와 실패한 단계가 없는지 확인해요.
- Play Console → 내부 테스트 → 새 버전 업로드 확인

### 내부 테스터에게 링크 공유

Play Console 에서 "사전 가입 URL" 복사 → 이메일 등록된 테스터에게 전달.

---

## §6 배포 주기

### 메이저

- 월 1회 내외
- `v1.0.0 → v2.0.0` — 파괴적 변경 · 큰 기능 추가

<a id="마이너--패치"></a>

### 마이너 · 패치

- 필요 시
- `v1.1.0` · `v1.0.1`

### 핫픽스

- 긴급 버그 → hotfix 브랜치 → 태그 → 24시간 내 배포

---

<a id="7-internal--production-승격"></a>

## §7 Internal → Production 승격

현재 GitHub Actions 는 Play Internal 에 업로드해요. 이후 공개 범위는 Play Console 에서 결정해요.

### 테스트 통과 후

1. Play Console → Internal → "Release to closed testing" (선택)
2. Closed → Open → **Production** 승격
3. Production 출시는 Play Console 에서 검토 상태와 출시 조건을 확인한 뒤 진행해요.

### 전략

- 내부 테스터에게 며칠 사용 → 피드백 수집
- 크래시 · 로그 확인 (Sentry)
- 문제 없으면 Production 승격
- 초기 출시 시 단계별 (Staged Rollout — 5% → 20% → 50% → 100%)

---

## §8 트러블슈팅

배포 관련 자주 막히는 증상은 [`Android Deployment · 트러블슈팅`](../infra/android-deployment.md#트러블슈팅) 에 정리돼 있어요. 그 외 일반 셋업 함정은 [`Pitfalls`](./dogfood-pitfalls.md) 참고.

---

<a id="-책-목차--journey-6--7단계"></a>

## 📖 책 목차 — Journey 6 · 7단계

| 방향 | 문서 | 한 줄 |
|---|---|---|
| ← 이전 | [`Build First App`](./build-first-app.md) | 첫 기능 완성 (5단계) |
| → 다음 | 도메인 확장 · 본인 앱 만들기 | 책은 여기까지. 이후는 자율 |

---

## 관련 문서

- [`Android Deployment`](../infra/android-deployment.md) — Android 상세
- [`iOS Deployment`](../infra/ios-deployment.md) — iOS 상세
- [`CI / CD`](../infra/ci-cd.md) — 워크플로우 상세
- [`Secrets Management`](../infra/secrets-management.md) — Secrets 관리
- [`Security`](../infra/security.md) — 난독화 · 보안
