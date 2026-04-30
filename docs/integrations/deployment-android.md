# Android 배포 (Play Console 통합)

> **목표**: Play Console 앱 등록 → Service Account JSON 발급 → GHA Secrets 등록 → `git tag` 만으로 Internal track 자동 배포까지.

**관련 인프라 문서**: [`docs/infra/android-deployment.md`](../infra/android-deployment.md) — 배포 파이프라인의 기술적 상세 (이 문서는 **외부 서비스 (Play Console) 측 절차** 에 초점)

---

## 0. 배포 파이프라인 한눈에

```
git tag v1.0.0 → GitHub Actions → fastlane build (AAB) → Play Console Internal
```

상세 흐름은 [`docs/infra/android-deployment.md`](../infra/android-deployment.md) 의 "전체 흐름" 다이어그램 참고. 본 문서는 **Play Console 콘솔 작업** 에 집중.

---

## 1. Play Console 에 앱 등록

1. https://play.google.com/console 가입 (개발자 등록 — $25 일회성)
2. **새 앱 만들기**:
   - 앱 이름 / 기본 언어 / 무료 / 유료 선택
   - 패키지명 입력 — `android/app/build.gradle.kts` 의 `applicationId` 와 정확히 일치해야 함
3. 앱 콘텐츠 설문 (콘텐츠 등급 / 광고 유무 / 데이터 안전 등) — 첫 출시 전 모두 필수
4. **내부 테스트 트랙** 생성 — 첫 자동 배포 대상 트랙

---

## 2. Service Account 발급

자동 배포는 Service Account 의 JSON Key 로 인증해요.

1. **Play Console → 설정 → API 액세스**
2. **새 서비스 계정 만들기** → Google Cloud Console 로 이동
3. Service Account 생성 후 **키 만들기** → JSON 형식 → 다운로드
4. Play Console 로 돌아와서 해당 SA 에 **앱 권한 부여**:
   - **앱 액세스**: 해당 앱
   - **계정 권한**: Release manager (release apps to testing tracks + manage test access)

> **보안**: JSON 파일은 절대 커밋하지 마세요. GHA Secrets 에만 저장.

---

## 3. GHA Secrets 등록

```bash
./scripts/upload-secrets-to-github.sh
```

스크립트가 묻는 항목:
- `PLAY_STORE_JSON_KEY` — 위에서 발급받은 Service Account JSON 파일 경로
- `ANDROID_KEYSTORE_BASE64` 외 keystore 관련 (이미 [`docs/infra/android-deployment.md`](../infra/android-deployment.md) §최초 설정 참고)

---

## 4. 첫 배포

### 4-1. 수동 1회 (Play Console UI 검증)

먼저 콘솔에서 AAB 한 번 수동 업로드해서 앱이 등록되는지 확인 권장:

```bash
flutter build appbundle --release
# build/app/outputs/bundle/release/app-release.aab 를 Play Console Internal 트랙에 수동 업로드
```

### 4-2. GHA 자동 배포

```bash
git tag v1.0.0
git push --tags
```

`.github/workflows/release-android.yml` 이 트리거되어:
1. Keystore 디코딩
2. AAB 빌드 (Sentry / PostHog DSN 자동 주입)
3. fastlane 으로 Play Console Internal 업로드
4. Sentry 심볼 업로드 (난독화 매핑 보존)

---

## 5. 트랙 단계

| 트랙 | 배포 대상 | 우리 자동화 |
|---|---|---|
| Internal | 등록된 내부 테스터 (~100명) | ✅ `git tag` 자동 |
| Closed | 그룹 단위 베타 | 수동 promote |
| Open | 누구나 (베타) | 수동 promote |
| Production | 모든 사용자 | 수동 promote |

자동 배포는 **Internal 까지만**. Closed → Production 승격은 항상 사람이 검토 후 콘솔에서 promote (의도적 안전망).

---

## 6. 트러블슈팅

| 증상 | 원인 | 해결 |
|---|---|---|
| GHA 가 "App not found" | 패키지명 불일치 / 콘솔에 앱 미등록 | `applicationId` 와 콘솔 패키지명 1:1 확인 |
| "The Android App Bundle was signed incorrectly" | 업로드 키스토어 변경 후 fingerprint 불일치 | 첫 업로드 시 사용한 키스토어와 동일해야 함. Play Console 에서 keystore reset 신청 가능 (1주일 소요) |
| fastlane 권한 오류 | Service Account 권한 미부여 | Play Console → 사용자 → 해당 SA → 앱 액세스 / Release manager 권한 확인 |
| 버전 충돌 ("Version code already exists") | `versionCode` 증가 안 함 | `pubspec.yaml` 의 `version: x.y.z+N` 에서 `+N` 증가 |

---

## 7. 파생 레포 체크리스트

- [ ] 개발자 등록 ($25) + 앱 등록 (패키지명 일치)
- [ ] 콘텐츠 설문 (등급 / 광고 / 데이터 안전 / 개인정보처리방침 URL) 모두 작성
- [ ] Service Account 발급 + Release manager 권한 부여
- [ ] `scripts/upload-secrets-to-github.sh` 로 Secrets 등록
- [ ] 수동 1회 업로드로 콘솔 등록 검증
- [ ] `git tag v1.0.0 && git push --tags` 로 자동 배포 검증
- [ ] Internal 테스터 1명 이상 등록 후 설치 가능 확인

---

## 8. 관련 문서

- [`docs/infra/android-deployment.md`](../infra/android-deployment.md) — 파이프라인 기술 상세 (Keystore / fastlane / GHA workflow)
- [`docs/infra/secrets-management.md`](../infra/secrets-management.md) — GHA Secrets 정책
- [`docs/integrations/security.md`](./security.md) — 출시 전 보안 점검 항목
