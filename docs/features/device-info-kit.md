# device_info_kit

앱 버전과 기기 정보를 한 번에 조회하는 kit 이에요. `device_info_plus` 와 `package_info_plus` 를 래핑해서 두 패키지를 따로 다룰 필요가 없어요.

---

## 개요

앱 쪽에선 버전 · 빌드 넘버 · 패키지 이름을, 기기 쪽에선 OS · 모델을 제공해요. 고유 식별자는 의도적으로 수집하지 않아요. 주 용도는 diagnostic 이에요 — 크래시 리포트에 첨부하거나 푸시 토큰을 등록할 때 써요.

---

## 활성화

```yaml
# app_kits.yaml
kits:
  device_info_kit: {}
```

```dart
// lib/main.dart
await AppKits.install([
  DeviceInfoKit(),
]);
```

---

## 제공 기능

| 항목 | 설명 |
|------|------|
| `DeviceInfoKit` | `AppKit` 구현 |
| `DeviceInfoService` | `Future<AppAndDeviceInfo> load()` (단일 메서드) |
| `AppAndDeviceInfo` (DTO) | 앱·기기 통합 정보 (appVersion / buildNumber / packageName / appName / platform / osVersion / deviceModel) |
| `PlatformDeviceInfoService` | 기본 구현 (device_info_plus + package_info_plus) |

---

## 사용 예

```dart
final info = await ref.read(deviceInfoServiceProvider).load();
print('앱 버전: ${info.appVersion}');     // "1.2.3"
print('빌드 번호: ${info.buildNumber}');   // "45"
print('패키지: ${info.packageName}');     // "com.example.app"
print('앱 이름: ${info.appName}');         // "MyApp"
print('플랫폼: ${info.platform}');         // "ios" / "android"
print('OS 버전: ${info.osVersion}');       // "17.4" / "14 API 34"
print('디바이스 모델: ${info.deviceModel}'); // "iPhone 15 Pro" / "Pixel 8"
```

> `AppAndDeviceInfo` 는 고유 식별자(IDFA/Android ID) 를 의도적으로 노출하지 않아요. 광고 식별자는 `ads_kit` 의 ATT 동의 흐름과 함께 처리해요.

### 크래시 리포트 첨부

```dart
final info = await ref.read(deviceInfoServiceProvider).load();
await ref.read(crashServiceProvider).addBreadcrumb(
  'Device info',
  data: {
    'appVersion': info.appVersion,
    'platform': info.platform,
    'osVersion': info.osVersion,
    'deviceModel': info.deviceModel,
  },
);
```

---

## 파생 레포 체크리스트

- [ ] iOS: `Info.plist` 의 `CFBundleShortVersionString` · `CFBundleVersion`
- [ ] Android: `android/app/build.gradle.kts` 의 `versionName` · `versionCode`
- [ ] (파생 레포에서 광고 식별자 등 고유 ID 를 **추가 수집하는 경우에만**) 개인정보 정책에 수집 항목 명시 — 이 kit 자체는 고유 식별자를 수집하지 않아요

---

## Code References

- [`lib/kits/device_info_kit/device_info_kit.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/device_info_kit/device_info_kit.dart)
- [`lib/kits/device_info_kit/device_info_service.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/device_info_kit/device_info_service.dart)
