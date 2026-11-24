# PostHog 통합

> **목표**: PostHog API Key 발급 → 주입 → 화면 자동 추적 이벤트 1개 이상 수신 확인까지.

**관련 Kit**: [`observability_kit`](../features/observability-kit.md)

---

## 0. PostHog 가 하는 일

사용자 행동 분석 (이벤트 / 스크린뷰 / funnel / retention). 우리 템플릿은:

- 화면 전환 자동 추적 — `AnalyticsNavigatorObserver` 가 GoRouter `observers` 에 연결됨
- API Key 미주입 시 `DebugAnalyticsService` 로 폴백 — 콘솔만, 외부 전송 없음
- 호스트 기본값: `https://us.i.posthog.com` (US 리전). EU 사용 시 `POSTHOG_HOST` 별도 주입

---

## 1. PostHog 콘솔에서 키 발급

1. https://posthog.com 가입 (무료 — 월 1M 이벤트)
2. **New Project** → 이름 입력 (앱 슬러그 권장)
3. **Project Settings** → **Project API Key** 복사 — 형태: `phc_...`
4. 리전 확인 — US 면 기본값 그대로, EU 면 `POSTHOG_HOST=https://eu.i.posthog.com` 도 함께 주입

---

<a id="2-로컬--ci-주입"></a>

## 2. 로컬 / CI 주입

```bash
flutter run \
  --dart-define=POSTHOG_KEY=phc_xxxxx \
  --dart-define=POSTHOG_HOST=https://us.i.posthog.com  # 옵션, US 기본값
```

GHA Secrets 에 `POSTHOG_KEY` (옵션: `POSTHOG_HOST`) 추가 후 release workflow 에서 동일 dart-define.

---

## 3. 동작 확인

### 3-1. 화면 전환 자동 추적

PostHog가 활성화된 빌드에서 이름이 있는 라우트로 이동한 뒤 Live events를 확인해요. observer가 연결된 Navigator와 라우트 이름이 추적 범위에 포함돼야 해요. 이름 없는 라우트나 별도 셸의 탭 전환은 별도 확인이 필요해요. 이벤트 도착 시간을 고정된 1분으로 보장하지 않아요.

### 3-2. 커스텀 이벤트

```dart
ref.read(analyticsProvider).trackEvent(
  'button_pressed',
  properties: {'button_id': 'subscribe_premium'},
);
```

### 3-3. Dogfooding 패널

`lib/kits/observability_kit/dogfooding_panel.dart` 의 버튼 3개 (📊 분석 이벤트 보내기 · 🍞 Breadcrumb 추가 · 💥 테스트 크래시 발생) 로 PostHog 와 Sentry 를 한 번에 검증해요. PostHog 쪽은 "분석 이벤트 보내기" 가 `dogfood_button_click` 이벤트를 전송.

---

## 4. 트러블슈팅

| 증상 | 원인 | 해결 |
|---|---|---|
| 이벤트가 안 옴 | API Key 미주입 (Debug 폴백) | 콘솔에서 `[Analytics]` 로그면 키 안 들어간 것 (DebugAnalyticsService 폴백) |
| 프로젝트 리전과 전송 호스트가 다름 | `POSTHOG_HOST`가 프로젝트 설정과 다름 | 사용자 거주지가 아니라 PostHog 프로젝트의 수집 호스트를 확인해요. |
| 화면 전환 자동 추적 안 됨 | NavigatorObserver 미연결 | `lib/common/router/app_router.dart` 의 `observers:` 리스트 확인 |
| 사용자 식별 안 됨 | `identify(userId)` 호출 안 함 | 로그인 직후 `analyticsProvider` 의 `identify(...)` 호출 |

---

<a id="5-개인정보--gdpr"></a>

## 5. 개인정보 / GDPR

- 분석 이벤트에 보내는 속성과 SDK 설정을 실제로 확인해요. 특정 분석 SDK를 쓴다는 이유만으로 동의·플랫폼 정책 검토가 면제된다고 단정하지 않아요.
- 현재 `app.dart`는 인증 상태 변경에 맞춰 사용자 식별과 초기화를 연결해요. 파생 앱에서 인증 흐름을 바꾸면 이 연결도 확인해요.
- 실제 사용 중인 외부 서비스와 데이터 전송 범위를 개인정보처리방침에 반영해요.

---

## 6. 파생 레포 체크리스트

- [ ] PostHog 프로젝트 생성 + API Key 발급
- [ ] `.env` + GHA Secrets 에 `POSTHOG_KEY` 등록
- [ ] `POSTHOG_HOST`가 PostHog 프로젝트의 수집 호스트와 일치해요.
- [ ] 릴리스 빌드 1회 후 Live events 에 `$screen` 도착 확인
- [ ] 로그인 흐름에서 `identify()`, 로그아웃에서 `reset()` 호출 확인

---

## 7. Code References

- [`lib/kits/observability_kit/posthog_analytics_service.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/observability_kit/posthog_analytics_service.dart)
- [`lib/kits/observability_kit/analytics_navigator_observer.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/observability_kit/analytics_navigator_observer.dart)
- [`lib/kits/observability_kit/observability_env.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/observability_kit/observability_env.dart)
