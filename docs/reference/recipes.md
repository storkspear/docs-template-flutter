# Recipes

네 가지 recipe는 앱 유형별 Kit 조합의 시작점이에요. YAML을 복사한 뒤 실제 Dart 조립, 앱 식별자와 플랫폼 설정을 맞춰야 해요. 아래 표로 가까운 구성을 고르고 필요한 기능만 조정하세요.

---

## 선택 가이드

| 조건 | Recipe |
|------|--------|
| 서버 없이 완전 로컬 | `local-only-tracker` |
| 서버 없고 알림 · 타이머 중심 | `local-notifier-app` |
| 서버 있고 단순 인증 (이메일/Apple/Google) | `backend-auth-app` |
| 한국 시장 + 카카오/네이버 포함 4-provider 인증 | `social-auth-app` |
| 위 어느 것도 아님 | 가까운 것 복사 + 커스터마이징 |

---

## 1. local-only-tracker

완전 로컬 앱이에요 (습관 · 가계부 · 학습 기록 등).

```yaml
# recipes/local-only-tracker.yaml
app:
  name: My Tracker
  slug: my-tracker
  environment: prod
  palette_class: DefaultPalette

kits:
  local_db_kit:
    database_class: AppDatabase
    database_file: lib/database/app_database.dart
  onboarding_kit: {}
  nav_shell_kit: {}
  charts_kit: {}
```

### 활성 Kit (4개)

- `local_db_kit` — Drift SQLite
- `onboarding_kit` — 첫 실행 시 위자드
- `nav_shell_kit` — 하단 탭
- `charts_kit` — 통계 시각화

### 비활성 (의도적)

- `backend_api_kit` · `auth_kit` — 서버가 없어요
- `notifications_kit` · `permissions_kit` — 알림이 없어요
- `update_kit` — 로컬 전용이라 강제 업데이트 체인이 필요 없어요
- `ads_kit` — 광고 없는 앱이 기본이에요

### 대표 사례

- 습관 트래커 · 독서 기록 · 가계부 (로컬)

---

## 2. local-notifier-app

로컬 알림 · 타이머 중심 앱이에요. 광고를 포함해요.

```yaml
# recipes/local-notifier-app.yaml
app:
  name: Notifier App
  slug: notifier-app
  environment: prod
  palette_class: DefaultPalette

kits:
  local_db_kit:
    database_class: AppDatabase
    database_file: lib/database/app_database.dart
  notifications_kit: {}
  background_kit: {}
  charts_kit: {}
  update_kit: {}
  ads_kit: {}
  permissions_kit: {}
  device_info_kit: {}
  nav_shell_kit: {}
```

### 활성 Kit (9개)

- `local_db_kit` · `notifications_kit` · `background_kit` · `charts_kit`
- `update_kit` · `ads_kit` · `permissions_kit` · `device_info_kit` · `nav_shell_kit`

### 특이 사항

- **update_kit 조립 교체 필수**: 이 recipe 는 `backend_api_kit` 이 없어서 템플릿 기본 `BackendAppUpdateService` 를 그대로 두면 컴파일이 깨져요. `lib/main.dart` 에서 `UpdateKit(service: NoUpdateAppUpdateService())` 로 바꾸고 `ApiClient.onUpgradeRequired` 글루 블록 + import 2개(`backend_api_kit.dart`, `upgrade_required.dart`)를 지워요 ([`update-kit.md`](../features/update-kit.md) 참고).
- **ads_kit 활성**: 첫 실행 시 ATT (iOS) · UMP (GDPR) 다이얼로그가 자동 노출돼요
- **ads_kit 활성 시 플랫폼 키**: `Info.plist` 에 `NSUserTrackingUsageDescription` · `SKAdNetworkItems` 를 추가하고, `AndroidManifest.xml` 에서 광고 권한을 막아 둔 `tools:node="remove"` 줄을 지워요 ([`ads_kit/README.md`](../../lib/kits/ads_kit/README.md))
- **출시 전**: AdMob 실제 ID 를 입력해요 (Android meta-data · iOS `GADApplicationIdentifier` 기본값은 Google 테스트 ID 예요)

### 대표 사례

- 알람 · 명상 타이머 · 운동 알림 · 리마인더 앱

---

## 3. backend-auth-app

백엔드 연동 + JWT 인증 앱이에요.

```yaml
# recipes/backend-auth-app.yaml
app:
  name: Authed App
  slug: authed-app
  environment: prod
  palette_class: DefaultPalette

kits:
  backend_api_kit: {}
  auth_kit:
    providers:
      - email
      - google
      - apple
  notifications_kit: {}
  device_info_kit: {}
  update_kit: {}
```

### 활성 Kit (5개)

- `backend_api_kit` · `auth_kit` (짝) — 서버 연동 · JWT
- `notifications_kit` · `device_info_kit` — FCM 푸시 + device 등록
- `update_kit` — 강제 업데이트

### 전제

- [`template-spring`](https://github.com/storkspear/template-spring) 쌍 운영
- 백엔드에 해당 앱 slug 등록 + 스키마 생성

### 대표 사례

- SNS 마이크로 · 협업 도구 · 대시보드 · 메신저

---

## 4. social-auth-app

한국 시장 타겟 — 카카오 · 네이버 포함 4-provider 소셜 로그인 앱이에요.

```yaml
# recipes/social-auth-app.yaml
app:
  name: Social Login App
  slug: social-app
  environment: prod
  palette_class: DefaultPalette

kits:
  backend_api_kit: {}
  auth_kit:
    providers:
      - email
      - google
      - apple
      - kakao
      - naver
  notifications_kit: {}
  device_info_kit: {}
  update_kit: {}
  observability_kit: {}
```

### 활성 Kit (6개)

- `backend_api_kit` · `auth_kit` (4-provider) — 한국 시장 표준
- `notifications_kit` · `device_info_kit` — FCM + device 등록
- `update_kit` · `observability_kit` — 강제 업데이트 + Sentry/PostHog

### 전제

- [`template-spring`](https://github.com/storkspear/template-spring) 쌍 운영 + 4-provider OAuth 등록
- **Kakao**: 네이티브 앱 키 발급 + `KakaoSdk.init` 호출 (`lib/main.dart` 자리표시 참조)
- **Naver**: Client ID·Secret·앱 이름·URL Scheme 을 발급받아 Android metadata 와 iOS `Nid*` 설정에 연결해요. 현재 SDK 에는 Dart `initSdk` 가 없어요.
- 소셜 로그인 native 설정은 [Kakao/Naver 통합 가이드](../integrations/kakao-naver-auth.md) 에서 확인해요.
- Kakao 키는 Dart 빌드 상수로, Naver 값은 native 설정으로 주입해요. `.env` 나 CI Secrets 에 보관한 값을 빌드로 전달하는 단계도 필요해요.

### 대표 사례

- 한국 시장 SNS · 커머스 · 콘텐츠 앱 (카카오/네이버 로그인 사용자 비중 큼)

---

## Recipe 사용 워크플로우

### 1. Recipe 복사

```bash
cp recipes/backend-auth-app.yaml app_kits.yaml
```

### 2. 편집 (선택)

```yaml
# app_kits.yaml
app:
  name: My Cool App          # ← 변경
  slug: my-cool-app
  # ...

kits:
  backend_api_kit: {}
  auth_kit: {}
  notifications_kit: {}
  device_info_kit: {}
  update_kit: {}
  observability_kit: {}      # ← 추가
```

### 3. main.dart 동기화

```dart
await AppKits.install([
  BackendApiKit(),
  AuthKit(),
  NotificationsKit(service: LocalScheduledAlertService()),
  DeviceInfoKit(),
  UpdateKit(service: BackendAppUpdateService(/* GET /app-version — lib/main.dart 기본 조립 그대로 */)),  // 템플릿 기본 (backend_api_kit 필요)
  // backend 없는 recipe는 NoUpdateAppUpdateService — lib/kits/update_kit/README.md 참고
  ObservabilityKit(),        // ← 추가
]);
```

`backend_api_kit` 을 켜는 recipe 는 템플릿 기본 조립(`BackendAppUpdateService` + `ApiClient.onUpgradeRequired` 글루)을 건드리지 않아요.

### 4. 검증

```bash
dart run tool/configure_app.dart
```

Status: OK 를 확인해요.

<a id="5-앱-정체성-변경--로컬-셋업"></a>

### 5. 앱 정체성 변경 + 로컬 셋업

```bash
./factory install                                          # 1회
<repo> local init my-cool-app com.example.mycoolapp        # rename + .env + pub get
```

### 6. 실행

```bash
<repo> local start                                         # mock 자동 폴백
# 또는 (Firebase 자동화 후)
<repo> dev start
```

---

## 혼합 유형 처리

<a id="로컬--서버-백업-옵션-같은-혼합"></a>

### "로컬 + 서버 백업 옵션" 같은 혼합

4개 Recipe 중 어느 것과도 정확히 안 맞아요. 전략은 이래요:

1. **가장 가까운 것 선택** — 예: `local-only-tracker`
2. **Kit 추가** — `backend_api_kit` · `auth_kit` (옵션 기능)
3. **기능 플래그로 on/off** — ViewModel 에서 "서버 연동 활성 여부" 플래그

### 새 Recipe 추가?

4개로 제한하는 걸 권장해요 (drift 관리 부담). 필요 시 **파생 레포 에서만** 유지해요 — 템플릿에는 반영하지 않아요.

---

## 관련 문서

- [`ADR-021 · Multi-Recipe`](../philosophy/adr-021-multi-recipe.md)
- [`ADR-003 · FeatureKit`](../philosophy/adr-003-featurekit-registry.md)
- [`ADR-004 · YAML ↔ Dart 동기화`](../philosophy/adr-004-manual-sync-ci-audit.md)
- [`Features 인덱스`](../features/README.md) — Kit 15개 상세
- [`scripts.md`](./scripts.md) — `rename-app.sh`
