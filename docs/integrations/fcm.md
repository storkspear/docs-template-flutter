# Firebase Cloud Messaging (FCM) 통합

> **목표**: Firebase 프로젝트 생성 → google-services 파일 배치 → notification provider 교체 → 푸시 1건 이상 수신 확인까지.

**관련 Kit**: [`notifications_kit`](../features/notifications-kit.md) (로컬 알림) + [`backend_api_kit`](../features/backend-api-kit.md) (`DeviceRegistration` 으로 토큰 등록)

---

## 0. 본 템플릿의 푸시 전략

- **Default**: `DebugNotificationService` (콘솔만 — 푸시 안 보냄). FCM 미사용 앱은 손댈 것 없음.
- **FCM 활성**: 파생 레포에서 `FcmNotificationService` (또는 동등 구현) 작성 후 `notificationServiceProvider` override.
- **백엔드 통합**: `backend_api_kit/device_registration.dart` 의 `DeviceRegistration` 으로 FCM 토큰을 백엔드 `/api/apps/{appSlug}/devices` 에 등록 — 백엔드가 사용자별 토큰 관리.

---

## 1. Firebase 프로젝트 생성

1. https://console.firebase.google.com 에서 프로젝트 생성 (앱 슬러그 권장)
2. **앱 추가**:
   - Android: 패키지명 (`android/app/build.gradle.kts` 의 `applicationId`) 입력 → `google-services.json` 다운로드 → `android/app/` 에 배치
   - iOS: Bundle ID (`ios/Runner.xcodeproj` 의 PRODUCT_BUNDLE_IDENTIFIER) 입력 → `GoogleService-Info.plist` 다운로드 → Xcode 에서 Runner 에 추가

> 두 파일 모두 git ignore 권장 (조직 마다 다름) — 또는 GHA Secrets 에 base64 로 저장 후 빌드 시 복원.

---

## 2. Flutter 의존성 추가

`pubspec.yaml`:

```yaml
dependencies:
  firebase_core: ^3.6.0
  firebase_messaging: ^15.1.3
```

`flutter pub get`.

---

## 3. Native 셋업

### Android

`android/build.gradle.kts` 또는 `android/settings.gradle.kts` 에 Google Services plugin:

```kotlin
plugins {
    id("com.google.gms.google-services") version "4.4.2" apply false
}
```

`android/app/build.gradle.kts`:

```kotlin
plugins {
    id("com.google.gms.google-services")
}
```

### iOS

Xcode → Runner → Capabilities → **Push Notifications**, **Background Modes (Remote notifications)** 활성화.
APNs 인증서 / Auth Key 를 Firebase 콘솔에 업로드 (Project Settings → Cloud Messaging).

---

## 4. Flutter 측 구현

`lib/kits/notifications_kit/` 에 `fcm_notification_service.dart` 작성 (예시 골격):

```dart
class FcmNotificationService implements NotificationService {
  Future<String?> getToken() async {
    await Firebase.initializeApp();
    return FirebaseMessaging.instance.getToken();
  }

  Stream<RemoteMessage> get foregroundMessages =>
      FirebaseMessaging.onMessage;
}
```

`lib/common/providers.dart` 에서 override:

```dart
ProviderContainer(
  overrides: [
    notificationServiceProvider.overrideWithValue(FcmNotificationService()),
    // ...
  ],
);
```

---

## 5. 백엔드에 토큰 등록

로그인 직후 또는 토큰 갱신 시:

```dart
final token = await ref.read(notificationServiceProvider).getToken();
if (token != null) {
  await ref.read(deviceRegistrationProvider).register(
    pushToken: token,
    deviceName: 'iPhone 15 Pro',
  );
}
```

`DeviceRegistration` 은 `POST /api/apps/{appSlug}/devices` 호출 (template-spring `core/core-device` 모듈이 처리).

---

## 6. 동작 확인

### 6-1. Foreground 수신

Firebase 콘솔 → **Cloud Messaging → New campaign** → device token 직접 입력 → 전송 → 앱 화면 가시 상태에서 알림 콜백 수신.

### 6-2. Background / Killed

앱 background → 콘솔에서 다시 전송 → 시스템 알림창에 표시 → 탭 시 앱 열림.

---

## 7. 트러블슈팅

| 증상 | 원인 | 해결 |
|---|---|---|
| Android 에서 토큰 null | `google-services.json` 누락 / 잘못 배치 | `android/app/google-services.json` 위치 확인 |
| iOS 에서 토큰 null | APNs 인증서 미업로드 / capability 미활성 | Firebase 콘솔 + Xcode capability 둘 다 확인 |
| Background 안 옴 | iOS Background Modes 미활성 | Runner → Signing & Capabilities → Background Modes → Remote notifications |
| 토큰은 받는데 백엔드에 등록 실패 | `DeviceRegistration` 호출 위치 누락 / appSlug 불일치 | 로그인 직후 호출 + `AppConfig.instance.appSlug` 가 백엔드 등록된 앱과 일치하는지 확인 |

---

## 8. 파생 레포 체크리스트

- [ ] Firebase 프로젝트 생성 + Android/iOS 앱 등록
- [ ] `google-services.json` / `GoogleService-Info.plist` 배치 (or GHA Secrets 경유)
- [ ] `firebase_core` + `firebase_messaging` pubspec 추가
- [ ] Android Gradle plugin 등록 + iOS capability 활성화
- [ ] `FcmNotificationService` (또는 동등) 구현 + provider override
- [ ] 로그인 흐름에서 `DeviceRegistration.register(pushToken: ...)` 호출
- [ ] foreground / background 푸시 1건씩 수신 검증

---

## 9. Code References

- [`lib/kits/notifications_kit/notification_service.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/notifications_kit/notification_service.dart) — 인터페이스
- [`lib/kits/backend_api_kit/device_registration.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/backend_api_kit/device_registration.dart) — 토큰 백엔드 등록
- [`lib/common/providers.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/common/providers.dart) — `notificationServiceProvider`, `deviceRegistrationProvider`
