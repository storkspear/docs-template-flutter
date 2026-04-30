# 보안 정책 요약 (출시 전 체크리스트)

> **목표**: 출시 전 마지막으로 점검해야 할 보안 항목과, 본 템플릿이 기본 적용한 5중 방어선의 운영 측 작업을 정리.

**관련 ADR**: [`ADR-020 · Security Hardening`](../philosophy/adr-020-security-hardening.md) — 설계 의사결정 전체
**관련 인프라 문서**: [`docs/infra/security.md`](../infra/security.md) — 방어선의 기술적 상세

---

## 0. 5중 방어선 한눈에

| 방어선 | 기본 활성 | 차단 대상 | 운영 측 작업 |
|---|---|---|---|
| Android R8 난독화 | ✅ release | 리버스 엔지니어링 | proguard-rules.pro 유지 |
| Dart 심볼 난독화 + Sentry 심볼 업로드 | ✅ release | 문자열 추출 | GHA workflow 가 자동 |
| Cleartext HTTP 차단 | ✅ release | 평문 통신 실수 | 모든 API URL `https://` 확인 |
| Keychain / EncryptedSharedPreferences | ✅ | 탈옥/루팅 시 토큰 탈취 | 추가 설정 없음 |
| SSL pinning | ⬜ opt-in | MITM | Pin 발급 + dart-define 주입 (선택) |

---

## 1. 출시 전 보안 점검 (필수)

### 1-1. 시크릿 누출 검사

```bash
# 커밋 전 마지막 sweep
git diff --cached | grep -iE "api[_-]?key|secret|password|dsn|token"

# 기존 커밋 history 까지 검사 (도구)
brew install gitleaks
gitleaks detect --source .
```

발견 시: 즉시 해당 키 폐기 + 새 키 발급 + 히스토리에서 제거.

### 1-2. `.env` / keystore 파일 gitignore 확인

```bash
git check-ignore -v .env android/key.properties android/app/upload-keystore.jks
```

세 파일 모두 ignored 상태여야 함.

### 1-3. GHA Secrets 명단 검사

```bash
gh secret list
```

존재해야 하는 항목 (Phase 2a 기준):
- `SENTRY_DSN`, `POSTHOG_KEY`
- `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_PASSWORD`, `ANDROID_KEY_ALIAS`
- `PLAY_STORE_JSON_KEY`
- (옵션) `SSL_PINS`

### 1-4. 빌드 산출물 검사

```bash
flutter build apk --release
# 산출 APK 를 unzip 해서 평문 키가 박혀있지 않은지 확인
unzip -p build/app/outputs/flutter-apk/app-release.apk classes.dex | strings | grep -iE "https://api|dsn|key"
```

R8 난독화 후엔 의미 있는 식별자가 거의 안 보여야 정상.

---

## 2. SSL Pinning (옵션)

[`lib/kits/backend_api_kit/ssl_pinning.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/backend_api_kit/ssl_pinning.dart) 가 opt-in 으로 구현되어 있어요.

**활성화**:

```bash
# 백엔드 인증서의 SHA-256 핀 추출
echo | openssl s_client -servername api.example.com -connect api.example.com:443 \
  | openssl x509 -pubkey -noout \
  | openssl pkey -pubin -outform DER \
  | openssl dgst -sha256 -binary \
  | openssl enc -base64

# 빌드 시 주입 (콤마 구분, 백업 핀 포함 권장)
flutter build apk --release \
  --dart-define=SSL_PINS=AAA...=,BBB...=
```

**주의**:
- 인증서 갱신 시 핀도 함께 갱신해야 함. 갱신 잊으면 모든 사용자 앱이 통신 불가 → 핫픽스 배포 필수.
- 백업 핀 (intermediate / root) 1개 이상 함께 등록 권장.
- 첫 출시 후 일정 기간 (1주일 ~ 1개월) 모니터링 후 단계적 활성화 권장.

---

## 3. 권한 최소화

`AndroidManifest.xml` / `Info.plist` 의 권한 선언은 **실제 사용하는 것만**:

- 알림: `POST_NOTIFICATIONS` (Android 13+)
- 푸시: FCM 활성 시 `INTERNET`, `WAKE_LOCK` (자동 추가됨)
- 카메라 / 위치 / 연락처 등: 해당 기능 활성 시에만

권한 추가 = Play Console 심사 시 "왜 필요한지" 근거 자동 노출 의무 발생. 불필요한 권한은 심사 거부 위험.

---

## 4. 개인정보처리방침 (Privacy Policy)

`AppConfig.privacyUrl` 에 등록한 URL 이 Play Console / App Store 의 개인정보처리방침 링크와 일치해야 함.

명시 항목 (한국 기준):
- 수집 항목 (이메일 / FCM 토큰 / 사용자 행동 데이터 등)
- 수집 목적 / 보관 기간
- 위탁사 (PostHog Inc. — 미국, Sentry — 미국, Resend — 미국 등)
- 사용자 권리 (열람 / 수정 / 삭제 / 처리 정지)
- 책임자 연락처 (`AppConfig.supportEmail`)

---

## 5. 토큰 탈취 대비

본 템플릿이 기본 제공:

- **Access token**: 메모리 + EncryptedSharedPreferences (Android) / Keychain (iOS) 에만 저장 — `lib/core/storage/token_storage.dart`
- **Refresh token rotation**: 매 refresh 시 server-side 에서 회전 (Spring 측 구현)
- **Replay 감지**: 같은 refresh token 재사용 시 모든 세션 무효화 + signOut (`AuthService.refreshToken()` + Spring `AuthError.INVALID_TOKEN (ATH_003)`)

추가 권장 (앱 별 보안 요구 따라):
- Biometric lock (앱 진입 시 생체 인증) — `local_auth` 패키지
- App pinning / certificate pinning (위 §2)

---

## 6. 파생 레포 체크리스트

- [ ] 시크릿 누출 sweep (gitleaks 또는 git diff grep)
- [ ] `.env`, keystore, `google-services.json` 모두 gitignored 확인
- [ ] GHA Secrets 명단 검사 (`gh secret list`)
- [ ] R8 난독화 빌드 검증 (`isMinifyEnabled = true`)
- [ ] 모든 API URL `https://` 사용 확인
- [ ] `AppConfig.privacyUrl` 등록된 페이지 실제 운영 중 확인
- [ ] (선택) SSL pinning 활성화 + 핀 갱신 운영 절차 문서화

---

## 7. 관련 문서

- [`docs/infra/security.md`](../infra/security.md) — 5중 방어선 기술 상세
- [`docs/philosophy/adr-020-security-hardening.md`](../philosophy/adr-020-security-hardening.md) — 의사결정 근거
- [`docs/infra/secrets-management.md`](../infra/secrets-management.md) — GHA Secrets 운영
