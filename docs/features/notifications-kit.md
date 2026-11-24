<a id="notifications_kit"></a>

# notifications_kit

로컬 예약 알림 (특정 시각 · 매일 반복) 과 타임존 처리를 담당하는 kit 이에요. FCM 푸시가 필요하면 `NotificationService` 인터페이스를 파생 레포에서 구현해 통합해요.

---

## 개요

로컬 예약 알림은 `flutter_local_notifications`와 `timezone`을 사용해요. 초기화할 때 기기 시간대를 읽고, 읽지 못하면 `Asia/Seoul`을 사용해요. 권한이 없다고 Debug 구현으로 자동 전환되거나 `PermissionsKit` 설치만으로 요청 UI가 붙지는 않아요. 파생 앱에서 권한 요청을 연결해야 해요. FCM을 사용할 때도 Firebase 초기화, 토큰 등록·갱신과 수신 처리를 별도로 구성해요.

---

## 활성화

```yaml
# app_kits.yaml
kits:
  notifications_kit: {}
```

```dart
// lib/main.dart
await AppKits.install([
  NotificationsKit(service: LocalScheduledAlertService()),
  // (선택) PermissionsKit(),
]);
```

> `service` 인자는 필수이고 타입은 `ScheduledAlertService` 예요. 로컬 전용은 `LocalScheduledAlertService` 를 전달해요. FCM 통합은 이 `service` 인자로 넘기는 게 아니라 `notificationServiceProvider` override 로 주입해요(아래 참조) — `service` 에 FCM 구현을 넘기려 하면 타입이 안 맞아 컴파일 에러가 나요.

---

## 제공 기능

| 항목 | 설명 |
|------|------|
| `ScheduledAlertService` | **로컬 예약 알림 인터페이스** — `init` · `scheduleAt` · `scheduleDaily` · `cancel` · `cancelAll` · `getPending` |
| `LocalScheduledAlertService` | `flutter_local_notifications` 기반 구현 — 로컬 전용 앱의 권장 구현 (`service:` 인자로 명시 전달, default 아님) |
| `NotificationService` | **FCM 푸시 인터페이스** — `init` · `getToken` · `onTokenRefresh` · `onForegroundMessage` · `onNotificationTap` (구현은 파생 레포에서) |
| `NotificationPermission` | 권한 요청 전 사전 설명 다이얼로그 헬퍼 (`showRationale(context)` — true 반환 시 시스템 권한 요청 진행) |

> 백엔드에 FCM 토큰을 등록하는 `DeviceRegistration` 은 [`backend_api_kit`](./backend-api-kit.md) 에 있어요 — 로컬 전용 알림 앱이 BackendApiKit 없이 NotificationsKit 만 쓸 수 있게 도메인을 분리한 결과예요.

---

## 핵심 API

### 로컬 알림 예약

```dart
// 1회성 예약
await ref.read(scheduledAlertServiceProvider).scheduleAt(
  id: 100,
  title: '운동 시간이에요',
  body: '오늘의 목표를 완료하세요',
  when: DateTime.now().add(const Duration(hours: 1)),
);

// 매일 같은 시간
await ref.read(scheduledAlertServiceProvider).scheduleDaily(
  id: 200,
  title: '매일 아침 체크인',
  body: '오늘의 기분 기록',
  hour: 9,
  minute: 0,
);

// 취소 (positional 인자)
await ref.read(scheduledAlertServiceProvider).cancel(100);
await ref.read(scheduledAlertServiceProvider).cancelAll();
```

> Android 12+ 에서 정시 알람 (`exactTiming: true`) 을 쓰려면 `SCHEDULE_EXACT_ALARM` 권한이 필요해요. 자세한 옵션은 `ScheduledAlertService` 인터페이스 dartdoc 을 참조하세요.

`scheduleDaily`는 다음 날짜를 달력 기준으로 계산해 일광절약시간 전환 전후에도 지정한 현지 시각을 유지해요. 존재하지 않는 시각이나 중복되는 시각의 실제 발화는 플랫폼 정책을 따라요. 테스트에서는 `LocalScheduledAlertService(now: ...)`로 기준 시각을 주입할 수 있어요.

### FCM 푸시 (선택)

```dart
// 토큰 등록 (로그인 시)
final token = await FirebaseMessaging.instance.getToken();
if (token != null && token.isNotEmpty) {
  await ref.read(deviceRegistrationProvider).register(pushToken: token);
}

// 포그라운드 메시지 수신
FirebaseMessaging.onMessage.listen((RemoteMessage message) {
  // 필요한 foreground 표시를 파생 앱에서 구현해요. 자동 재표시는 제공하지 않아요.
});
```

---

## 파생 레포 체크리스트

### 로컬 알림만

- [ ] Android: `AndroidManifest.xml` 에 `POST_NOTIFICATIONS` 권한 (API 33+)
- [ ] `permissions_kit` 으로 권한 요청 UI

### FCM 푸시

- [ ] [Firebase Console](https://console.firebase.google.com) 프로젝트 생성
- [ ] iOS: `ios/Runner/Info.plist` 의 `UIBackgroundModes` 에 `remote-notification` 추가 (백그라운드 푸시 수신 시 — 로컬 예약 알림만 쓰면 불필요)
- [ ] Android·iOS 의 dev/prod 설정 파일과 Firebase 초기화를 확인해요.
- [ ] iOS APNs 설정과 백엔드의 FCM 인증 설정을 [FCM 통합 가이드](../integrations/fcm.md) 에 맞춰 준비해요.
- [ ] `NotificationService` 구현체 (FirebaseMessaging 기반) 작성 후 `notificationServiceProvider` override

### 타임존

- [x] `timezone` 패키지 초기화와 기기 시간대 적용은 `LocalScheduledAlertService.init()` 이 해요 (`flutter_timezone` 으로 읽고, 못 읽으면 `Asia/Seoul`)

---

## Code References

- [`lib/kits/notifications_kit/notifications_kit.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/notifications_kit/notifications_kit.dart) — `AppKit` 구현
- [`lib/kits/notifications_kit/scheduled_alert_service.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/notifications_kit/scheduled_alert_service.dart) — 인터페이스
- [`lib/kits/notifications_kit/local_scheduled_alert_service.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/notifications_kit/local_scheduled_alert_service.dart) — 기본 구현
- [`lib/kits/notifications_kit/notification_service.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/notifications_kit/notification_service.dart) — FCM 인터페이스
- [`lib/kits/notifications_kit/notification_permission.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/notifications_kit/notification_permission.dart) — 권한 헬퍼
- [`lib/kits/backend_api_kit/device_registration.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/backend_api_kit/device_registration.dart) — push token 백엔드 등록

---

## 관련 문서

- [`permissions-kit.md`](./permissions-kit.md) — 알림 권한 요청
- [`background-kit.md`](./background-kit.md) — workmanager 와 함께 사용 시
- [`ADR-006 · Debug 폴백`](../philosophy/adr-006-debug-fallback.md)
