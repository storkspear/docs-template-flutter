# Android Deployment

Play Console 준비부터 GitHub Actions의 Internal 트랙 업로드까지 한곳에서 설명해요. 계정·앱·서명 설정을 마친 뒤 `v*` 태그를 올리면 검증과 배포가 실행돼요.

## 전체 흐름

```text
앱·서비스 계정·업로드 키 준비
  → GitHub Secrets 등록
  → 필요한 첫 AAB 업로드와 콘솔 설정 확인
  → v* 태그 push
  → verify (format · config audit · docs contract · analyze · test)
  → prod AAB 빌드 및 Internal 업로드
  → 조건부 Sentry 심볼 업로드
  → 임시 자격 증명 정리
```

## 최초 설정 (1회)

<a id="3-play-console-설정"></a>

### 1. Play Console 앱과 서비스 계정

Play Console에서 앱을 만들고 콘텐츠 등급, 광고 여부, 데이터 안전과 개인정보처리방침 등 해당 앱에 요구되는 정보를 작성해요. 실제 업로드 AAB의 패키지명이 `android/app/build.gradle.kts`의 prod `applicationId`와 일치해야 해요.

자동 업로드에 사용할 Google Cloud 서비스 계정을 만들고 Android Publisher API 사용 설정과 Play Console의 대상 앱 권한을 확인해요. 앱의 테스트 트랙에 릴리스를 올릴 수 있는 권한을 부여하고 JSON 키를 안전하게 보관해요. 콘솔 메뉴 이름·요금·심사 기간·테스터 제한은 바뀔 수 있으므로 현재 콘솔 안내를 확인해요.

<a id="1-업로드-키스토어-생성"></a>

### 2. 업로드 키스토어 생성

```bash
./scripts/signing/generate-upload-keystore.sh <app-slug>
```

스크립트는 `android/app/upload-keystore.jks`, `android/key.properties`와 `~/Documents/keystores-pending/<app-slug>/`의 백업 사본·비밀번호 파일을 만들어요. 이 파일들은 커밋하지 않아요. 이미 키가 있는 앱은 새 키로 덮어쓰지 말고 등록된 업로드 인증서와 일치하는지 확인해요. 장기 백업 절차는 [Secrets Management](./secrets-management.md)를 따라요.

<a id="2-키스토어-play-console-자격-증명-github-secrets-등록"></a>
<a id="2-키스토어--play-console-자격-증명-github-secrets-등록"></a>

### 3. GitHub Secrets 등록

```bash
./scripts/signing/upload-secrets-to-github.sh <app-slug>
```

이 스크립트는 pending 디렉터리에서 읽은 Android 서명 값 네 개만 자동 등록해요. 대상 GitHub 계정과 레포를 확인한 뒤 실행하세요.

| 설정 | 등록 방식과 용도 |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | 자동: 업로드 키스토어 |
| `ANDROID_KEYSTORE_PASSWORD` | 자동: 저장소 비밀번호 |
| `ANDROID_KEY_PASSWORD` | 자동: 키 비밀번호 |
| `ANDROID_KEY_ALIAS` | 자동: 키 별칭 |
| `PLAY_STORE_JSON_KEY` | 수동: 대상 앱 권한이 있는 서비스 계정 JSON |
| `GOOGLE_SERVICES_JSON_PROD` | 수동: prod Firebase 설정 파일의 base64 값 |
| `SENTRY_DSN`, `POSTHOG_KEY`, `POSTHOG_HOST` | 선택: 앱 관측성 설정 |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | 선택: Sentry 심볼 업로드에 필요한 세 값 |

현재 릴리스 워크플로는 Android 서명 값, Play JSON과 prod Firebase 설정을 필수로 확인해요. 사용하지 않는 SDK를 제거한 파생 앱은 워크플로의 필수 조건도 함께 검토해야 해요.

```bash
base64 -i android/app/src/prod/google-services.json | gh secret set GOOGLE_SERVICES_JSON_PROD
```

### 4. 첫 AAB와 내부 테스트

첫 API 업로드에 필요한 앱 등록 상태를 확인하고, 필요한 경우 prod AAB를 콘솔에 직접 업로드해요. 처음부터 자동 배포만 반복하기보다 서명·패키지명·콘솔 요구사항을 이 단계에서 확인하세요.

```bash
flutter build appbundle --release --flavor prod \
  --obfuscate --split-debug-info=build/symbols \
  --dart-define-from-file=.env.prod
```

이 명령은 필요한 값을 채운 `.env.prod`를 명시적으로 읽어요. `APP_ENV=prod`와 실제 `BASE_URL`을 넣고, 지원 이메일·정책 URL은 `main.dart`의 앱 설정도 바꿔요. 빌드 성공 후에는 실제 실행도 확인해요. `AppConfig`의 release 검증을 통과하도록 서버 주소·환경·지원 이메일·정책 URL을 설정해야 해요. 기본 예제 값을 남겨둔 빌드는 설치 후 부팅에서 실패할 수 있어요.

## 배포 트리거

`pubspec.yaml`의 `version: 1.2.3+45`에서 `1.2.3`은 표시 버전, `45`는 Android `versionCode`예요. 이미 사용한 build number를 다시 쓰지 않아요. 의도한 변경만 커밋하고 태그가 그 커밋을 가리키는지 확인한 뒤 해당 태그를 push해요.

```bash
git tag v1.2.3
git push origin v1.2.3
```

## 워크플로우 상세

정본은 [release-android.yml](https://github.com/storkspear/template-flutter/blob/main/.github/workflows/release-android.yml)이에요. 태그 push는 일반 `ci.yml` 검증을 대신하지 않으므로 릴리스 워크플로의 `verify` job이 먼저 검사를 실행해요. 배포 job은 검증 성공 뒤에만 시작해요.

배포 job은 임시 파일로 서명 키·Play 자격 증명·prod Firebase 설정을 복원하고 fastlane `beta`를 호출해요. Sentry 업로드는 관련 설정이 있을 때 실행하며, 임시 자격 증명은 성공 여부와 관계없이 정리하는 단계가 있어요. 문서의 축약 YAML을 복사하기보다 현재 워크플로를 기준으로 수정하세요.

## Fastlane 구성

| lane | 현재 역할 |
|---|---|
| `build_release` | prod AAB 빌드, Dart 난독화와 심볼 생성, 관측성 값 전달 |
| `beta` | `build_release` 호출 뒤 Internal 업로드 |
| `deploy` | Internal의 빌드를 Production으로 승격하는 수동 lane |
| `upload_sentry_mapping` | ProGuard 매핑과 Dart split-debug-info 업로드 |

현재 `build_release`가 자동 전달하는 환경 값은 Sentry·PostHog 관련 값이에요. `BASE_URL`, `APP_ENV`, `SSL_PINS`를 GitHub Secret에 등록하는 것만으로 앱에 전달되지는 않아요. 파생 앱의 설정 방식에 맞춰 실제 빌드 명령과 값을 대조하세요.

<a id="internal--closed--open--production"></a>

## Internal → Closed → Open → Production

GitHub Actions의 자동 업로드 대상은 Internal이에요. 내부 테스터를 등록해 실제 설치·로그인·주요 기능을 확인한 뒤 다음 트랙으로 승격해요. 각 트랙의 공개 범위와 요구사항은 현재 Play Console에서 확인해요. Production 승격은 콘솔이나 수동 `deploy` lane으로 별도 실행해요.

<a id="upload-key-not-matching"></a>

<a id="version-code-already-used"></a>

<a id="package-name-conflict"></a>

## 트러블슈팅

| 증상 | 확인할 내용 |
|---|---|
| App not found / Package name conflict | 업로드 대상 앱과 prod applicationId, 서비스 계정의 앱 접근 권한 |
| Upload key not matching | Play Console의 업로드 인증서와 실제 서명 키 지문 |
| Version code already used | `pubspec.yaml`의 build number와 업로드 이력 |
| fastlane 권한 오류 | API 활성화, 서비스 계정과 대상 앱의 릴리스 권한 |
| prod Google 로그인 실패 | prod Firebase 파일, 패키지명, 서명 인증서 등록 |

키를 잃었으면 Play App Signing의 업로드 키 재설정 절차를 확인해요. 처리 기간을 문서의 고정 숫자로 가정하지 않아요.

## 파생 레포 체크리스트

- [ ] 앱 식별자, 실제 release 설정과 prod Firebase 설정을 확인했어요.
- [ ] Play 앱과 서비스 계정을 만들고 대상 앱 권한을 확인했어요.
- [ ] 업로드 키를 보관하고 필요한 Secrets를 등록했어요.
- [ ] 최초 업로드와 콘솔 요구사항을 확인했어요.
- [ ] 원하는 커밋의 태그에서 verify와 Internal 업로드가 성공했어요.
- [ ] 내부 테스터가 설치해 주요 기능을 확인했어요.
- [ ] 난독화 심볼을 보관하고 필요한 경우 Sentry에서 확인했어요.

## 관련 문서

- [iOS 배포](./ios-deployment.md)
- [보안 설정과 출시 점검](./security.md)
- [CI](./ci-cd.md)
- [Secrets Management](./secrets-management.md)
