# charts_kit

`fl_chart` 를 래핑한 차트 위젯 모음이에요. 라인 · 도넛 · 파이 차트를 앱마다 다시 스타일링하지 않도록 표준화해 둔 kit 이에요.

---

## 개요

검증된 Flutter 차트 라이브러리인 fl_chart 위에 `AppLineChart` · `AppPieChart` · `DonutGauge` 세 위젯을 얹었어요. 색상은 `AppPalette` 에서 자동으로 가져오기 때문에 테마와 따로 놀지 않아요. 빈 데이터 처리도 정해져 있어요 — `AppLineChart` · `AppPieChart` 모두 포인트/슬라이스가 없으면 빈 위젯 (`SizedBox.shrink`) 을 반환해요 (0×0 으로 접힘). 데이터 없을 때 공간을 유지하려면 호출 측이 placeholder 를 감싸세요.

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
