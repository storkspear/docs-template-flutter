# Notification Preferences

사용자별 알림 채널 toggle (push / email). 짝 백엔드의 [`NotificationSettingController`](https://github.com/storkspear/template-spring/blob/main/core/core-billing-impl/src/main/java/com/factory/core/billing/impl/controller/NotificationSettingController.java) (ADR-031) 와 1:1 결합.

Flutter 측 호출은 [`lib/kits/backend_api_kit/notification_settings.dart`](../../lib/kits/backend_api_kit/notification_settings.dart) 의 `NotificationSettings` 클래스가 담당.

> **백엔드 노출 방식**: 짝 백엔드의 `NotificationSettingController` 는 `BillingAutoConfiguration` 이 `@Import` 로 **자동 등록**해요 (`{appSlug}` path variable 라우팅이라 per-app heredoc 불필요). 즉 **template 단계에서도 endpoint 가 동작**하고, Flutter 호출이 바로 실효화돼요.

---

## 엔드포인트

| Method | Path | 인증 | Response |
|---|---|---|---|
| GET | `/api/apps/{appSlug}/me/notification-settings` | 필수 | `ApiResponse<List<NotificationSettingDto>>` |
| PATCH | `/api/apps/{appSlug}/me/notification-settings/{kind}` | 필수 | `204 No Content` |

> `/api/apps/{appSlug}` prefix 적용 대상 — `ApiClient.get` / `ApiClient.patch` 자동 prefix 사용.

---

## 데이터 모델

### NotificationKind (enum)

| 값 (wire) | 의미 |
|---|---|
| `RENEWAL_SUCCEEDED` | 구독 갱신 성공 |
| `RENEWAL_FAILED` | 구독 갱신 실패 (결제 거절 등) |
| `RENEWAL_ABANDONED` | 구독 자동 갱신 중단 (사용자 취소 등) |
| `IAP_REFUND` | IAP 환불 처리 |
| `IAP_REVOKE` | IAP 권한 회수 (가족 공유 해제 등) |

> 짝 백엔드의 `core-billing-api/NotificationKind.java` 와 **1:1 매핑**. 추가 시 양쪽 동시 변경 필요. Flutter 측 enum 은 `kits/backend_api_kit/notification_settings.dart` 의 `NotificationKind`.

### NotificationSettingDto

```json
{
  "kind": "RENEWAL_SUCCEEDED",
  "pushEnabled": true,
  "emailEnabled": false
}
```

| 필드 | 타입 | 설명 |
|---|---|---|
| `kind` | string (enum) | `NotificationKind` 직렬화 형식 |
| `pushEnabled` | boolean | push 채널 활성 여부 |
| `emailEnabled` | boolean | email 채널 활성 여부 |

---

## 조회 (GET)

### Request

```http
GET /api/apps/{appSlug}/me/notification-settings
Authorization: Bearer <access_token>
```

### Response

```json
{
  "data": [
    { "kind": "RENEWAL_SUCCEEDED", "pushEnabled": true, "emailEnabled": false },
    { "kind": "IAP_REFUND",         "pushEnabled": true, "emailEnabled": true }
  ],
  "error": null
}
```

> **미등록 kind 는 응답에 미포함** — default 값은 **enabled (push/email 둘 다 on)** 으로 간주해요. 즉, "응답에 없는 kind" = "기본 ON". 이 규약은 짝 백엔드 listener 의 dispatch 분기와 일치해요.

---

## 변경 (PATCH — upsert)

### Request

```http
PATCH /api/apps/{appSlug}/me/notification-settings/RENEWAL_SUCCEEDED
Authorization: Bearer <access_token>
Content-Type: application/json
```

```json
{
  "pushEnabled": false,
  "emailEnabled": true
}
```

### upsert 의미론

- 본문의 **두 필드 모두 필수** (짝 백엔드 `NotificationSettingUpdateRequest` 의 `@NotNull`).
- 미등록 kind 라도 **PATCH 1회로 등록**됨 (server-side upsert).
- 부분 업데이트 X — push 만 바꾸려고 해도 emailEnabled 도 함께 보내야 해요.

### Response

```http
204 No Content
```

---

## 클라이언트 호출 패턴

```dart
// 조회
final prefs = await notificationPreferences.list();
// prefs 에 없는 NotificationKind 는 default = ON 처리

// 변경 — push 만 끄고 싶어도 두 필드 모두 명시
await notificationPreferences.update(
  NotificationKind.renewalSucceeded,
  pushEnabled: false,
  emailEnabled: true,
);
```

---

## UX 권장 패턴 (파생 레포)

설정 화면에서 kind 별 row 를 보여줄 때:
1. `list()` 결과를 Map<NotificationKind, NotificationPreference> 로 인덱싱.
2. 각 kind 에 대해 응답에 있으면 그 값, 없으면 default `(push: true, email: true)` 사용.
3. toggle 변경 시 두 필드 모두 포함해 PATCH.

UI 구현은 본 template 의 책임이 아니에요 — service + provider (`notificationSettingsProvider` in `lib/common/providers.dart`) 만 제공해요.

---

## 관련 문서

- [`devices.md`](./devices.md) — 푸시 발송 대상 디바이스 등록 (push 채널의 전제)
- [`response-schema.md`](./response-schema.md) — `ApiResponse<T>` 래퍼
- [짝 백엔드 `NotificationSettingController`](https://github.com/storkspear/template-spring/blob/main/core/core-billing-impl/src/main/java/com/factory/core/billing/impl/controller/NotificationSettingController.java)
- [짝 백엔드 ADR-031 — 사용자 알림 toggle](https://github.com/storkspear/template-spring/blob/main/docs/philosophy/adr-031-notification-preferences.md)
