# Android Deployment

이 문서는 **Fastlane + GitHub Actions + Play Console Internal** 배포를 다뤄요. `git tag v1.0.0 && git push --tags` 만으로 자동 배포돼요.

---

## 전체 흐름

```text
개발자                         GitHub                    Play Console
  │                              │                          │
  │ git tag v1.0.0               │                          │
  │ git push --tags              │                          │
  │─────────────────────────────▶│                          │
  │                              │                          │
  │                 release-android.yml 트리거                │
  │                  1. Keystore 디코딩                        │
  │                  2. fastlane android beta                  │
  │                     (AAB 빌드 + 난독화 + 심볼 생성)           │
  │                  3. Play Store 업로드 (Internal track)      │
  │                  4. Sentry 심볼 업로드                       │
  │                              │─────────────────────────▶│
  │                              │                          │ 내부 테스터 배포
  │                              │                          │
```

---

## 최초 설정 (1회)

### 1. 업로드 키스토어 생성

```bash
./scripts/signing/generate-upload-keystore.sh <app-slug>
```

생성물은 `~/Documents/keystores-pending/<app-slug>/` 에 임시 저장돼요 (키스토어 + `passwords.txt`, 커밋 금지)

### 2. 키스토어 · Play Console 자격 증명 GitHub Secrets 등록

```bash
./scripts/signing/upload-secrets-to-github.sh <app-slug>
```

이 스크립트는 `~/Documents/keystores-pending/<app-slug>/` 의 키스토어·비번을 읽어 **`ANDROID_*` 4종만 자동 업로드**해요. 나머지는 스크립트가 출력하는 안내대로 `gh secret set` 으로 직접 등록하세요:

필요한 GitHub Secrets:
- `ANDROID_KEYSTORE_BASE64` — 업로드 키스토어 (base64 인코딩) — *스크립트 자동*
- `ANDROID_KEYSTORE_PASSWORD` — *스크립트 자동*
- `ANDROID_KEY_PASSWORD` — *스크립트 자동*
- `ANDROID_KEY_ALIAS` — *스크립트 자동*
- `PLAY_STORE_JSON_KEY` — Play Console 서비스 계정 JSON — *수동*
- `GOOGLE_SERVICES_JSON_PROD` — prod Firebase `google-services.json` (base64) — *수동* — 이 파일은 gitignore 라 CI 가 secret 으로 복원해요. 없으면 `google-services` 플러그인이 적용되지 않아 `default_web_client_id` 가 안 생기고 **출시 빌드에서만 구글 로그인이 안 돼요** → 워크플로가 fail-fast 로 막아요 (`base64 -i android/app/src/prod/google-services.json | gh secret set GOOGLE_SERVICES_JSON_PROD`)
- `SENTRY_AUTH_TOKEN` — 심볼 업로드 — *수동*
- `SENTRY_ORG` · `SENTRY_PROJECT` — *수동*

### 3. Play Console 설정

- [Play Console](https://play.google.com/console) 에서 앱을 생성해요
- 서비스 계정 생성 → JSON 키 다운로드 → Google Cloud Console 에서 "Android Publisher" 권한을 부여해요
- 내부 테스트 track 을 활성화해요
- 최초 1번은 **수동 업로드** 가 필요해요 (AAB 직접 업로드) — 이후엔 API 로 가능해요

---

## 배포 트리거

```bash
# 버전 업 (pubspec.yaml 의 version 필드)
# version: 1.2.3+45
#         |     |
#         |     +- build number (Android versionCode)
#         +- semver (Android versionName)

git commit -am "chore: bump to 1.2.3+45"
git tag v1.2.3
git push origin main --tags
```

태그가 올라가면 **GHA 워크플로우가 자동 실행돼요** → `release-android.yml`.

---

## 워크플로우 상세

```yaml
# .github/workflows/release-android.yml (개요)
on:
  push:
    tags: ['v*']

jobs:
  release-android:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: subosito/flutter-action@v2

      - name: Decode Keystore
        run: echo "$ANDROID_KEYSTORE_BASE64" | base64 -d > android/app/upload-keystore.jks
        env:
          ANDROID_KEYSTORE_BASE64: ${{ secrets.ANDROID_KEYSTORE_BASE64 }}

      # gitignore 된 prod google-services.json 복원 (없으면 구글 로그인 불능 → fail-fast)
      - name: Write google-services.json (prod)
        run: echo "$GOOGLE_SERVICES_JSON_PROD" | base64 -d > android/app/src/prod/google-services.json
        env:
          GOOGLE_SERVICES_JSON_PROD: ${{ secrets.GOOGLE_SERVICES_JSON_PROD }}

      - name: Write Play Store JSON
        run: echo "$PLAY_STORE_JSON_KEY" > android/play-store-credentials.json

      - name: Run fastlane beta (build + Play Internal upload)
        working-directory: android
        env:
          SENTRY_DSN: ${{ secrets.SENTRY_DSN }}
          POSTHOG_KEY: ${{ secrets.POSTHOG_KEY }}
          POSTHOG_HOST: ${{ secrets.POSTHOG_HOST }}
        # Fastfile 의 build_release lane 이 ENV → --dart-define 으로 주입
        # (--obfuscate + --split-debug-info=build/symbols 포함)
        run: bundle exec fastlane android beta

      - name: Upload Sentry mapping
        # ProGuard mapping (Kotlin/Java) + Dart split-debug-info 둘 다 업로드
        working-directory: android
        env:
          SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
          SENTRY_ORG: ${{ secrets.SENTRY_ORG }}
          SENTRY_PROJECT: ${{ secrets.SENTRY_PROJECT }}
        run: bundle exec fastlane android upload_sentry_mapping version:${{ steps.version.outputs.version }}

      - name: Cleanup
        run: rm -f android/app/upload-keystore.jks android/play-store-credentials.json
```

---

## Fastlane 구성

```ruby
# android/fastlane/Fastfile (요약 — 실제 4 lane 구성)
default_platform(:android)

platform :android do
  # 1) AAB 빌드 + Dart 난독화 + 관측성 키 주입
  lane :build_release do
    sh "cd ../.. && flutter build appbundle --release --flavor prod " \
       "--obfuscate --split-debug-info=build/symbols " \
       "--dart-define=SENTRY_DSN=#{ENV['SENTRY_DSN'] || ''} " \
       "--dart-define=POSTHOG_KEY=#{ENV['POSTHOG_KEY'] || ''}"
  end

  # 2) Play Internal 업로드 (build_release 호출 후)
  lane :beta do
    build_release
    upload_to_play_store(
      track: 'internal',
      aab: '../build/app/outputs/bundle/prodRelease/app-prod-release.aab',
      json_key: ENV['PLAY_STORE_JSON_KEY_PATH'] || 'play-store-credentials.json',
      skip_upload_metadata: true,
      skip_upload_images: true,
      skip_upload_screenshots: true,
    )
  end

  # 3) Production 트랙 승격 (수동)
  lane :deploy do
    upload_to_play_store(track: 'production', track_promote_to: 'production', ...)
  end

  # 4) Sentry 심볼 업로드 (ProGuard mapping + Dart split-debug-info)
  lane :upload_sentry_mapping do |options|
    # sentry-cli 로 release new → upload-proguard → upload-dif → finalize
  end
end
```

---

## Internal → Closed → Open → Production

Play Console 워크플로우:

1. **Internal test**: 100명 이하 · 즉시 · 승인 불필요
2. **Closed test** (Alpha): 1000명 이하 · 이메일 초대
3. **Open test** (Beta): 무제한 · 공개 URL
4. **Production**: 정식 배포 · 심사 1~7일

본 GHA 는 **Internal 만** 자동 배포해요. 상위 track 승격은 Play Console 에서 수동으로 해요.

---

## 트러블슈팅

### "Upload key not matching"

Play Console 의 App Signing 에서 "Upload certificate" 가 `upload-keystore.jks` 와 다르면 발생해요. 처음 앱 등록 시 **Play App Signing 을 활성화** 하고 upload 인증서 지문을 맞춰요.

### "Version code already used"

`pubspec.yaml` 의 `version` 의 `+` 뒤 숫자가 Play 에 이미 올라간 값과 같거나 작으면 실패해요. 항상 증가시켜요.

### "Package name conflict"

Play Console 앱 패키지명과 Android `applicationId` 가 같아야 해요. 새 앱 생성 시 `rename-app.sh` 결과를 확인하세요.

---

## 파생 레포 체크리스트

- [ ] `<repo> local init <slug> com.<org>.<slug>` 실행 완료 (rename + .env + pub get)
- [ ] `<repo> prod init` 으로 Firebase prod project + Android 앱 등록 + SHA-1 추가 + google-services.json 다운
- [ ] Play Console 앱 생성 + Play App Signing 활성화
- [ ] 서비스 계정 · JSON 키 발급 + Android Publisher 권한
- [ ] `generate-upload-keystore.sh` 로 keystore 생성
- [ ] `upload-secrets-to-github.sh` 로 `ANDROID_*` 4종 자동 업로드
- [ ] `PLAY_STORE_JSON_KEY` · `GOOGLE_SERVICES_JSON_PROD` · `SENTRY_AUTH_TOKEN` · `SENTRY_ORG` · `SENTRY_PROJECT` 를 `gh secret set` 으로 수동 등록
- [ ] 최초 AAB 수동 업로드 (Play Console)
- [ ] 내부 테스터 이메일 등록
- [ ] `v1.0.0` 태그 push → 자동 배포 확인

---

## 관련 문서

- [`ios-deployment.md`](./ios-deployment.md)
- [`security.md`](./security.md) — 난독화 · 심볼 업로드
- [`ci-cd.md`](./ci-cd.md)
- [`secrets-management.md`](./secrets-management.md)
- [`ADR-020 · 보안 방어선`](../philosophy/adr-020-security-hardening.md)
