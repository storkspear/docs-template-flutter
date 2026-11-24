<a id="observability_kit"></a>

# observability_kit

Sentry 오류 보고와 PostHog 이벤트 분석을 묶어요. 각 서비스의 키가 없으면 해당 Debug 구현체를 사용해요. 관측성 키가 없어도 호출할 수 있다는 뜻이며, 앱의 다른 부팅·native 설정 조건까지 없어지는 것은 아니에요.

---

## 개요

Sentry 는 오류 보고와 설정된 트레이싱을, PostHog 는 이벤트·화면 기록을 담당해요. 세션 리플레이는 현재 연결되어 있지 않아요. 화면 기록은 AnalyticsNavigatorObserver 가 연결된 Navigator 의 이름 있는 라우트를 관찰해요. Sentry DSN 과 PostHog 키는 각각의 구현체 선택에 사용되므로 한쪽 키가 없다고 다른 서비스까지 꺼지지는 않아요.

---

## 활성화

```yaml
# app_kits.yaml
kits:
  observability_kit: {}
```

```dart
// lib/main.dart
await AppKits.install([
  // ...
  ObservabilityKit(),
]);
```

### 환경 변수 주입 (운영)

```bash
<repo> dev start \
  --dart-define=SENTRY_DSN=https://xxx@sentry.io/yyy \
  --dart-define=POSTHOG_KEY=phc_xxx \
  --dart-define=POSTHOG_HOST=https://us.i.posthog.com
```

> `POSTHOG_HOST` 는 생략 가능해요 — 미주입 시 기본값이 `https://us.i.posthog.com` 이에요 (`observability_env.dart` 의 `defaultValue`). EU 프로젝트만 `https://eu.i.posthog.com` 으로 주입해요.

키가 없는 서비스는 Debug 구현을 사용해요. DebugAnalyticsService 의 출력은 assert, DebugCrashService 의 출력은 kDebugMode 조건을 따르므로 release 에서 콘솔에 반드시 보인다고 가정하지 않아요.

---

## 제공 기능

| 항목 | 설명 |
|------|------|
| `SentryCrashService` | `CrashService` 구현체. `reportError` · `setUser` · `breadcrumb` |
| `PostHogAnalyticsService` | `AnalyticsService` 구현체. `trackScreen` · `trackEvent` · `identify` |
| `AnalyticsNavigatorObserver` | go_router 경로 변경 감지 → `trackScreen` 자동 호출 |
| `ObservabilityEnv` | `isSentryEnabled` · `isPostHogEnabled` 환경 변수 감지 |
| BootStep: `_PostHogInitStep` | 앱 시작 시 PostHog 초기화 (private 클래스, `bootSteps` 통해 노출) |

---

## 핵심 API

### 크래시 수동 리포트

```dart
try {
  // ...
} catch (e, st) {
  await ref.read(crashServiceProvider).reportError(e, st, fatal: false);
}
```

### 커스텀 이벤트

```dart
await ref.read(analyticsProvider).trackEvent(
  'purchase_completed',
  properties: {
    'product_id': productId,
    'amount': amount,
  },
);
```

### 유저 식별

이메일 같은 추가 속성이 필요하면 앱의 수집 목적과 동의 범위를 확인한 뒤 traits 또는 email 인자로 전달해요. `sendDefaultPii: false` 가 수동 전달값까지 정제하지는 않아요.

```dart
// 로그인 시 — 기본 예제는 내부 식별자만 전달해요.
await ref.read(analyticsProvider).identify(userId);
await ref.read(crashServiceProvider).setUser(userId);

// 로그아웃 시
await ref.read(analyticsProvider).reset();
await ref.read(crashServiceProvider).clearUser();
```

### breadcrumb

```dart
await ref.read(crashServiceProvider).addBreadcrumb(
  'User clicked save button',
  data: {'screen': 'expense_edit'},
);
```

---

## Sentry 설정

### DSN 주입

```bash
--dart-define=SENTRY_DSN=https://xxx@sentry.io/yyy
```

### main.dart 의 조건부 래핑

아래는 조건 분기만 보여주는 발췌예요. 실제 main.dart 는 Flutter 바인딩과 AppConfig 등을 먼저 초기화한 뒤 이 분기를 실행해요.

```dart
void main() async {
  if (ObservabilityEnv.isSentryEnabled) {
    await SentryFlutter.init((options) {
      options.dsn = ObservabilityEnv.sentryDsn;
      options.environment = AppConfig.instance.environment.name;
      options.release = AppConfig.instance.appVersion;
      options.tracesSampleRate = 0.2;
      options.sendDefaultPii = false;  // SDK의 기본 PII 전송 옵션을 꺼요. 수동 데이터 정제는 별도예요.
    }, appRunner: _bootstrap);
  } else {
    await _bootstrap();  // Debug 폴백
  }
}
```

### 심볼 업로드 (난독화 스택 복원)

실물은 fastlane lane 이에요 — `.github/workflows/release-android.yml` 이 `fastlane android beta` (빌드) 와 `fastlane android upload_sentry_mapping` (업로드) 을 순서대로 호출해요.

```ruby
# android/fastlane/Fastfile 발췌
lane :build_release do
  # --obfuscate + --split-debug-info: 원본 심볼 매핑을 build/symbols/ 에 저장
  sh "cd ../.. && flutter build appbundle --release --flavor prod " \
     "--obfuscate --split-debug-info=build/symbols " \
     "#{defines.join(' ')}"
end

lane :upload_sentry_mapping do |options|
  # 1) ProGuard mapping (R8) — 네이티브 스택 심볼화.
  #    prod flavor 빌드라 variant 는 prodRelease 이고 mapping 도 그 아래에 생겨요.
  # 2) Dart split-debug-info — 난독화된 Dart 프레임 심볼화
  sh <<~SH
    sentry-cli --auth-token #{auth_token} \
      upload-proguard -o #{org} -p #{project} \
      ../../build/app/outputs/mapping/prodRelease/mapping.txt
    sentry-cli --auth-token #{auth_token} \
      upload-dif -o #{org} -p #{project} \
      ../../build/symbols
  SH
end
```

---

## PostHog 설정

### API Key 주입

```bash
--dart-define=POSTHOG_KEY=phc_xxx
--dart-define=POSTHOG_HOST=https://us.i.posthog.com   # 생략 시 이 값이 기본
```

### 자동 화면 추적

`AnalyticsNavigatorObserver`는 연결된 Navigator에서 이름이 있는 라우트의 push·replace·pop을 관찰해 화면 이벤트를 보내요. 이름이 없는 라우트나 별도 셸 Navigator의 탭 전환까지 모두 추적하는 것은 아니에요. 실제 이벤트가 필요한 화면에서 라우트 이름과 observer 연결을 확인해요.

```dart
// AppRouter 내부 (자동)
GoRouter(
  observers: [
    ...AppKits.allNavigatorObservers,  // ← observability_kit 이 기여
  ],
  // ...
)
```

### PII 주의

```dart
// ❌ 금지
await analytics.trackEvent('search', properties: {
  'query': userInput,  // ← 주소 · 카드 번호 등 민감 정보 가능
});

// ✅ 익명화
await analytics.trackEvent('search', properties: {
  'query_length': userInput.length,  // ← 길이만
});
```

---

## 파생 레포 체크리스트

### Sentry

- [ ] [Sentry](https://sentry.io) 프로젝트 생성 (Flutter)
- [ ] DSN 복사 → `.env` + GitHub Secrets (`SENTRY_DSN`)
- [ ] Auth token 발급 → GitHub Secrets (`SENTRY_AUTH_TOKEN`)
- [ ] Organization · Project slug → GitHub Secrets (`SENTRY_ORG`, `SENTRY_PROJECT`)
- [ ] Release 워크플로우에서 `--obfuscate` + 심볼 업로드 확인

### PostHog

- [ ] [PostHog](https://posthog.com) 프로젝트 생성
- [ ] API Key (Project API Key) 복사 → `.env` + GitHub Secrets (`POSTHOG_KEY`)
- [ ] Host 확인 (US default 는 `https://us.i.posthog.com`, EU 는 `https://eu.i.posthog.com`)
- [ ] 분석 대시보드에 첫 이벤트 들어오는지 확인

### 로컬 테스트

```bash
flutter run \
  --dart-define=SENTRY_DSN=$(grep SENTRY_DSN .env | cut -d= -f2) \
  --dart-define=POSTHOG_KEY=$(grep POSTHOG_KEY .env | cut -d= -f2)
```

---

## Code References

- [`lib/kits/observability_kit/observability_kit.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/observability_kit/observability_kit.dart)
- [`lib/kits/observability_kit/sentry_crash_service.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/observability_kit/sentry_crash_service.dart)
- [`lib/kits/observability_kit/posthog_analytics_service.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/observability_kit/posthog_analytics_service.dart)
- [`lib/kits/observability_kit/analytics_navigator_observer.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/observability_kit/analytics_navigator_observer.dart)
- [`lib/kits/observability_kit/observability_env.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/observability_kit/observability_env.dart)
- [`lib/kits/observability_kit/dogfooding_panel.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/observability_kit/dogfooding_panel.dart) — 개발자 도그푸딩 패널 (Sentry/PostHog 상태 점검)

---

## 관련 문서

- [`ADR-006 · Debug 폴백`](../philosophy/adr-006-debug-fallback.md)
- [`ADR-019 · 솔로 친화적 운영`](../philosophy/adr-019-solo-friendly.md) — 관측 서비스를 선택할 때 비교하는 운영 부담과 비용
- [`ADR-020 · 보안 방어선`](../philosophy/adr-020-security-hardening.md) — 심볼 업로드
