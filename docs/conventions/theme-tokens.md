# Theme Tokens 컨벤션

색상·간격·타이포그래피는 기존 디자인 토큰을 먼저 사용해요. 테마의 색과 글꼴을 한곳에서 조립하면 팔레트나 타이페이스를 바꿨을 때 화면에도 일관되게 반영할 수 있어요. 이 문서는 토큰을 읽는 방법과 파생 앱에서 브랜드 색상·폰트를 교체하는 절차를 다뤄요.

---

## 결론부터

| 토큰 | 게터 | 다크 자동 적응 |
|---|---|---|
| Material 3 톤 (primary · secondary · error · outline · surface*) | `Theme.of(context).colorScheme.*` | 예 |
| 시맨틱 (success · warning · info · error 배경) | `AppPaletteRegistry.current.*` | 아니오 — 단일 색 |
| 브랜드 시드 / accent | `AppPaletteRegistry.current.seed` / `.accent` | 아니오 |
| 간격 · 라운딩 · 컴포넌트 크기 | `AppSpacing.*` | 해당 없음 |
| 타이포 | `Theme.of(context).textTheme.*` | 자동 |
| 아이콘 | `AppIcons.*` | 해당 없음 |

기본 규칙은 이래요 — **다크 자동 적응이 필요하면 `Theme.of(context)`** 를, 브랜드가 결정하는 색이면 `AppPaletteRegistry.current` 를 써요.

---

## 분기 규칙

### `Theme.of(context).colorScheme.*` 를 써요

Material 3 의 `ColorScheme.fromSeed` 가 시드 한 개에서 라이트 / 다크 두 개 톤 세트를 자동 생성하기 때문이에요. 시스템 모드를 따라 `Theme.of` 가 알맞은 쪽을 돌려줘요.

- **에러 색 톤**: `colorScheme.error` (다크에선 부드러운 빨강, 라이트에선 진한 빨강 — 자동)
- **버튼 / 강조 면**: `colorScheme.primary` , `colorScheme.onPrimary`
- **카드 / 섹션 배경**: `colorScheme.surface` , `colorScheme.surfaceContainer*`
- **구분선 / 비활성 텍스트**: `colorScheme.outline` , `colorScheme.onSurfaceVariant`

### `AppPaletteRegistry.current.*` 를 써요

ColorScheme 외부의 색상을 **브랜드가 결정** 하는 경우에 한정해요.

- **success / warning / info / error (배경 사용 한정)**: 알림 / 토스트 / 배지의 강한 색이에요.
- **seed 직접**: 차트 라인 색, 네비 활성 표시 등 **브랜드 톤 그대로** 노출하려는 경우예요.
- **accent / textMuted / border**: 디자인 시스템 외 보조 톤이에요.

> 시맨틱 색상은 다크 변형이 없으므로 배경에 사용해요. 현재 `AppSnackBar`는 그 위에 흰색 텍스트와 아이콘을 올려요. 파생 앱에서 팔레트를 바꾸면 실제 조합의 대비를 확인해야 해요. 텍스트·아이콘에 다크 모드 대응이 필요하면 `colorScheme.error` 같은 Material 색상을 먼저 사용해요.

---

## 그라운드 사례 (현 코드 인용)

```dart
// lib/core/widgets/app_dialog.dart 발췌
backgroundColor: Theme.of(context).colorScheme.error,  // M3 톤 — 라이트/다크 자동
```

```dart
// lib/core/widgets/error_view.dart 발췌
Icon(AppIcons.error, size: AppSpacing.iconSizeXl, color: theme.colorScheme.error),
```

```dart
// lib/core/widgets/app_snackbar.dart 발췌
final p = AppPaletteRegistry.current;  // semantic 배경 — 브랜드 결정
return switch (type) {
  SnackBarType.success => (LucideIcons.circleCheck, p.success),
  SnackBarType.warning => (LucideIcons.triangleAlert, p.warning),
  SnackBarType.error   => (LucideIcons.circleX,      p.error),
  SnackBarType.info    => (LucideIcons.info,         p.info),
};
```

```dart
// lib/kits/charts_kit/app_line_chart.dart 발췌
final color = lineColor ?? AppPaletteRegistry.current.seed;  // 브랜드 시드 직접
```

---

## 새 위젯 체크리스트

새 `app_*.dart` 또는 kit UI 위젯을 만들 때:

- [ ] 색상 출처를 위 표대로 분기.
- [ ] 간격은 `AppSpacing.xs/sm/md/lg/xl/xxl` 토큰만. 매직 넘버 (e.g. `padding: 17`) 금지.
- [ ] 라운딩은 `AppSpacing.borderRadiusSm/Md/Lg` .
- [ ] 타이포는 `Theme.of(context).textTheme.*` . `TextStyle(fontSize: 14, ...)` 직접 작성 금지.
- [ ] 아이콘은 `AppIcons.*` 참조 (Lucide 어댑터). raw `Icons.*` 금지.
- [ ] 다크모드 분기를 직접 `Theme.of(context).brightness` 로 하기 전에, `Theme.of(context)` 게터가 자동 적응해주는 색이 있는지 먼저 확인.
- [ ] 컴포넌트 크기는 `AppSpacing.buttonHeight`, `iconSize*`, `avatarSize*` 등의 `double` 토큰을 사용해요. `screenPadding`은 `EdgeInsets`, `borderRadius*`는 `BorderRadius` 값이에요.

<a id="예외--외부-브랜드-가이드라인-색"></a>

### 예외 — 외부 브랜드 가이드라인 색

Google·Apple·Kakao·Naver 같은 외부 로그인 제공자의 버튼에는 브랜드별 색상을 직접 사용할 수 있어요. 현재 구현은 `lib/kits/auth_kit/ui/login/social_login_button.dart`에서 관리해요. 파생 앱에서 버튼을 바꿀 때는 해당 제공자의 최신 브랜드 지침을 확인하고, 앱 팔레트 변경으로 로고·버튼 색이 함께 바뀌지 않게 해요.

---

## 흔한 실수

**(1) `colorScheme.error` 와 `palette.error` 혼용**  
같은 빨강이지만 출처가 달라요. M3 톤이 자동 적응하므로 **텍스트 / 아이콘 색** 은 `colorScheme.error` 를, **알림 배경** 은 `palette.error` 를 써요.

**(2) `Theme.of(context).primaryColor` 사용**  
이 프로젝트의 Material 3 테마에서는 `colorScheme.primary`를 사용해요.

**(3) 카드 배경에 `cardBackground` 직접 참조**  
`AppPalette.cardBackground` / `cardBackgroundDark` 는 **파생 레포 확장점** 으로만 살려두는 게터예요 (ADR-015 참조). 템플릿 위젯은 `colorScheme.surface*` 계열을 써요.

**(4) `AppPaletteRegistry.current` 캐싱**  
한 위젯에서 여러 번 쓸 땐 빌드 메서드 시작에서 한 번 받아 변수에 담아요. 단, 다른 빌드 사이클로 캐싱하면 팔레트 교체 시 stale 해져요.

```dart
@override
Widget build(BuildContext context) {
  final palette = AppPaletteRegistry.current;  // 빌드 1회
  // ... palette.seed, palette.success 등 반복 사용
}
```

---

## 새 토큰을 추가할 때

`AppSpacing` / `AppPalette` 에 새 토큰을 추가하려면:

1. **이름이 일관**: `AppSpacing.xs/sm/md/lg/xl/xxl` 같은 스케일을 깨지 마세요.
2. **다크 변형 필요**: 변형이 다르면 게터 두 개 (`xxxLight` / `xxxDark`) 또는 `Theme.of(context).brightness` 로 분기해요.
3. **palette 게터 추가는 신중**: 시맨틱이 명확하지 않으면 위젯 인자로 외부 주입하는 쪽이 나아요.
4. **검증**: 토큰을 사용하는 위젯의 라이트·다크 화면과 팔레트 교체 동작을 확인해요. 레지스트리의 등록·선택·폴백 동작이 바뀌면 관련 테스트도 보완해요.

---

## 타이포 (폰트) 교체

폰트 패밀리는 `AppTypeface`와 `AppTypefaceRegistry`로 앱별로 설정해요([ADR-023](../philosophy/adr-023-typeface-registry.md)). 템플릿의 `DefaultTypeface`는 별도 폰트 자산을 등록하지 않고 시스템 기본 글꼴과 폴백을 사용해요.

파생 레포가 자체 폰트로 교체하려면:

1. **자산 추가**: 필요한 굵기의 폰트 파일을 `assets/fonts/`에 배치해요. 아래 예시는 Regular·Medium·Bold·Black 네 파일을 사용해요.
2. **`pubspec.yaml`** 의 `flutter:` 섹션에 폰트를 등록해요.
   ```yaml
   flutter:
     fonts:
       - family: Pretendard
         fonts:
           - asset: assets/fonts/Pretendard-Regular.ttf
             weight: 400
           - asset: assets/fonts/Pretendard-Medium.ttf
             weight: 500
           - asset: assets/fonts/Pretendard-Bold.ttf
             weight: 700
           - asset: assets/fonts/Pretendard-Black.ttf
             weight: 900
   ```
3. **`MyAppTypeface`** 를 정의해요 (`lib/core/theme/my_app_typeface.dart`).
   ```dart
   class MyAppTypeface extends AppTypeface {
     @override String get id => 'pretendard';
     @override String get name => 'Pretendard';
     @override String? get fontFamily => 'Pretendard';
     @override List<String> get fontFamilyFallback =>
         const ['Apple SD Gothic Neo', 'Noto Sans CJK KR'];
   }
   ```
4. **`main.dart`** 에서 install 해요 — `DefaultTypeface` 대신 `MyAppTypeface` 를 넣어요.
   ```dart
   AppTypefaceRegistry.install(MyAppTypeface());
   ```

글자 크기·굵기 스케일을 바꾸려면 `buildTextTheme()`을 재정의해요. 화면 전체의 줄바꿈과 버튼 높이에 영향을 줄 수 있으므로 긴 번역 문구와 큰 글꼴 설정에서도 확인해요.

<a id="한국어-무료-폰트-후보-모두-sil-ofl-11"></a>

### 한국어 폰트 후보

ADR-023에서 비교한 후보는 SUIT, Pretendard, Spoqa Han Sans Neo, Noto Sans KR이에요. 실제로 사용할 파일의 라이선스, 필요한 글리프와 굵기, 정적·가변 폰트 제공 여부를 확인한 뒤 선택해요. 자산 용량은 버전·굵기·서브셋에 따라 달라지므로 내려받은 파일과 실제 빌드 결과로 비교해요.

자세한 비교 / 출처는 [`ADR-023`](../philosophy/adr-023-typeface-registry.md) §Prior Art 에 있어요.

---

## 이번에 안 한 것 (의도)

다음 기능은 현재 템플릿에 도입하지 않았어요. 공통 기반을 작게 유지하고, 파생 앱에서 필요성이 확인되면 추가한다는 ADR-019의 기준을 따라요.

- **별도 `AppDimens` 추상화** — 간격·라운딩·컴포넌트 크기는 `AppSpacing`에서 관리해요. 앱마다 별도 체계가 필요해지면 ADR로 검토해요.
- **컴포넌트 크기 변형(`size: sm/md/lg`)** — 현재 공통 위젯에 이 인자를 일괄 추가하지 않았어요. 실제 사용 사례가 생기면 영향받는 위젯부터 검토해요.
- **가변 폰트 기본 탑재** — 템플릿에 폰트 자산을 넣지 않았어요. 파생 앱에서 가변 폰트를 선택하면 대상 기기의 표시와 빌드 결과를 확인해요.
- **Widgetbook** — 현재 별도 위젯 카탈로그를 운영하지 않아요. 화면 확인 비용이 커지면 도입을 검토해요.
- **라이트·다크별 폰트 분기** — 현재는 같은 타이페이스를 사용하고 색상 테마를 바꿔요.
- **언어별 폰트 자동 분기** — 현재는 지정한 폰트와 폴백에 맡겨요. 파생 앱에서 지원할 언어의 글리프를 확인해요.

---

## 관련

- [`ADR-015 · 팔레트 런타임 교체`](../philosophy/adr-015-palette-registry.md) — 팔레트 분리 / 런타임 교체의 근거
- [`ADR-023 · 폰트 런타임 교체`](../philosophy/adr-023-typeface-registry.md) — 타이페이스 분리 / 런타임 교체의 근거
- [`ADR-002 · 3계층 모듈 구조`](../philosophy/adr-002-layered-modules.md) — 토큰이 `core/theme/` 에 있는 이유
- [`ADR-019 · 솔로 친화적 운영`](../philosophy/adr-019-solo-friendly.md) — 토큰 추상화 한계선의 상위 기준
- [`Loading UX`](./loading-ux.md) — 로딩 상태 위젯이 따라야 할 별도 규약
