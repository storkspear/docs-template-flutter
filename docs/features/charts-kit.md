# charts_kit

**`fl_chart` 래핑 차트 위젯**. 라인 · 도넛 · 파이 차트 표준화.

---

## 개요

- **fl_chart 기반**: 검증된 Flutter 차트 라이브러리
- **래핑 위젯**: `AppLineChart` · `AppPieChart` · `DonutGauge`
- **테마 통합**: `AppPalette` 색상 자동 적용
- **빈 데이터 안전**: 포인트/슬라이스 없으면 빈 위젯 자동 반환

---

## 활성화

```yaml
# app_kits.yaml
kits:
  charts_kit: {}
```

```dart
// lib/main.dart
await AppKits.install([
  ChartsKit(),
  // ...
]);
```

---

## 제공 위젯

| 위젯 | 용도 |
|------|------|
| `AppLineChart` | 시계열 · 추이 |
| `AppPieChart` | 비율 (카테고리 분포) |
| `DonutGauge` | 목표 대비 진행률 (도넛) |

---

## 사용 예

```dart
AppLineChart(
  points: [
    LinePoint(0, 100),
    LinePoint(1, 250),
    LinePoint(2, 180),
  ],
)

DonutGauge(
  progress: 0.72, // centerLabel 생략 시 '72%' 자동 표기
)
```

---

## Code References

- [`lib/kits/charts_kit/charts_kit.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/charts_kit/charts_kit.dart)
- [`lib/kits/charts_kit/app_line_chart.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/charts_kit/app_line_chart.dart)
- [`lib/kits/charts_kit/app_pie_chart.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/charts_kit/app_pie_chart.dart)
- [`lib/kits/charts_kit/donut_gauge.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/charts_kit/donut_gauge.dart)
