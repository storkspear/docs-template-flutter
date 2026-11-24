<a id="update_kit"></a>

# update_kit

업데이트 정보를 조회해 필수 업데이트와 권장 업데이트를 구분해요. 현재 구현은 `app.dart`의 다이얼로그 게이트로 화면 위에 안내를 표시해요. `redirectPriority: 1`은 선언되어 있지만 `buildRedirect`가 없어 라우팅 규칙에는 참여하지 않아요. 업데이트 정보 제공 방식은 `AppUpdateService` 구현으로 바꿀 수 있어요.

---

## 개요

부팅 단계가 UpdateInfo 를 반환하면 `forceUpdateInfoNotifier` 가 값을 전달하고, `app.dart` 의 `_ForceUpdateGate` 가 화면 위에 다이얼로그를 표시해요. 별도 redirect 경로는 없어요.

- `isForce: true` 면 바깥 탭과 뒤로가기로 닫을 수 없는 ForceUpdateDialog 를 표시해요.
- `isForce: false` 면 닫을 수 있는 UpdateAvailableDialog 를 표시해요.
- 두 화면은 스토어 이동 버튼을 제공하고, 경고 화면은 X 와 ‘나중에’ 버튼도 제공해요. 스토어 URL 은 url_launcher 로 열어요.

기본 main.dart 는 BackendAppUpdateService 에 `GET /app-version` 조회 함수를 연결해요. 응답의 `enabled` 가 bool true 인 경우에만 다음 순서로 판정해요.

1. 현재 버전이 유효한 `forceMinVersion` 이하이면 강제 업데이트를 표시해요.
2. 강제 조건에 해당하지 않고 유효한 `warnMinVersion` 이하이면 권장 업데이트를 표시해요.
3. 나머지는 null 을 반환해 게이트를 표시하지 않아요.

조회 실패·빈 응답·enabled 누락 또는 잘못된 타입에서는 앱을 막지 않아요. 각 임계값은 파싱할 수 없으면 해당 조건만 제외하고, 현재 버전을 파싱할 수 없으면 두 조건 모두 적용하지 않아요. 비교는 숫자 버전의 앞 세 요소를 사용하며 prerelease·build suffix 를 제외하므로 완전한 SemVer 우선순위 비교와는 달라요.

사용 중 API 에서 426/CMN_010 을 받으면 `ApiClient.onUpgradeRequired` 연결이 강제 업데이트 정보로 전달해요. 이 연결과 조회 함수는 main.dart 에서 조립하며 UpdateKit 자체의 필수 의존성은 아니에요. BackendApiKit 이 없는 앱은 NoUpdateAppUpdateService 로 교체하고 해당 API 연결도 제거해요.

---

## 활성화

```yaml
# app_kits.yaml
kits:
  update_kit: {}
```

<a id="템플릿-기본값-backend_api_kit-활성-시"></a>

### 템플릿 기본값 (backend_api_kit 활성 시)

파생 레포를 그대로 시작하면 `main.dart`에 아래 조립이 이미 들어 있어요.

```dart
// lib/main.dart (템플릿 기본 — backend_api_kit 필요)
import 'package:app_template/kits/backend_api_kit/backend_api_kit.dart';
import 'package:app_template/kits/backend_api_kit/upgrade_required.dart';
import 'package:app_template/kits/update_kit/backend_app_update_service.dart';
import 'package:app_template/kits/update_kit/update_kit.dart';

// 426(CMN_010) 세션 중 안전망 → forceUpdateInfoNotifier 연결
ApiClient.onUpgradeRequired = (ForceUpgradeInfo info) {
  forceUpdateInfoNotifier.value = UpdateInfo(
    isForce: true,
    minVersion: info.minVersion,
    latestVersion: info.minVersion,
    message: info.message,
    iosStoreUrl: info.storeUrl,
    androidStoreUrl: info.storeUrl,
  );
};

await AppKits.install([
  BackendApiKit(),
  // ...
  UpdateKit(service: BackendAppUpdateService(() async { /* GET /app-version */ })),
]);
```

<a id="backend_api_kit-이-없는-앱-예-local-notifier-app-recipe"></a>

### backend_api_kit 이 없는 앱 (예: `local-notifier-app` recipe)

백엔드를 쓰지 않는 앱은 `UpdateKit(service: NoUpdateAppUpdateService())`로 조립하고 `ApiClient.onUpgradeRequired` 연결도 제거해요. 관련 import와 의존 패키지는 사용 여부를 확인한 뒤 정리해요. YAML이나 설치 목록에서 `BackendApiKit`만 뺐다고 Dart 타입이 곧바로 사라지는 것은 아니에요.

```dart
// lib/main.dart — backend 없는 앱
import 'package:app_template/kits/update_kit/update_kit.dart'; // NoUpdateAppUpdateService 포함(barrel export)

await AppKits.install([
  UpdateKit(service: NoUpdateAppUpdateService()),
  // 또는: UpdateKit(service: RemoteConfigUpdateService()),
]);
```

---

## 제공 기능

| 항목 | 설명 |
|------|------|
| `UpdateKit` | `AppKit` 구현. `redirectPriority: 1` |
| `AppUpdateService` | 추상. `init()` · `check()` → `UpdateInfo?` (null 이면 업데이트 불필요) |
| `UpdateInfo` | `isForce` · `minVersion` · `latestVersion` · `message?` · `iosStoreUrl?` · `androidStoreUrl?` |
| `NoUpdateAppUpdateService` | `appUpdateServiceProvider`의 fallback 더미. `check()` 가 항상 null (업데이트 없음). backend_api_kit 없는 앱에서 실사용 |
| `BackendAppUpdateService` | 기본 앱이 조회 함수를 주입하는 구현체예요. enabled 와 두 임계값을 위 개요의 순서로 판정해요. Kit 자체가 ApiClient 에 직접 의존하지는 않아요 |
| `ForceUpdateDialog` | 강제(`isForce:true`) 다이얼로그 — `_ForceUpdateGate` 오버레이로 표시. 닫기 차단은 게이트가 담당해요(스크림 `ModalBarrier(dismissible:false)` + `BackButtonListener` 소비). 스토어 링크가 없거나 열기에 실패하면 안내 문구를 띄우고 CTA 를 비활성화해요 |
| `UpdateAvailableDialog` | 경고(`isForce:false`) 다이얼로그 (X · "나중에" · 바깥 탭 · 뒤로가기로 닫기 가능) — `_ForceUpdateGate` 오버레이로 표시 |
| `forceUpdateInfoNotifier` | `ValueNotifier<UpdateInfo?>` — BootStep 이 `isForce` 무관하게 값 방출, `_ForceUpdateGate` 가 구독해 분기 |

---

## 파생 레포에서 실제 구현

### Firebase Remote Config 연계 예

```dart
class RemoteConfigUpdateService implements AppUpdateService {
  @override
  Future<void> init() async {
    await FirebaseRemoteConfig.instance.fetchAndActivate();
  }

  @override
  Future<UpdateInfo?> check() async {
    final remoteConfig = FirebaseRemoteConfig.instance;
    final minVersion = remoteConfig.getString('min_app_version');
    final latestVersion = remoteConfig.getString('latest_app_version');
    final currentVersion = AppConfig.instance.appVersion;
    if (!_isOlderThan(currentVersion, minVersion)) return null;
    return UpdateInfo(
      isForce: true,
      minVersion: minVersion,
      latestVersion: latestVersion,
      iosStoreUrl: 'https://apps.apple.com/app/id1234567890',
      androidStoreUrl: 'https://play.google.com/store/apps/details?id=com.example.app',
    );
  }
}
```

### 자체 API 기반

> 템플릿은 이미 `lib/kits/update_kit/backend_app_update_service.dart`에 raw `Map` 기반 `BackendAppUpdateService`를 기본 제공해요(위 "템플릿 기본값" 참고). 아래는 타입 있는 응답(`MinVersion.fromJson`)으로 더 다듬고 싶을 때의 대안 패턴이에요.

```dart
class BackendUpdateService implements AppUpdateService {
  final ApiClient _api;
  BackendUpdateService(this._api);

  @override
  Future<void> init() async {}

  @override
  Future<UpdateInfo?> check() async {
    final res = await _api.get<MinVersion>('/config/min-version', fromData: MinVersion.fromJson);
    final info = res.data!;
    if (!_isOlderThan(AppConfig.instance.appVersion, info.minVersion)) return null;
    return UpdateInfo(
      isForce: info.isForce,
      minVersion: info.minVersion,
      latestVersion: info.latestVersion,
      message: info.message,
      iosStoreUrl: info.iosStoreUrl,
      androidStoreUrl: info.androidStoreUrl,
    );
  }
}
```

---

## 파생 레포 체크리스트

- [ ] `backend_api_kit`을 켜는 recipe인지 먼저 확인 — 켜면 템플릿 기본(`BackendAppUpdateService`)을 그대로 쓰고, 안 켜면 `NoUpdateAppUpdateService()` + 글루 삭제(위 "backend_api_kit 이 없는 앱" 참고)
- [ ] 스토어 URL 확인 (App Store · Play Store 각각) — `/app-version` 응답의 `storeUrl` 또는 자체 구현체 안
- [ ] `BackendAppUpdateService.isAtOrBelow` 의 숫자 비교와 suffix 제외 규칙이 앱의 버전 정책에 맞는지 확인해요.
- [ ] (선택) Firebase Remote Config 설정 or 서버 `/app-version` 엔드포인트 실배포 확인
- [ ] `main.dart` 의 `UpdateKit(service: ...)` 가 recipe 성격과 맞는지 확인 (백엔드 유무에 따라 교체)
- [ ] 테스트: `check()` 가 `UpdateInfo(isForce: true, ...)` 반환 시 `ForceUpdateDialog`(닫기 불가), `isForce: false` 반환 시 `UpdateAvailableDialog`(닫기 가능) 오버레이가 화면을 덮는지 확인

---

## Code References

- [`lib/kits/update_kit/update_kit.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/update_kit/update_kit.dart)
- [`lib/kits/update_kit/app_update_service.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/update_kit/app_update_service.dart)
- [`lib/kits/update_kit/backend_app_update_service.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/update_kit/backend_app_update_service.dart)
- [`lib/kits/update_kit/force_update_dialog.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/update_kit/force_update_dialog.dart)
- [`lib/kits/update_kit/update_available_dialog.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/update_kit/update_available_dialog.dart)
- [`lib/kits/backend_api_kit/upgrade_required.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/backend_api_kit/upgrade_required.dart) — `ApiClient.onUpgradeRequired` 글루 계약(`ForceUpgradeInfo`)

---

## 관련 문서

- [`ADR-018 · 라우팅 우선순위`](../philosophy/adr-018-redirect-priority.md)
- [`ADR-006 · Debug 폴백`](../philosophy/adr-006-debug-fallback.md)
- [`api-contract/error-codes.md`](../api-contract/error-codes.md) — `CMN_010`(426, `ErrorCode.upgradeRequired`) 계약
