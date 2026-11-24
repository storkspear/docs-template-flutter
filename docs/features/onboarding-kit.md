<a id="onboarding_kit"></a>

# onboarding_kit

온보딩 단계 UI와 완료 여부 저장, 미완료 사용자를 온보딩 경로로 보내는 규칙을 제공해요. 규칙의 우선순위는 50이에요. 현재 AuthKit 과 함께 설치하고 미인증·온보딩 미완료 상태로 진입하면 `/login` 과 `/onboarding` 사이의 리다이렉트 루프가 재현돼요. 이 조합은 인증 상태와 진입 조건을 함께 설계하고 검증해야 해요. [ADR-018](../philosophy/adr-018-redirect-priority.md) 에 현행 제약을 정리했어요.

---

## 개요

온보딩이 미완료면 라우팅 게이트가 `/onboarding` 으로 강제 이동시켜요. 완료 플래그는 `SharedPreferences` 에 저장돼서 재시작 후에도 유지돼요. 위자드 페이지는 `OnboardingStep` 인터페이스로 추가할 수 있어요. Skip 버튼은 `OnboardingScaffold` 가 `onSkip` 콜백으로 지원하지만, kit 의 기본 라우트는 이를 전달하지 않아요 — 쓰려면 파생 레포에서 커스텀 라우트로 `OnboardingScaffold(onSkip: ...)` 를 직접 구성해야 해요.

---

## 활성화

```yaml
# app_kits.yaml
kits:
  onboarding_kit: {}
```

```dart
// lib/main.dart — prefsStorage 는 main.dart 상단에서 이미 init 된 PrefsStorage 인스턴스
await AppKits.install([
  OnboardingKit(
    prefs: prefsStorage,
    steps: [
      WelcomeStep(),
      PermissionRequestStep(),
      NotificationSetupStep(),
    ],
  ),
]);
```

---

## 제공 기능

| 항목 | 설명 |
|------|------|
| `OnboardingKit` | `AppKit` 구현. `redirectPriority: 50` |
| `OnboardingStep` | 추상. `Widget build(BuildContext)` · `Future<bool> onNext(BuildContext)` (true 반환 시 다음 스텝으로) |
| `OnboardingScaffold` | 공통 위자드 UI (페이지 전환 · 진행 바) |
| 완료 플래그 | `SharedPreferences` 에 영속, `isComplete` ValueNotifier 로 노출 |

---

## 파생 레포에서 OnboardingStep 구현

```dart
class WelcomeStep extends OnboardingStep {
  @override
  Widget build(BuildContext context) {
    return const Column(children: [
      Text('앱에 오신 걸 환영해요'),
      // ...
    ]);
  }

  // 선택: 사용자가 "다음" 누를 때 검증/저장 로직.
  // 기본 구현은 true (즉시 다음 스텝). false 반환 시 머무름.
  @override
  Future<bool> onNext(BuildContext context) async => true;
}
```

---

## 파생 레포 체크리스트

- [ ] 앱에 필요한 OnboardingStep 을 작성해요. 단계 수는 안내할 내용에 맞춰 정해요.
- [ ] `main.dart` 의 `OnboardingKit(prefs: prefsStorage, steps: [...])` 등록
- [ ] 완료 플래그 리셋 방법 고민 (예: 개발자 설정 메뉴)
- [ ] (선택) 다크모드 대응 · 애니메이션

---

## Code References

- [`lib/kits/onboarding_kit/onboarding_kit.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/onboarding_kit/onboarding_kit.dart)
- [`lib/kits/onboarding_kit/onboarding_step.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/onboarding_kit/onboarding_step.dart)
- [`lib/kits/onboarding_kit/onboarding_scaffold.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/onboarding_kit/onboarding_scaffold.dart)

---

## 관련 문서

- [`ADR-018 · 라우팅 우선순위`](../philosophy/adr-018-redirect-priority.md) — `redirectPriority: 50`
