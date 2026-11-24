<a id="background_kit"></a>

# background_kit

`workmanager`로 주기 작업과 일회성 백그라운드 작업을 등록해요. 실행 시점과 앱 종료 후 동작은 운영체제의 제한을 받아요. 시간에 맞춰 반드시 실행되는 타이머로 가정하지 말고, 작업이 늦어지거나 다시 실행되어도 처리할 수 있게 구성해요.

---

## 개요

주기 작업과 지연된 일회성 작업을 등록할 수 있어요. Android 의 주기 작업은 최소 간격 제한을 받고 iOS 도 시스템이 실행 시점을 정하므로 정확한 시각에 실행되는 예약으로 보지는 않아요. 네트워크·충전 조건 등 workmanager 의 추가 옵션은 현재 래퍼가 노출하지 않아요. 필요하면 BackgroundTaskScheduler 구현을 확장하고 플랫폼별 등록 방식도 확인해요.

---

## 활성화

```yaml
# app_kits.yaml
kits:
  background_kit: {}
```

```dart
// lib/main.dart
import 'package:workmanager/workmanager.dart';

@pragma('vm:entry-point')
void callbackDispatcher() {
  Workmanager().executeTask((task, inputData) async {
    // task별 분기 처리
    return Future.value(true);
  });
}

await AppKits.install([
  BackgroundKit(
    scheduler: WorkmanagerTaskScheduler(),
    callbackDispatcher: callbackDispatcher,
  ),
]);
```

> `callbackDispatcher` 는 **top-level 함수** 여야 하고 `@pragma('vm:entry-point')` 가 필수예요 (Dart AOT 가 트리쉐이킹하지 않도록).

---

## 제공 기능

| 항목 | 설명 |
|------|------|
| `BackgroundKit` | `AppKit` 구현. workmanager 초기화 BootStep |
| `BackgroundTaskScheduler` | 태스크 등록 · 취소 API |
| `WorkmanagerTaskScheduler` | 실제 구현체 |

---

## 사용 예

```dart
// 주기 태스크 등록 (15분 이상)
await ref.read(backgroundTaskSchedulerProvider).registerPeriodic(
  uniqueName: 'daily_sync',
  taskName: 'sync',          // callbackDispatcher 내부에서 분기 키
  frequency: const Duration(days: 1),
  payload: {'type': 'full'}, // 선택: 콜백에 inputData 로 전달
);

// 1회성 태스크 등록 (지연 가능)
await ref.read(backgroundTaskSchedulerProvider).registerOneOff(
  uniqueName: 'send_log',
  taskName: 'log_upload',
  initialDelay: const Duration(minutes: 5),
);

// 특정 태스크 취소
await ref.read(backgroundTaskSchedulerProvider).cancel('daily_sync');

// 모두 취소
await ref.read(backgroundTaskSchedulerProvider).cancelAll();
```

> 추가 제약 (네트워크 / 충전 / Wi-Fi 등) 은 `WorkmanagerTaskScheduler` 가 workmanager 의 옵션을 직접 노출하지 않아요. 필요하면 파생 레포에서 `Scheduler` 인터페이스의 자체 구현체로 확장해요.

---

## 파생 레포 체크리스트

- [ ] iOS: `ios/Runner/Info.plist` 의 `UIBackgroundModes` 에 `fetch` · `processing` 추가
- [ ] iOS: `Info.plist` 의 `BGTaskSchedulerPermittedIdentifiers` 에 workmanager 태스크 식별자 등록
- [ ] Android: `AndroidManifest.xml` 의 permission 확인 (대부분 workmanager 자동)
- [ ] `@pragma('vm:entry-point')` 어노테이션 (Dart AOT 최적화 방지)

---

## Code References

- [`lib/kits/background_kit/background_kit.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/background_kit/background_kit.dart) — AppKit 구현
- [`lib/kits/background_kit/background_task_scheduler.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/background_kit/background_task_scheduler.dart) — 인터페이스 + `InMemoryBackgroundTaskScheduler` (테스트)
- [`lib/kits/background_kit/workmanager_task_scheduler.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/background_kit/workmanager_task_scheduler.dart) — 실제 workmanager 구현
