<a id="payment_kit"></a>

# payment_kit

결제 서비스의 인터페이스와 개발용 Debug 구현을 제공해요. Stripe 구현체는 `init`과 결제 호출이 아직 구현되지 않은 골격이에요. 실제 결제를 제공하려면 파생 앱의 결제 정책에 맞춰 SDK·서버·영수증 검증과 오류 처리를 연결해야 해요.

> ⚠️ **이 kit 은 template 에 commit 됐지만 `app_kits.yaml` default 에는 enable 되어 있지 않아요**. 결제를 도입할 때만 활성화해요.

## 활성화 (template 시점, Debug 폴백)

`app_kits.yaml`:
```yaml
kits:
  backend_api_kit: {}    # requires 충족 필수
  payment_kit: {}
```

`lib/main.dart`:
```dart
await AppKits.install([
  BackendApiKit(),
  PaymentKit(),  // service 주입 안 하면 DebugPaymentService default
]);
```

이 상태에서 결제를 호출하면 콘솔에 `[Payment] DebugPaymentService.charge ...` 로그가 찍히고 fake `debug-{timestamp}` transactionId 가 반환돼요.

## 파생 레포 활성화 (실구현)

1. `pubspec.yaml` 에 결제 SDK 추가 (`flutter_stripe` 또는 자체 SDK)
2. `lib/kits/payment_kit/stripe_payment_service.dart` 의 `init` / `charge` 채움
3. `lib/main.dart` 에서 실구현체 주입:
   ```dart
   PaymentKit(service: StripePaymentService(publishableKey: const String.fromEnvironment('STRIPE_KEY')))
   ```
4. `--dart-define=STRIPE_KEY=pk_test_...` 빌드

## 자세한 메커니즘

핵심 API · 파생 레포 체크리스트 · 제거 가이드 · 테스트 패턴은 [`lib/kits/payment_kit/README.md`](../../lib/kits/payment_kit/README.md) 를 참고하세요.

## Code References

- [`lib/kits/payment_kit/payment_kit.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/payment_kit/payment_kit.dart) — AppKit 구현 + `_PaymentInitStep`
- [`lib/kits/payment_kit/payment_service.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/payment_kit/payment_service.dart) — interface + `PaymentResult` + `PaymentException`
- [`lib/kits/payment_kit/debug_payment_service.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/payment_kit/debug_payment_service.dart) — Debug 폴백
- [`lib/kits/payment_kit/stripe_payment_service.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/payment_kit/stripe_payment_service.dart) — Stripe placeholder
