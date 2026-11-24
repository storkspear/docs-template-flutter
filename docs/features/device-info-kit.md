<a id="device_info_kit"></a>

# device_info_kit

`DeviceInfoService`로 앱 버전, 운영체제와 기기 식별 정보를 조회해요. 내부에서 `device_info_plus`와 `package_info_plus`를 사용해요. 반환값은 플랫폼이 제공하는 값이므로 기기 모델을 제품 판매명으로 단정하지 않아요.

---

## 개요

앱 버전·빌드 번호·패키지 이름과 운영체제·기기 모델을 조회해요. 주로 진단 정보나 기기 등록에 사용할 수 있지만 자동으로 외부에 전송하지는 않아요. 고유 광고 식별자는 이 DTO 에 포함하지 않아요.

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
print('디바이스 모델: ${info.deviceModel}'); // iOS: utsname.machine 식별자 / Android: 제조사 + 모델
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
- [ ] 조회한 기기 정보를 서버나 분석 도구로 보낸다면 실제 수집·이용 항목을 개인정보 안내와 대조해요. 고유 ID 를 추가하는 경우에만 검토가 필요한 것은 아니에요.

---

## Code References

- [`lib/kits/device_info_kit/device_info_kit.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/device_info_kit/device_info_kit.dart)
- [`lib/kits/device_info_kit/device_info_service.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/device_info_kit/device_info_service.dart)
