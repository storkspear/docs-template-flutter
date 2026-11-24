# Security

앱의 난독화, 네트워크 설정, 토큰 저장과 선택적 인증서 핀 검증을 설명해요. 각 장치는 특정 위험을 줄이지만 다른 장치를 대신하거나 모든 공격을 막지는 않아요. 설계 배경은 [ADR-020](../philosophy/adr-020-security-hardening.md)에 있어요.

## 방어선 요약

| 장치 | 현재 적용 조건 | 보호 범위와 한계 |
|---|---|---|
| Android R8 | Gradle release 설정 | Java/Kotlin 코드 분석 비용을 높여요. keep 규칙에 따라 이름이 남을 수 있어요. |
| Dart 심볼 난독화 | `--obfuscate` 빌드 | 심볼 이름을 바꿔요. 문자열이나 앱에 넣은 비밀을 숨기지 않아요. |
| 플랫폼 네트워크 설정 | Android 설정과 iOS ATS | 플랫폼 통신 정책을 설정해요. 사용하는 네트워크 구현의 실제 동작을 기기에서 확인해요. |
| SecureStorage | 토큰 저장 시 | iOS Keychain과 Android KeyStore 기반 저장을 사용해요. 침해된 기기에서 안전을 보장하지 않아요. |
| SSL pinning | `SSL_PINS`를 빌드에 전달할 때 | 일반 TLS 검증을 통과한 leaf 인증서의 DER 해시를 추가 검사해요. 인증서 갱신 운영이 필요해요. |

<a id="설정-androidappbuildgradlekts"></a>

<a id="androidappproguard-rulespro"></a>

<a id="검증"></a>

## 1. Android R8 난독화

`android/app/build.gradle.kts`의 release는 `isMinifyEnabled`와 `isShrinkResources`를 켜요. `proguard-rules.pro`에는 Flutter와 플러그인별 보존 규칙이 있어요. 플러그인을 바꾸면 해당 SDK가 요구하는 규칙과 실제 release 동작을 확인해요. 모든 클래스를 무조건 보존하는 규칙을 추가하면 축소 효과가 줄 수 있어요.

`build/app/outputs/mapping/prodRelease/mapping.txt`를 해당 빌드와 함께 보관해요. 짧은 클래스 이름 몇 개가 보인다는 사실만으로 보안 검증을 끝내지 않아요.

<a id="빌드-플래그"></a>

<a id="sentry-업로드-필수"></a>

<a id="2-dart-심볼-난독화--심볼-업로드"></a>

## 2. Dart 심볼 난독화 + 심볼 업로드

```bash
flutter build appbundle --release --flavor prod \
  --obfuscate --split-debug-info=build/symbols \
  --dart-define-from-file=.env.prod
```

`.env.prod`에는 실제 `BASE_URL`과 `APP_ENV=prod`를 준비하고, 앱의 지원 이메일·정책 URL도 설정해요.

난독화는 모든 release 빌드에 자동으로 붙는 속성이 아니라 빌드 명령의 옵션이에요. 현재 Android fastlane `build_release`는 이 옵션을 사용해요. 심볼 파일은 해당 배포 버전과 연결해 보관해야 나중에 스택을 복원할 수 있어요.

GitHub Actions의 Sentry 업로드는 `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` 설정에 따라 실행돼요. `upload_sentry_mapping` lane이 ProGuard 매핑과 Dart split-debug-info를 업로드해요. Sentry를 사용하지 않아도 심볼 보관은 필요해요.

<a id="android"></a>

<a id="ios"></a>

<a id="효과"></a>

## 3. Cleartext HTTP 차단

Android의 `network_security_config.xml`과 `AndroidManifest.xml`에 평문 통신 제한이 있어요. 개발용 사용자 인증서 설정과 주석 처리된 도메인 예외도 실제 파일에서 확인하세요. iOS는 ATS 설정을 확인해요.

설정 파일의 존재만으로 모든 Dart IO·플러그인 요청이 같은 정책을 따른다고 단정하지 않아요. 사용하는 API URL을 HTTPS로 설정하고 release 기기에서 해당 통신 경로를 확인해요. 로컬 개발 예외를 출시 설정에 그대로 남기지 않아요.

<a id="설정-libcorestoragesecurestoragedart"></a>
<a id="설정-libcorestoragesecure_storagedart"></a>

<a id="firstunlockthisdevice-이유"></a>
<a id="first_unlock_this_device-이유"></a>

<a id="4-keychain--encryptedsharedpreferences"></a>

## 4. Keychain / EncryptedSharedPreferences

이 절의 예전 이름은 링크 호환을 위해 남겼어요. 현재 구현은 Android에 `encryptedSharedPreferences` 옵션을 전달하지 않아요.

```dart
static const _storage = FlutterSecureStorage(
  iOptions: IOSOptions(
    accessibility: KeychainAccessibility.first_unlock_this_device,
  ),
);
```

Android는 설치된 `flutter_secure_storage`의 기본 KeyStore 기반 암호화를 사용해요. iOS의 `first_unlock_this_device`는 재부팅 후 처음 잠금을 해제한 뒤 접근할 수 있고 다른 기기로 이전되지 않는 접근 등급이에요. 토큰은 이 저장소에, 일반 설정은 `PrefsStorage`에 두어요. 저장 실패와 복구의 한계는 [ADR-013](../philosophy/adr-013-token-atomic-storage.md)을 확인하세요.

<a id="활성화"></a>

<a id="핀-추출-서버-인증서에서"></a>

<a id="최소-2개-핀-유지"></a>

## 5. SSL Pinning (opt-in)

핀은 leaf 인증서 **전체 DER의 SHA-256**이에요. 공개키만 추출하는 SPKI 방식과 다르며, 같은 키로 인증서를 갱신해도 DER 핀이 바뀔 수 있어요.

```bash
echo | openssl s_client -servername api.example.com -connect api.example.com:443 2>/dev/null \
  | openssl x509 -outform der \
  | openssl dgst -sha256 -binary \
  | openssl enc -base64
```

확인한 출력에 `sha256/`를 붙이고 현재 인증서와 다음 인증서 핀을 함께 빌드에 전달해요. intermediate/root 인증서나 다음 인증서의 공개키 핀은 현재 검사 방식과 일치하지 않아요.

```bash
flutter build appbundle --release --flavor prod \
  --obfuscate --split-debug-info=build/symbols \
  --dart-define-from-file=.env.prod \
  --dart-define=SSL_PINS=sha256/AAA=,sha256/BBB=
```

핀을 Secret에 등록해 두는 것만으로 앱에 반영되지는 않아요. 실제 빌드 인자를 확인하세요. 인증서 교체 전에 새 핀이 포함된 앱의 배포와 사용 비율을 확인하고, 갱신 실패 시 대응 절차를 마련해요.

## 추가 보안 규칙

<a id="keystore-인증서-관리"></a>
<a id="keystore--인증서-관리"></a>

### 출시 전 시크릿 점검

`.env`, `android/key.properties`, 키스토어와 서비스 계정 JSON이 추적되지 않는지 확인해요. 이미 추적된 파일은 `.gitignore`를 추가하는 것만으로 추적이 끝나지 않아요. 문자열 검색은 단서만 제공하므로 전용 검사 도구와 코드 리뷰를 함께 사용해요. 비밀이 노출됐다면 먼저 폐기·교체하고 영향을 확인한 뒤 이력 정리를 검토해요.

```bash
git check-ignore -v .env android/key.properties android/app/upload-keystore.jks
gh secret list
```

필수 Secrets와 선택 항목은 [Android 배포](./android-deployment.md)의 표에서 확인해요. 앱에 넣는 DSN·분석 프로젝트 키와 배포 권한을 가진 서비스 자격 증명을 구분해요. 키스토어 백업 암호는 별도의 암호 관리 도구에 보관해요.

### 빌드 산출물 검토

prod release 산출물의 패키지명·권한·서명과 실제 API 설정을 확인해요. `classes.dex` 검색만으로 Dart 라이브러리와 자산의 비밀 노출까지 검사했다고 볼 수 없어요. API 엔드포인트가 보이지 않아야 한다는 조건도 보안 기준으로 삼지 않아요.

<a id="앱-디버그-기능-release-에-유출-방지"></a>

### PII 수집 최소화

Sentry의 `sendDefaultPii = false`는 기본 개인정보 수집 옵션이에요. 직접 넣은 사용자 이메일, 이벤트 속성과 오류 메시지까지 자동 정제하지는 않아요. PostHog에도 검색어 원문 대신 필요한 최소 속성만 전달하고, 실제 송신 이벤트를 확인해요. 디버그 기능 노출은 release 모드와 실제 빌드 설정에서 검증해요.

### 권한과 개인정보처리방침

`AndroidManifest.xml`과 `Info.plist`에는 사용하는 기능에 필요한 권한·설명을 설정해요. 전이 의존성으로 합쳐진 manifest도 확인하세요. 앱의 정책 URL과 스토어에 제출한 URL이 일치하고 접근 가능한지 확인해요.

수집 항목·목적·보관 기간·외부 서비스·사용자 권리 처리·연락처는 실제 앱 동작에 맞게 작성해요. 이 목록을 특정 국가 법률의 완결된 준수 항목으로 해석하지 않아요. 관측성·푸시 등 서비스를 추가하면 문구와 실제 전송 범위를 함께 검토해요.

### 토큰 탈취 대응 범위

클라이언트는 토큰을 보안 저장소에 보관하고 서버의 갱신 거절이 확인되면 세션을 정리해요. refresh 회전·재사용 감지와 폐기 범위는 Spring 서버 구현을 기준으로 확인해요. 재사용 감지가 모든 앱·기기의 모든 세션을 항상 지운다고 단정하지 않아요. 생체 인증 잠금은 기본 제공 기능이 아니라 앱 요구에 따라 별도로 설계할 기능이에요.

## 파생 레포 체크리스트

- [ ] 사용 중인 release 빌드에서 R8·Dart 난독화 조건과 주요 기능을 확인했어요.
- [ ] 해당 버전의 심볼을 보관하고 필요한 업로드를 확인했어요.
- [ ] 실제 통신 경로와 HTTPS 설정을 확인했어요.
- [ ] 시크릿이 추적되거나 앱에 불필요하게 포함되지 않았는지 확인했어요.
- [ ] 권한과 수집 데이터가 실제 기능·정책 문서와 일치해요.
- [ ] pinning을 사용한다면 인증서 갱신·배포·장애 대응 절차가 있어요.

## 관련 문서

- [토큰 저장과 복구](../philosophy/adr-013-token-atomic-storage.md)
- [보안 설계의 선택과 한계](../philosophy/adr-020-security-hardening.md)
- [Secrets Management](./secrets-management.md)
