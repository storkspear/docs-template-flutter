<a id="ads_kit"></a>

# ads_kit

AdMob 배너 광고와 광고 동의 절차를 제공해요. Kit의 부팅 단계에서 iOS ATT 요청과 UMP 동의 상태를 처리하고 광고 SDK를 초기화해요. 다이얼로그가 실제로 표시되는지는 플랫폼, 기존 권한과 동의 상태에 따라 달라요. 플랫폼 키와 광고 ID는 파생 앱에서 설정해야 해요.

---

## 개요

`BannerAdWidget` 으로 배너를 배치해요. BootStep 이 ATT 요청과 UMP 동의 상태를 처리하지만, 실제 화면 표시는 플랫폼·기존 권한·동의 상태에 따라 달라요. 개발·테스트에서는 필수 인자인 `config` 에 `AdConfig.testIds` 를 전달하고, 출시할 때 실제 광고 ID 와 플랫폼 설정을 확인해요.

---

## 활성화

```yaml
# app_kits.yaml
kits:
  ads_kit: {}
```

```dart
// lib/main.dart
await AppKits.install([
  AdsKit(
    config: AdConfig(
      androidBannerUnitId: 'ca-app-pub-XXXX/YYYY',
      iosBannerUnitId: 'ca-app-pub-XXXX/ZZZZ',
    ),
    // 또는 개발용: AdsKit(config: AdConfig.testIds)
  ),
]);
```

`config` 는 **필수 인자** 예요 — 기본값이 없어요. 개발 · 테스트 중엔 `AdConfig.testIds` (Google 테스트 ID) 를 명시적으로 전달하고, 출시 빌드엔 반드시 실제 ID 로 교체해요.

---

## 제공 기능

| 항목 | 설명 |
|------|------|
| `AdsKit` | `AppKit` 구현. UMP · ATT BootStep 기여 |
| `BannerAdWidget` | 배너 광고 위젯 |
| `UmpConsentStep` | GDPR 동의 폼 (BootStep) |
| `AttPermissionStep` | iOS ATT 요청 (BootStep) |
| `AdConfig` | Unit ID · 테스트 모드 설정 |

---

## 사용 예

```dart
// 화면 하단에 배너
Scaffold(
  body: ListView(...),
  bottomNavigationBar: BannerAdWidget(),  // ← 한 줄로 끝
)
```

---

## 파생 레포 체크리스트

- [ ] [AdMob Console](https://apps.admob.com/) 앱 등록
- [ ] 제공된 BannerAdWidget 에 사용할 배너 광고 단위를 생성해요. 전면·리워드 광고는 별도 구현이 필요해요.
- [ ] Unit ID 복사 → `AdsKit(config: AdConfig(androidBannerUnitId: ..., iosBannerUnitId: ...))`
- [ ] `android/app/src/main/AndroidManifest.xml` 의 `com.google.android.gms.ads.APPLICATION_ID` meta-data 업데이트 (기본값은 Google 테스트 ID 예요)
- [ ] Manifest 에서 사용 기능에 필요한 광고 권한의 `tools:node="remove"` 설정을 검토해요. `AD_ID` 와 `ACCESS_ADSERVICES_*` 는 광고 설정에 맞춰 결정하고, `RECEIVE_BOOT_COMPLETED` 는 재부팅 후 작업·알림 복원 요구와 구분해 확인해요.
- [ ] Play Console 데이터 보안 양식에 광고 ID(`AD_ID`) 수집 선언
- [ ] `ios/Runner/Info.plist` 의 `GADApplicationIdentifier` 업데이트 (기본값은 Google 테스트 ID 예요)
- [ ] `ios/Runner/Info.plist` 에 `NSUserTrackingUsageDescription` · `SKAdNetworkItems` 추가 (템플릿엔 없어요 — kit 활성 시 넣어요)
- [ ] UMP: [Google 문서](https://developers.google.com/admob/flutter/privacy) 에 따라 privacy policy URL 등록
- [ ] 테스트: 실제 기기 (에뮬레이터 아님) 에서 광고 로딩 확인

---

## Code References

- [`lib/kits/ads_kit/ads_kit.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/ads_kit/ads_kit.dart) — AppKit 구현 + 3개 BootStep
- [`lib/kits/ads_kit/ad_config.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/ads_kit/ad_config.dart) — `AdConfig` + `.testIds` 상수
- [`lib/kits/ads_kit/banner_ad_widget.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/ads_kit/banner_ad_widget.dart)
- [`lib/kits/ads_kit/ump_consent_step.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/ads_kit/ump_consent_step.dart)
- [`lib/kits/ads_kit/att_permission_step.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/ads_kit/att_permission_step.dart)
