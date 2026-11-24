<a id="permissions_kit"></a>

# permissions_kit

`PermissionHelper`로 런타임 권한을 확인하고 요청해요. 영구 거부 상태에서는 설정 화면으로 이동할 수 있는 안내를 제공해요. Kit를 설치하는 것만으로 권한을 요청하지는 않으며, 필요한 화면에서 헬퍼를 호출하고 플랫폼 권한 선언도 갖춰야 해요.

---

## 개요

permission_handler 로 한 권한의 상태를 확인해요. 이미 허용되어 있으면 true 를 반환하고, 거부 상태면 요청을 시도해요. 영구 거부이며 안내 옵션이 켜져 있으면 설정 화면 이동 여부를 물어요. 여러 권한의 요청 순서는 호출하는 화면에서 정해야 해요.

---

## 활성화

```yaml
# app_kits.yaml
kits:
  permissions_kit: {}
```

```dart
// lib/main.dart
await AppKits.install([
  PermissionsKit(),
]);
```

---

## 제공 기능

| 항목 | 설명 |
|------|------|
| `PermissionsKit` | `AppKit` 구현 (Provider 노출 없음) |
| `PermissionHelper` | **static** `ensure(BuildContext, Permission, {showOpenSettingsPrompt, openSettingsTitle, openSettingsMessage}) → Future<bool>` — 권한 요청 + 영구 거부 시 설정 앱 유도 다이얼로그 (`AppDialog.confirm` + `openAppSettings`) |

---

## 사용 예

```dart
// 카메라 권한 요청 (한 줄로 거부·영구거부·설정유도까지 처리)
final granted = await PermissionHelper.ensure(context, Permission.camera);
if (granted) {
  // 카메라 기능 진행
}

// 여러 권한은 순차 호출
final cam = await PermissionHelper.ensure(context, Permission.camera);
if (!cam) return;
final mic = await PermissionHelper.ensure(context, Permission.microphone);
if (!mic) return;
final loc = await PermissionHelper.ensure(context, Permission.location);
```

> static 메서드라 Provider 를 통한 주입이 필요 없어요. 영구 거부 다이얼로그를 끄고 싶으면 `showOpenSettingsPrompt: false` 를 넘겨요.

---

## 파생 레포 체크리스트

- [ ] iOS: `Info.plist` 에 `NSCameraUsageDescription` · `NSLocationWhenInUseUsageDescription` 등 필요 문구 추가
- [ ] Android: `AndroidManifest.xml` 에 `<uses-permission>` 선언
- [ ] 앱 정책: 왜 이 권한이 필요한지 사용자에게 먼저 설명 (pre-prompt 화면)
- [ ] 거부 시 UX 고려 — "나중에" 선택지 제공

---

## Code References

- [`lib/kits/permissions_kit/permissions_kit.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/permissions_kit/permissions_kit.dart)
- [`lib/kits/permissions_kit/permission_helper.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/permissions_kit/permission_helper.dart)
