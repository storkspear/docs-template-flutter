# iOS Deployment

이 문서는 Fastlane 과 App Store Connect 를 이용해 TestFlight 배포를 준비하는 절차를 설명해요. iOS 빌드에는 macOS 와 Xcode 가 필요해요.

> 템플릿에는 iOS `Fastfile` 과 자동 배포 워크플로우가 아직 없어요. 아래 예제를 앱의 서명·빌드 설정에 맞게 작성한 뒤 Fastlane 을 실행하거나, Xcode 에서 직접 배포해요.

---

## 최초 설정 (1회)

<a id="1-apple-developer-계정--bundle-id"></a>

### 1. Apple Developer 계정 + Bundle ID

- [Apple Developer](https://developer.apple.com) 멤버십을 준비해요. 가입 비용은 등록 화면에서 확인해요.
- Bundle ID 등록: `Identifiers` → `+` → App IDs
- Apple 로그인 provider 를 사용할 때는 Sign in with Apple 을 켜요. FCM 원격 푸시를 사용할 때는 Push Notifications 설정도 필요해요. `notifications_kit` 의 로컬 알림만 쓴다면 원격 푸시 설정은 필요하지 않아요.

<a id="2-인증서--프로비저닝-프로파일"></a>

### 2. 인증서 + 프로비저닝 프로파일

Fastlane match 를 쓰면 팀원이 같은 인증서와 프로비저닝 프로파일을 사용할 수 있어요. 먼저 `ios/Gemfile` 에 Fastlane 을 등록하고 `bundle install`, `bundle exec fastlane match init` 으로 인증서 저장소를 설정해요. 다음 명령은 이 초기 설정을 마친 뒤 실행해요.

```bash
cd ios
bundle exec fastlane match appstore --readonly=false
```

또는 수동으로 해요:
- Keychain Access → Certificate Assistant → Request Certificate
- Apple Developer Portal 에서 Distribution Certificate 생성
- App Store Provisioning Profile 다운로드 → Xcode 에 import

### 3. App Store Connect 앱 등록

- [App Store Connect](https://appstoreconnect.apple.com) → My Apps → `+`
- Bundle ID 선택 · SKU · 앱 이름 입력
- TestFlight 활성화

### 4. Fastlane API Key

App Store Connect → Users and Access → Keys → `+`  
권한: Developer · Access to Download Reports

생성된 `.p8` 파일 + Key ID + Issuer ID 를 GitHub Secrets 에 등록해요.

---

## Fastlane 구성 (예정)

아래는 파생 레포에서 작성할 `beta` lane 예제예요. Bundle ID 와 프로파일 이름을 앱 값으로 바꾸고, prod 환경의 Flutter 빌드 설정과 CocoaPods 의존성을 준비한 뒤 사용해요. `match init` 만으로 이 lane 이 생성되지는 않아요.

```ruby
# ios/fastlane/Fastfile
default_platform(:ios)

platform :ios do
  desc "Deploy to TestFlight"
  lane :beta do
    match(type: "appstore", readonly: true)

    build_app(
      workspace: "Runner.xcworkspace",
      scheme: "prod",
      configuration: "Release-prod",
      export_method: "app-store",
      export_options: {
        provisioningProfiles: {
          "com.example.app" => "match AppStore com.example.app"
        }
      }
    )

    upload_to_testflight(
      api_key_path: "fastlane/app_store_connect_api_key.json",
      skip_waiting_for_build_processing: true,
    )
  end
end
```

---

## GHA 워크플로우 (예정)

자동 배포를 추가한다면 `.github/workflows/release-ios.yml` 에서 다음 순서로 구성해요. 아직 제공되는 워크플로우가 아니므로 그대로 실행할 명령 목록으로 보지는 마세요.

1. `v*` 태그를 받아 `macos-latest` 러너에서 저장소를 체크아웃해요.
2. 프로젝트의 Flutter 버전과 Ruby 를 설치하고, `flutter pub get`, `bundle install`, CocoaPods 설치를 마쳐요.
3. prod 환경 설정과 서명 자격증명을 준비해요. App Store Connect API 키는 `APP_STORE_KEY_ID`, `APP_STORE_ISSUER_ID`, `APP_STORE_KEY_CONTENT` 를 환경변수로 전달하고 JSON 직렬화 도구로 `ios/fastlane/app_store_connect_api_key.json` 에 기록해요. `.p8` 본문에는 줄바꿈이 있으므로 문자열을 YAML heredoc 에 직접 끼워 넣지 않아요.
4. `ios/` 에서 `bundle exec fastlane beta` 를 실행해요.
5. Sentry 를 사용한다면 이 빌드의 심볼을 업로드해요.
6. 성공 여부와 관계없이 임시 키 파일을 정리해요.

API 키 JSON 은 `key_id`, `issuer_id`, `key`, `in_house: false` 필드를 사용해요. `match` 인증과 키 파일 경로까지 로컬에서 확인한 뒤 CI 로 옮겨요.

---

## 주요 차이 (Android vs iOS)

| 항목 | Android | iOS |
|------|---------|-----|
| 빌드 환경 | Ubuntu (ubuntu-latest) | macOS (macos-latest) |
| 실행 시간·비용 | 빌드 결과와 계정의 러너 요금으로 확인해요 | 빌드 결과와 계정의 macOS 러너 요금으로 확인해요 |
| 서명 | 업로드 키스토어와 Play App Signing 을 구분해 관리해요 | 배포 인증서와 프로비저닝 프로파일을 준비해요. APNs 키는 원격 푸시 설정에 사용해요 |
| 심사 | 출시 방식과 검토 상태에 따라 달라요 | 테스트·출시 방식과 검토 상태에 따라 달라요 |
| 테스트 배포 | Internal · Closed · Open 트랙을 사용해요 | TestFlight 내부·외부 테스트를 사용해요 |

---

## TestFlight 내부 테스트

빌드 업로드 후 App Store Connect 에서:

1. TestFlight → Internal Testing → Testers 를 추가해요 (본인 Apple ID)
2. 업로드된 빌드의 처리 상태와 테스트에 필요한 설정을 확인해요.
3. TestFlight 앱으로 설치해요

외부 테스트는 App Store Connect 에서 베타 심사 필요 여부와 진행 상태를 확인해요. 처리 시간은 고정되어 있지 않아요.

---

## 파생 레포 체크리스트

- [ ] Apple Developer 계정 확보
- [ ] Bundle ID 등록 + Capabilities 추가
- [ ] Fastlane match repo 생성 (git repo 로 인증서 동기화)
- [ ] App Store Connect 앱 등록
- [ ] API Key 발급 → GitHub Secrets (`APP_STORE_KEY_ID` · `APP_STORE_ISSUER_ID` · `APP_STORE_KEY_CONTENT`)
- [ ] `rename-app.sh` 로 Bundle ID 일괄 변경
- [ ] (iOS `Fastfile` 작성 후 — 위 "Fastlane 구성 (예정)" 참고) 로컬에서 `bundle exec fastlane beta` 테스트
- [ ] TestFlight 에 빌드 업로드 확인

---

## 관련 문서

- [`android-deployment.md`](./android-deployment.md)
- [`security.md`](./security.md) — Keychain accessibility
- [Fastlane iOS 공식](https://docs.fastlane.tools/getting-started/ios/setup/)
