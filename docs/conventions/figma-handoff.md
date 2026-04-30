# Figma → Flutter 디자인 핸드오프

디자이너의 Figma 디자인 토큰을 Flutter 의 `AppPalette` / `AppTypeface` / `AppSpacing` 으로 매핑하는 워크플로우.

> 본 문서는 **자동 변환 도구를 강제하지 않아요**. 1-2 명 솔로 개발 환경에서 가장 가벼운 수동 매핑이 보통 가장 빠릅니다. 자동화는 팀이 5명+ / 디자인 토큰 50개+ 일 때 도입 권장.

**관련 문서**: [`theme-tokens.md`](./theme-tokens.md), [`ADR-015 · Palette Registry`](../philosophy/adr-015-palette-registry.md), [`ADR-023 · Typeface Registry`](../philosophy/adr-023-typeface-registry.md)

---

## 1. Figma 측 정리 — 디자이너 측 작업

디자이너가 Figma 에서 미리 정리해주면 매핑이 훨씬 쉬워요. 권장 구조:

### 1-1. Color Styles 정의

Figma 의 **Local styles → Color** 에 시맨틱 이름으로 정의:

```
Brand/Primary       #6366F1
Brand/Secondary     #8B5CF6

Surface/Background  #FFFFFF
Surface/Foreground  #1F2937
Surface/Muted       #F3F4F6

State/Success       #10B981
State/Warning       #F59E0B
State/Error         #EF4444
State/Info          #3B82F6

Border/Default      #E5E7EB
Border/Strong       #D1D5DB
```

> ❌ "Blue 500", "Gray 200" 같은 **원자 이름 금지** — Material 3 의 시맨틱 컬러롤과 매핑 어려움.
> ✅ **시맨틱 이름** (예: "Primary", "Surface/Background") 으로.

### 1-2. Text Styles 정의

```
Display/Large       Pretendard 32px Bold     -0.5 letterSpacing
Display/Medium      Pretendard 28px Bold

Heading/H1          Pretendard 24px SemiBold
Heading/H2          Pretendard 20px SemiBold
Heading/H3          Pretendard 18px SemiBold

Body/Large          Pretendard 16px Regular  1.5 lineHeight
Body/Medium         Pretendard 14px Regular  1.5 lineHeight
Body/Small          Pretendard 12px Regular

Label/Large         Pretendard 14px Medium
Label/Medium        Pretendard 12px Medium
```

> Material 3 의 `TextTheme` 와 1:1 매핑되도록 이름 정해두면 좋아요 (`displayLarge`, `headlineLarge`, `bodyLarge` 등).

### 1-3. Spacing / Radius

Figma 의 **Local variables → Number** 에:

```
spacing/xs     4
spacing/sm     8
spacing/md     16
spacing/lg     24
spacing/xl     32
spacing/2xl    48

radius/sm      4
radius/md      8
radius/lg      12
radius/xl      16
radius/full    9999
```

---

## 2. Flutter 매핑 — 개발자 측 작업

### 2-1. 색상 → AppPalette

`lib/core/theme/` 에 새 팔레트 클래스:

```dart
// lib/core/theme/my_app_palette.dart

import 'package:app_template/core/theme/app_palette.dart';
import 'package:flutter/material.dart';

class MyAppPalette extends AppPalette {
  @override
  String get id => 'my-app-light';

  @override
  String get name => 'My App (Light)';

  @override
  Color get seed => const Color(0xFF6366F1);  // Brand/Primary

  @override
  Brightness get brightness => Brightness.light;

  // Material 3 fromSeed 가 자동 생성하는 ColorScheme 위에 시맨틱 색만 override
  @override
  ColorScheme buildColorScheme() {
    final base = ColorScheme.fromSeed(
      seedColor: seed,
      brightness: brightness,
    );
    return base.copyWith(
      // Figma 의 Surface/Background 와 매핑
      surface: const Color(0xFFFFFFFF),
      onSurface: const Color(0xFF1F2937),
      surfaceContainer: const Color(0xFFF3F4F6),  // Figma Surface/Muted
      // State/Success 등은 별도 extension 으로 (아래 §2-3)
      error: const Color(0xFFEF4444),
    );
  }
}
```

`lib/main.dart` 의 `_bootstrap()`:

```dart
AppPaletteRegistry.install(MyAppPalette());
```

### 2-2. 폰트 → AppTypeface

폰트 파일 추가:
1. Pretendard `.ttf` 파일을 `assets/fonts/` 에 배치 (4 weight 권장: 400/500/600/700)
2. `pubspec.yaml`:
   ```yaml
   flutter:
     fonts:
       - family: Pretendard
         fonts:
           - asset: assets/fonts/Pretendard-Regular.ttf
             weight: 400
           - asset: assets/fonts/Pretendard-Medium.ttf
             weight: 500
           - asset: assets/fonts/Pretendard-SemiBold.ttf
             weight: 600
           - asset: assets/fonts/Pretendard-Bold.ttf
             weight: 700
   ```
3. `lib/core/theme/my_app_typeface.dart`:
   ```dart
   class MyAppTypeface extends AppTypeface {
     @override
     String get id => 'my-app';

     @override
     String get fontFamily => 'Pretendard';

     // Material 3 TextTheme override
     @override
     TextTheme buildTextTheme(TextTheme base) {
       return base.copyWith(
         // Display
         displayLarge: base.displayLarge?.copyWith(
           fontWeight: FontWeight.w700,
           letterSpacing: -0.5,
         ),
         // Headline
         headlineLarge: base.headlineLarge?.copyWith(
           fontWeight: FontWeight.w600,
         ),
         // Body
         bodyLarge: base.bodyLarge?.copyWith(
           fontWeight: FontWeight.w400,
           height: 1.5,
         ),
       );
     }
   }
   ```
4. `lib/main.dart`:
   ```dart
   AppTypefaceRegistry.install(MyAppTypeface());
   ```

> 자세한 폰트 적용 단계 + 한국어 무료 폰트 비교 (Pretendard / Spoqa Han Sans Neo / Noto Sans KR) 는 [`ADR-023 · Typeface Registry`](../philosophy/adr-023-typeface-registry.md).

### 2-3. State 색상 (Material 3 외)

Material 3 의 `ColorScheme` 에 직접 들어맞지 않는 시맨틱 색 (Success / Warning / Info) 은 ThemeExtension 으로:

```dart
// lib/core/theme/state_colors.dart

class StateColors extends ThemeExtension<StateColors> {
  const StateColors({
    required this.success,
    required this.warning,
    required this.info,
  });

  final Color success;
  final Color warning;
  final Color info;

  @override
  StateColors copyWith({Color? success, Color? warning, Color? info}) {
    return StateColors(
      success: success ?? this.success,
      warning: warning ?? this.warning,
      info: info ?? this.info,
    );
  }

  @override
  StateColors lerp(StateColors? other, double t) {
    if (other == null) return this;
    return StateColors(
      success: Color.lerp(success, other.success, t)!,
      warning: Color.lerp(warning, other.warning, t)!,
      info: Color.lerp(info, other.info, t)!,
    );
  }
}

// lib/app.dart 의 ThemeData 에 등록
ThemeData(
  // ...
  extensions: [
    const StateColors(
      success: Color(0xFF10B981),
      warning: Color(0xFFF59E0B),
      info: Color(0xFF3B82F6),
    ),
  ],
);
```

사용:
```dart
final colors = Theme.of(context).extension<StateColors>()!;
return Container(color: colors.success);
```

### 2-4. Spacing → AppSpacing

이미 `lib/core/theme/spacing.dart` 에 표준 값이 있으면 그 위에 매핑. 없으면 `AppSpacing` 같은 const 클래스:

```dart
// lib/core/theme/app_spacing.dart

class AppSpacing {
  static const double xs = 4;
  static const double sm = 8;
  static const double md = 16;
  static const double lg = 24;
  static const double xl = 32;
  static const double xl2 = 48;
}

class AppRadius {
  static const double sm = 4;
  static const double md = 8;
  static const double lg = 12;
  static const double xl = 16;
  static const double full = 9999;
}
```

사용:
```dart
Padding(padding: const EdgeInsets.all(AppSpacing.md), ...);
ClipRRect(borderRadius: BorderRadius.circular(AppRadius.md), ...);
```

---

## 3. Figma → Flutter 매핑 체크리스트

**디자이너에게 받을 것**:
- [ ] Color Styles 시맨틱 이름 + HEX 값 표 (또는 Figma JSON export)
- [ ] Text Styles 표 (font/weight/size/letterSpacing/lineHeight)
- [ ] Spacing/Radius 토큰 표
- [ ] (있으면) Component variant 명세 — 버튼 크기/상태별 색상 등

**개발자가 작성할 것**:
- [ ] `MyAppPalette` 클래스 (`lib/core/theme/`)
- [ ] (커스텀 폰트면) `MyAppTypeface` 클래스 + `assets/fonts/` 배치 + `pubspec.yaml` fonts
- [ ] (시맨틱 색이 Material 3 밖이면) `StateColors` ThemeExtension
- [ ] `AppSpacing` / `AppRadius` const 클래스
- [ ] `lib/main.dart` 에서 모두 install
- [ ] (선택) Figma 컴포넌트 → 우리 `core/widgets/` 매핑 표 작성

---

## 4. 자동화 옵션 (5명+ 팀, 50+ 토큰)

수동 매핑이 부담되면:

### 4-1. Figma Tokens (Plugin)

Figma 의 **Tokens Studio for Figma** 플러그인 → JSON export → Flutter 측에서 codegen.

```bash
# Figma → tokens.json export
# Flutter 측:
dart run tool/sync_design_tokens.dart tokens.json
# → lib/core/theme/generated/colors.dart 자동 생성
```

> 본 템플릿은 codegen 도구를 기본 제공하지 않아요. 필요하면 파생 레포에서 자체 작성. `style_dictionary` 또는 `figma_tokens_to_dart` 같은 패키지 참조.

### 4-2. Figma Variables API

Figma 의 Variables API (paid plan) → 직접 fetch → codegen. Plugin 보다 안정적이지만 paid 플랜 필요.

---

## 5. 자주 빠지는 함정

1. **Figma 의 "Blue 500" 같은 원자 이름을 그대로 코드에 도입** → Material 3 시맨틱 컬러롤과 매핑 불가
2. **폰트만 바꾸고 `pubspec.yaml` 의 fonts 누락** → 빌드 시 silently 시스템 폰트로 fallback
3. **Material 3 fromSeed 무시하고 모든 색을 직접 override** → 다크모드 / 컨트라스트 / 접근성 고려 못 함
4. **letterSpacing / lineHeight 누락** — Pretendard 같은 한글 폰트는 lineHeight 1.5 권장 (영문 1.2 와 다름)
5. **assets/fonts/ 의 weight 와 pubspec 의 weight 불일치** → 잘못된 굵기로 렌더링
6. **Light/Dark 테마 둘 다 안 정의** — Material 3 `fromSeed` 는 brightness 받아서 자동 생성 가능

---

## 6. 검증

```bash
flutter run
# 디자이너와 화면 좌우 비교 (Figma 와 실제 앱 side-by-side)
```

체크 항목:
- [ ] Brand 색상이 정확히 일치 (HEX 비교)
- [ ] 폰트 weight/size 일치
- [ ] Spacing 일관성 (특히 8/16/24 같은 자주 쓰는 값)
- [ ] Light/Dark 모두 화면 구성 정상
- [ ] 접근성 (contrast ratio > 4.5:1 — Chrome DevTools 의 Lighthouse)

---

## 7. 관련 문서

- [`theme-tokens.md`](./theme-tokens.md) — Theme.of vs AppPaletteRegistry · 새 위젯 체크리스트
- [`ADR-015 · Palette Registry`](../philosophy/adr-015-palette-registry.md) — 런타임 팔레트 교체 설계
- [`ADR-023 · Typeface Registry`](../philosophy/adr-023-typeface-registry.md) — 폰트 런타임 교체 + 한국어 폰트 비교
- [`lib/core/theme/README.md`](https://github.com/storkspear/template-flutter/blob/main/lib/core/theme/README.md) — 디자인 토큰 사용 코드 가이드
