# update_kit

**강제(hard)/경고(soft) 업데이트 감지 2단계**. Firebase Remote Config · 자체 API 와 연계 가능. `redirectPriority: 1` (최우선).

---

## 개요

- **오버레이 게이트**: 부팅 시 `check()` 결과가 null이 아니면 `forceUpdateInfoNotifier` 방출 → `MaterialApp.builder` 의 `_ForceUpdateGate` (`lib/app.dart`) 가 전체 화면 위에 덮어씌워요(별도 라우트 없음). `info.isForce`로 분기: `true` → 닫기 불가 `ForceUpdateDialog`, `false` → 닫을 수 있는 `UpdateAvailableDialog`(경고)
- **서비스 교체 가능**: **템플릿 기본 `main.dart`는 `BackendAppUpdateService`를 써요** — 스플래시에서 `GET /app-version`으로 게이트 마스터 스위치 `enabled`(bool)와 2단계 임계값 `forceMinVersion`/`warnMinVersion`(둘 다 nullable)을 조회해요. `enabled` 가 true 가 아니면(누락·malformed 포함) 임계값이 있어도 게이트 없음(null). enabled 일 때 클라가 **이하(≤)** 로 tier 를 계산해요 — 현재 버전 ≤ `forceMinVersion`(설정 시) → 강제(`isForce:true`), `forceMinVersion` < 현재 버전 ≤ `warnMinVersion`(설정 시) → 경고(`isForce:false`), 그 외 → 게이트 없음(`isAtOrBelow` 로 semver 비교). 불확실한 상황은 전부 **fail-open**이에요 — 조회 실패·응답 null·`enabled` 누락·임계값 malformed 는 물론, **현재 앱 버전 문자열이 파싱되지 않을 때도 게이트를 걸지 않아요**(잘못 걸면 전 사용자가 강제 업데이트로 잠기니까요). 세션 도중엔 `ApiClient.onUpgradeRequired`(426/`CMN_010`) 콜백이 항상 강제 다이얼로그로 안전망을 걸어요(서버는 426을 forceMin 미달에만 내려요). 이 기본 조립은 `backend_api_kit`이 필요해요. backend_api_kit 없는 recipe(`local-notifier-app` 등)는 `NoUpdateAppUpdateService`(`check()` 가 항상 null)로 되돌려야 해요 — 아래 "활성화" 참고
- **Dialog**: 두 다이얼로그 모두 사용자에게 "업데이트" 버튼 제공(스토어 이동). 경고 다이얼로그는 추가로 X/"나중에" 닫기 버튼 제공
- **`url_launcher`**: 스토어 URL 오픈
- **kit 자체는 backend_api_kit 을 몰라요**: `kit_manifest.yaml`의 `requires: []`는 정확해요. 위 결합은 kit 소스가 아니라 `main.dart`가 두 kit을 엮는 조립 지점에만 있어요.

---

## 활성화

```yaml
# app_kits.yaml
kits:
  update_kit: {}
```

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

### backend_api_kit 이 없는 앱 (예: `local-notifier-app` recipe)

`backend_api_kit`을 켜지 않는 recipe는 위 기본 조립을 그대로 두면 `ApiClient`/`ForceUpgradeInfo`를 찾을 수 없어 컴파일이 깨져요. `NoUpdateAppUpdateService()`로 되돌리고 글루 블록 + 관련 import 2개(`backend_api_kit.dart`, `upgrade_required.dart`)를 지워야 해요.

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
| `BackendAppUpdateService` | **템플릿 기본 `main.dart`가 실제로 설치하는 구현체**. 스플래시에서 `GET /app-version` 조회 + `isAtOrBelow`(이하 ≤)로 semver 비교. 응답의 `enabled`(bool — 누락·비-bool 이면 false = 게이트 없음)가 마스터 스위치이고, `forceMinVersion`/`warnMinVersion`(2단계, 둘 다 nullable, is-String 가드로 파싱)으로 클라가 tier 계산(누락/malformed 는 안전하게 해당 tier 미판정 → 결국 null). `backend_api_kit` 필요 |
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
- [ ] 버전 비교 로직 확인 (semver 비교, `BackendAppUpdateService.isAtOrBelow` 또는 자체 구현)
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
