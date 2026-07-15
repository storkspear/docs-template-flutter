# User Profile

현재 로그인 유저의 **자신의 프로필** 조회/수정. 짝 백엔드의 `UserController` ([`/api/apps/{slug}/users/me`](https://github.com/storkspear/template-spring/blob/main/core/core-user-impl/src/main/java/com/factory/core/user/impl/controller/UserController.java)) 와 1:1 결합.

> **경로 — 앱별 endpoint** : auth·device 와 동일하게 `/api/apps/{slug}/users/...` 아래에 있어요. 백엔드 `AppSlugVerificationFilter` 가 path slug ↔ JWT slug 일치를 강제해 cross-app 접근을 막아요.
>
> Flutter `ApiClient.get/patch` 의 `/api/apps/{slug}` 자동 prefix 를 그대로 써요. `api_endpoints.dart` 의 `userMe`/`userById` 는 **상대 경로**(`/users/me`, `/users/{id}`)이고, `_apiClient.get(ApiEndpoints.userMe)` 처럼 호출해요 (device 와 동일 컨벤션).

---

## 엔드포인트

| Method | Path | 인증 | Response |
|---|---|---|---|
| GET | `/api/apps/{slug}/users/me` | 필수 | `ApiResponse<UserProfile>` |
| PATCH | `/api/apps/{slug}/users/me` | 필수 | `ApiResponse<UserProfile>` |
| POST | `/api/apps/{slug}/users/me/activity` | 필수 | `204 No Content` |

---

## 조회 (GET)

### Request

```http
GET /api/apps/{slug}/users/me
Authorization: Bearer <access_token>
```

> URL 의 `{slug}` 와 JWT 의 `appSlug` 가 일치해야 통과해요 (`AppSlugVerificationFilter`). 본인 식별은 JWT 의 `sub` 로 해요.

### Response

```json
{
  "data": {
    "id": 42,
    "email": "user@example.com",
    "displayName": "홍길동",
    "nickname": "gildong",
    "emailVerified": true,
    "role": "user",
    "isPremium": false,
    "createdAt": "2026-04-15T03:21:00Z",
    "updatedAt": "2026-04-15T03:21:00Z"
  },
  "error": null
}
```

> 정확한 필드는 짝 백엔드의 `UserProfile` record 를 진실 출처로 봐요. 프론트가 임의로 필드 추가/삭제하지 않아요 (계약 변경은 백엔드 리드).

---

## 수정 (PATCH — partial update)

### Request

```http
PATCH /api/apps/{slug}/users/me
Authorization: Bearer <access_token>
Content-Type: application/json
```

```json
{
  "displayName": "홍길동(수정)"
}
```

### PATCH 의미론

- **`null` 필드는 유지**: 본문에 포함되지 않은 필드는 변경 안 됨.
- **명시적 `null` 도 유지** (clear 의도가 아님): 짝 백엔드는 PATCH 의미를 "absent = no-op" 로 해석.
- 변경 불가 필드 (id, email, emailVerified, role, isPremium, createdAt, updatedAt) 는 본문에 포함해도 무시. (`isPremium` 은 결제/구독 상태, `updatedAt` 은 서버가 자동 갱신.)

### Response

수정 후 최신 `UserProfile` 반환 (GET 과 동일 shape).

```json
{
  "data": {
    "id": 42,
    "email": "user@example.com",
    "displayName": "홍길동(수정)",
    "nickname": "gildong",
    "emailVerified": true,
    "role": "user",
    "isPremium": false,
    "createdAt": "2026-04-15T03:21:00Z",
    "updatedAt": "2026-04-16T09:10:00Z"
  },
  "error": null
}
```

---

## 활동 ping (POST)

포그라운드 복귀 시 호출하는 초경량 인증 엔드포인트예요. 본문 로직은 없고, **인증 통과 자체가 목적**이에요 — 백엔드의 `UserActivityTrackingFilter` 가 이 요청에서 `(user_id, 오늘)` 활동을 기록해요. 순수-로컬 세션(다른 API 호출 없이 캐시된 화면만 보는 경우)도 DAU/MAU 파생에서 누락되지 않게 하려는 설계예요.

### Request

```http
POST /api/apps/{slug}/users/me/activity
Authorization: Bearer <access_token>
```

바디 없음.

### Response

```http
204 No Content
```

### 클라이언트 정책

- Flutter `ActivityPinger`(`lib/kits/auth_kit/activity_pinger.dart`)가 **로그인 상태에서만**, 마지막 성공 시각 기준 **6시간 스로틀**로 호출해요.
- 트리거는 부팅 1회(`ActivityPingStep`, fire-and-forget) + 포그라운드 복귀(`didChangeAppLifecycleState(resumed)`) 두 곳이에요.
- 실패는 조용히 무시하고 재시도 로직은 없어요 — 다음 자연 트리거에서 다시 시도돼요.

> `ApiEndpoints.activityPing` 은 `userMe`(상대 경로) 기준 `$userMe/activity` 로 계산돼요 — device/user 와 동일하게 `ApiClient` 의 `/api/apps/{slug}` 자동 prefix 를 타요.

---

## 클라이언트 호출 패턴

```dart
// ApiClient.get — /api/apps/{slug} prefix 자동 적용 + fromData 디코드
final response = await apiClient.get(
  ApiEndpoints.userMe,
  fromData: (data) => UserProfile.fromJson(data as Map<String, dynamic>),
);
final profile = response.data; // UserProfile
```

> 실 코드는 `lib/features/profile/` 같은 도메인 layer 에서 wrap 해요. 이 문서는 계약만 정리.

---

## 계약 변경 시

- 짝 백엔드의 `UserProfile.java` 와 Flutter 의 `UserProfile.fromJson` 동시 수정.
- 필드 **추가** 는 하위 호환 (Flutter 가 모르는 필드 무시). **삭제** / **이름 변경** 은 양쪽 동시 배포 + 마이그레이션 필요.

---

## 관련 문서

- [`response-schema.md`](./response-schema.md) — `ApiResponse<T>` 래퍼 구조
- [`auth-flow.md`](./auth-flow.md) — JWT 인증 흐름 (`sub` → userId)
- [`error-codes.md`](./error-codes.md) — `USR_*` 에러 코드
- [짝 백엔드 `UserController`](https://github.com/storkspear/template-spring/blob/main/core/core-user-impl/src/main/java/com/factory/core/user/impl/controller/UserController.java)
