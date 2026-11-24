# 분석 도구 선택 가이드

이 문서는 템플릿의 PostHog 연동 범위와 다른 분석 도구로 교체하는 방법을 설명해요.

**관련 Kit**: [`observability_kit`](../features/observability-kit.md)

---

## 0. 본 템플릿의 기본값: PostHog

`observability_kit` 은 PostHog 를 `AnalyticsService` 구현체로 제공해요. 앱에서는 화면 조회, 이벤트 기록, 사용자 식별, 식별 초기화 메서드를 호출하고, 어댑터가 PostHog SDK 에 전달해요.

PostHog 가 제공하는 다른 제품 기능까지 템플릿에 연결된 것은 아니에요. 세션 리플레이, feature flag, A/B 테스트, 광고 유입 기여도 분석이 필요하다면 별도 설정과 구현 범위를 확인해요. 분석 키가 없을 때 사용하는 `DebugAnalyticsService` 는 외부로 전송하지 않고, assert 가 활성화된 실행에서만 콘솔에 출력해요.

---

## 1. 비교표

다른 도구를 검토할 때는 아래 항목을 비교해요. 무료 사용량과 가격은 바뀔 수 있으므로 도입 시점에 해당 서비스에서 확인해요.

| 확인할 항목 | 판단 기준 |
|---|---|
| 이벤트 분석 | 필요한 화면·이벤트·전환 경로를 기록하고 조회할 수 있는지 확인해요 |
| 데이터 처리 | 수집 항목, 보관 기간, 처리 지역, 내보내기 방법을 확인해요 |
| 앱 통합 | 지원 플랫폼과 SDK 초기화, 사용자 식별·초기화 방식을 확인해요 |
| 비용 | 실제 예상 이벤트 수와 추가 기능 비용으로 비교해요 |
| 교체 비용 | 기존 이벤트 이름과 속성을 유지하고 데이터를 옮길 수 있는지 확인해요 |

Mixpanel, Amplitude, Google Analytics 계열 도구를 검토할 수 있어요. Firebase Analytics 와 GA4 를 서로 무관한 별도 분석 체계로 가정해 중복 집계하지 않도록 연동 구조도 확인해요. 어떤 도구든 현재 템플릿에서 제공하는 PostHog 어댑터를 대신하려면 구현과 검증이 필요해요.

---

<a id="2-교체-방법--analyticsservice-인터페이스-활용"></a>

## 2. 교체 방법 — `AnalyticsService` 인터페이스 활용

이 템플릿은 `lib/core/analytics/` 가 `AnalyticsService` 인터페이스와 Debug 폴백 구현을 정의하고, `observability_kit` 이 PostHog 구현체를 제공해요.

```dart
// lib/core/analytics/analytics_service.dart 발췌
abstract class AnalyticsService {
  Future<void> trackScreen(String screenName, {Map<String, dynamic>? properties});
  Future<void> trackEvent(String eventName, {Map<String, dynamic>? properties});
  Future<void> identify(String userId, {Map<String, dynamic>? traits});
  Future<void> reset();
}
```

다른 도구를 쓰려면 `AnalyticsService` 의 네 메서드를 구현해요. `main.dart` 의 Provider 조립이나 ObservabilityKit 에서 `analyticsProvider` 를 새 구현체로 바꾸고, `AnalyticsNavigatorObserver` 의 화면 기록도 확인해요. SDK 초기화·사용자 식별·로그아웃 시 초기화까지 검증해야 교체가 끝나요.

---

## 3. 여러 도구 동시 사용

마이그레이션 중 같은 이벤트를 두 도구에 보내야 한다면 여러 구현체에 위임하는 어댑터를 둘 수 있어요. 아래 코드는 `trackEvent` 만 보여주는 일부 예제이며 템플릿에는 포함되어 있지 않아요. 순서대로 `await` 하므로 앞 구현체가 예외를 던지면 뒤 구현체는 호출되지 않아요. 나머지 세 메서드와 실패 처리 방식은 앱의 요구에 맞게 구현해야 해요.

```dart
class FanOutAnalyticsService implements AnalyticsService {
  FanOutAnalyticsService(this._delegates);
  final List<AnalyticsService> _delegates;

  @override
  Future<void> trackEvent(String eventName, {Map<String, dynamic>? properties}) async {
    for (final d in _delegates) {
      await d.trackEvent(eventName, properties: properties);
    }
  }
  // ... trackScreen / identify / reset 도 동일 패턴으로 fan-out
}
```

---

## 4. 한국 시장 특화

광고 유입 기여도 분석이 필요하면 Adjust 나 AppsFlyer 같은 별도 도구도 검토할 수 있어요. PostHog 와 함께 쓸지는 필요한 지표와 중복 수집 여부로 결정해요. AceCounter 나 Naver Analytics 역시 이름만으로 포함·제외하지 말고 앱 지원 범위와 실제 요구를 확인해요.

분석 도구를 추가하면 실제 수집 항목, 보관 기간, 데이터 처리 주체와 지역을 개인정보처리방침 및 동의 흐름과 대조해요. SDK 크기나 정책 요건을 측정·확인 없이 고정값으로 가정하지 않아요.

---

## 5. 결정 가이드

```text
외부에 사용자 행동 데이터를 보내야 하나요?
├── 아니요 → DebugAnalyticsService 를 유지해요
└── 예 → 필요한 지표와 데이터 처리 조건을 정해요
        ├── 현재 이벤트·화면 기록으로 충분해요 → PostHog 연동을 사용해요
        └── 추가 지표나 광고 분석이 필요해요 → 기존 도구 확장·교체·병행을 비교해요
```

분석 도구를 사용하는 데 앱 자체의 백엔드 API 가 반드시 필요한 것은 아니에요.

---

## 6. Code References

- [`lib/core/analytics/analytics_service.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/core/analytics/analytics_service.dart) — 인터페이스
- [`lib/kits/observability_kit/posthog_analytics_service.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/observability_kit/posthog_analytics_service.dart) — PostHog 어댑터
- [`docs/integrations/posthog.md`](./posthog.md) — PostHog 셋업 절차
