# Devices

이 문서는 푸시 알림 발송 대상 기기의 등록/해제 계약을 다뤄요. 짝 백엔드의 [`DeviceController`](https://github.com/storkspear/template-spring/blob/main/core/core-device-impl/src/main/java/com/factory/core/device/impl/controller/DeviceController.java) 와 1:1 로 결합돼요.

Flutter 측 호출은 [`lib/kits/backend_api_kit/device_registration.dart`](../../lib/kits/backend_api_kit/device_registration.dart) 의 `DeviceRegistration` 클래스가 담당해요.

---

## 엔드포인트

| Method | Path | 인증 | Response |
|---|---|---|---|
| POST | `/api/apps/{appSlug}/devices` | 필수 | `ApiResponse<DeviceDto>` |
| DELETE | `/api/apps/{appSlug}/devices/{id}` | 필수 | `204 No Content` |

> `/api/apps/{appSlug}` prefix 가 붙어요 — `ApiClient.post` / `ApiClient.delete` 의 자동 prefix 적용 대상이에요.

---

## 등록 (POST)

### Request

```http
POST /api/apps/{appSlug}/devices
Authorization: Bearer <access_token>
Content-Type: application/json
```

```json
{
  "platform": "ios",
  "pushToken": "fcm-or-apns-token-string",
  "deviceName": "iPhone 15"
}
```

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `platform` | string | ✅ | `"ios"` 또는 `"android"` |
| `pushToken` | string | ⬜ | FCM 토큰 (iOS 도 FCM 사용 권장) 또는 APNs 토큰. 서버는 null 허용 (토큰 없이 등록 가능) |
| `deviceName` | string | ⬜ | 사용자 표시용 (예: "홍길동의 아이폰") |

### Upsert 의미론

**같은 user + 같은 platform** 으로 다시 호출하면 백엔드가 **기존 레코드를 update** 해요 (새 token 으로 교체). 즉, FCM 토큰 갱신 시 별도 DELETE 없이 POST 만으로 갱신할 수 있어요. 이 동작은 짝 백엔드 `DeviceController.register` 의 docstring 에 명시돼요.

### Response

```json
{
  "data": {
    "id": 101,
    "userId": 42,
    "appSlug": "habit-tracker",
    "platform": "ios",
    "pushToken": "fcm-or-apns-token-string",
    "deviceName": "iPhone 15",
    "lastSeenAt": "2026-04-15T03:21:00Z",
    "createdAt": "2026-04-15T03:21:00Z"
  }
}
```

> 필드는 짝 백엔드 `DeviceDto` record 의 8필드 그대로예요 — 계약 변경 시 이 record 가 진실의 출처예요.

응답의 `id` 를 클라가 보관해두면 향후 DELETE 시 그대로 쓸 수 있어요 (보통 로그아웃 직전 unregister 호출).

---

## 해제 (DELETE)

### Request

```http
DELETE /api/apps/{appSlug}/devices/{id}
Authorization: Bearer <access_token>
```

`{id}` 는 등록 시 받은 device id 예요.

### Response

```http
204 No Content
```

본문은 없어요. 현재 서버는 기기가 없거나 본인 소유가 아니면 모두 404 (`CMN_002`)를 반환해요.

---

## 클라이언트 호출 패턴

```dart
// 등록 (FCM 토큰 갱신 콜백에서 자동 호출)
final info = await deviceRegistration.register(
  pushToken: fcmToken,
  deviceName: deviceName,
);
// info!.id 를 prefs 에 저장해 두면 unregister 시 사용

// 해제 (로그아웃 직전)
await deviceRegistration.unregister(savedDeviceId);
```

---

## 알림 흐름 결합

디바이스가 등록돼야 백엔드가 푸시를 보낼 대상을 결정해요. 알림 채널 (push/email) 별 toggle 은 [`notification-settings.md`](./notification-settings.md) 참조.

```text
파생 앱의 Firebase 초기화 및 FCM 토큰 획득
  → DeviceRegistration.register(pushToken)
    → 토큰이 바뀌면 다시 등록
      → 백엔드가 등록된 기기와 알림 설정을 확인해 발송
```

---

## 계약 변경 시

- 새 `platform` 값 (예: `"web"`) 추가는 양쪽 동시 배포가 필요해요. 짝 백엔드의 `Device.platform` 검증 로직 + Flutter 의 `Platform.isIOS / isAndroid` 분기 둘 다 갱신해요.

---

## 관련 문서

- [`notification-settings.md`](./notification-settings.md) — kind 별 push/email toggle
- [`response-schema.md`](./response-schema.md) — `ApiResponse<T>` 래퍼
- [짝 백엔드 `DeviceController`](https://github.com/storkspear/template-spring/blob/main/core/core-device-impl/src/main/java/com/factory/core/device/impl/controller/DeviceController.java)
