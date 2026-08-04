# ads_kit

AdMob 배너 광고를 붙이고, UMP 동의 폼과 ATT 요청 (iOS 14+) 까지 함께 처리해 주는 kit 이에요. 광고 자체보다 까다로운 게 동의 절차인데, 활성화만 하면 그 UX 가 부트 단계에서 자동으로 흘러가요.

---

## 개요

배너 배치는 `BannerAdWidget` 한 줄로 끝나요. GDPR 적용 지역에서는 UMP (User Messaging Platform) 동의 폼을, iOS 14+ 에서는 ATT (App Tracking Transparency) 시스템 다이얼로그를 kit 이 BootStep 으로 알아서 띄워 줘요. 개발 중엔 `AdConfig.testIds` 를 명시적으로 전달하고 (`config` 는 필수 인자예요), 출시 전엔 반드시 실제 AdMob ID 로 교체해야 해요.

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
- [ ] 광고 단위 생성 (배너 · 전면 · 리워드)
- [ ] Unit ID 복사 → `AdsKit(config: AdConfig(androidBannerUnitId: ..., iosBannerUnitId: ...))`
- [ ] `android/app/src/main/AndroidManifest.xml` 의 `com.google.android.gms.ads.APPLICATION_ID` meta-data 업데이트
- [ ] `ios/Runner/Info.plist` 의 `GADApplicationIdentifier` 업데이트
- [ ] `NSUserTrackingUsageDescription` 문구 앱 성격에 맞게 다듬기
- [ ] UMP: [Google 문서](https://developers.google.com/admob/flutter/privacy) 에 따라 privacy policy URL 등록
- [ ] 테스트: 실제 기기 (에뮬레이터 아님) 에서 광고 로딩 확인

---

## Code References

- [`lib/kits/ads_kit/ads_kit.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/ads_kit/ads_kit.dart) — AppKit 구현 + 3개 BootStep
- [`lib/kits/ads_kit/ad_config.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/ads_kit/ad_config.dart) — `AdConfig` + `.testIds` 상수
- [`lib/kits/ads_kit/banner_ad_widget.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/ads_kit/banner_ad_widget.dart)
- [`lib/kits/ads_kit/ump_consent_step.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/ads_kit/ump_consent_step.dart)
- [`lib/kits/ads_kit/att_permission_step.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/ads_kit/att_permission_step.dart)
