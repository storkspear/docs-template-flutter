<a id="very_good_analysis"></a>

# Very_Good_Analysis

**Status**: Accepted. 2026-04-25 기준 유효.

## 결론부터

`very_good_analysis`를 기본 분석 규칙으로 사용하고, 앱의 구현 방식에 맞지 않는 규칙은 사유를 남겨 조정해요. 도입 당시의 위반·수정·테스트 수치는 아래 결정의 이력으로 읽고, 현재 규칙은 `analysis_options.yaml`을 기준으로 확인해요. 분석 통과는 코드 리뷰와 동작 검증을 대신하지 않아요.

## 왜 이런 고민이 시작됐나?

기존 설정은 기본 `flutter_lints` (약 100 룰) 에 커스텀 룰 9개를 얹은 수준이었어요. 이걸로는:

- 회피 가능한 잠재 버그 (제네릭 추론 실패, unawaited Future, 광범위 catch) 가 통과
- 파생 레포마다 다른 코딩 스타일 누적 위험
- "이 정도로 충분한가?" 의문이 매번 코드 리뷰에서 반복

압력들이 부딪혔어요.

**압력 A — 솔로의 의지력 한계**  
"룰을 머리로 알고 있어도 매번 지키기 어려움." 자동 강제가 필요.

**압력 B — 룰셋이 너무 빡빡할 때의 부작용**  
매 PR 마다 스타일 룰 위반이 뜨면 짜증 → 결국 자동 disable 또는 무시. 신호가 묻힘.

**압력 C — 파생 레포 N개에 전파**  
한 곳에서 결정한 룰이 모든 앱에 영향. 신중해야 함.

**압력 D — 라이브러리용 룰 vs 앱용 룰 혼재**  
`public_member_api_docs` 같은 룰은 패키지 개발자 대상. 앱 코드에는 노이즈.

이 결정이 답해야 했던 물음이에요.

> **솔로 인디 앱에 적합한 정적 분석 엄격도는 어디까지이며, 어떤 룰이 신호이고 어떤 룰이 노이즈인가?**

## 고민했던 대안들

<a id="option-1--flutter_lints-유지-기본-약-100-룰--커스텀-9-룰"></a>

### Option 1 — flutter_lints 유지 (기본 약 100 룰 + 커스텀 9 룰)

- **장점**: 변경 0. 기존 코드 무수정. 룰 위반 거의 없음.
- **단점**: 잠재 버그 통과. 룰 추가 시 매번 의식적 결정 필요 — 결국 누락.
- **탈락 이유**: "충분한가?" 의문이 해소 안 됨. 솔로 개발자가 "필요한 룰" 을 직접 큐레이션할 시간 없음.

<a id="option-2--very_good_analysis-전부-활성"></a>

### Option 2 — very_good_analysis 전부 활성

100+ 룰 모두 적용 후 1,367개 위반 모두 수정.

- **장점**: 라이브러리 수준 엄격함. 파생 레포가 자동으로 모범 코드.
- **단점 1**: 1,367 위반 중 620개 (45%) 가 `public_member_api_docs` — 앱 코드에 dartdoc 강제는 라이브러리 컨텍스트.
- **단점 2**: 80자 줄 제한 (`lines_longer_than_80_chars`) 은 Flutter Material API에 비현실적.
- **단점 3**: 매 PR 마다 스타일 룰 위반 가능성 → 솔로에게 짜증, 결국 무시 흐름.
- **탈락 이유**: 노이즈 비율이 너무 높음. 진짜 가치 룰이 가려짐.

<a id="option-3--다른-큐레이션-룰셋-google-lints-pedantic-등"></a>

### Option 3 — 다른 큐레이션 룰셋 (Google `lints`, `pedantic` 등)

- **장점**: 다른 옵션 존재.
- **단점**: 유지보수 책임이 본인. 매년 새 룰 등장 추적 필요.
- **탈락 이유**: VGV 가 Flutter 커뮤니티에서 사실상 표준 (Bloc 공식 템플릿 채택). 본인이 큐레이션할 ROI 없음.

<a id="option-4-채택--very_good_analysis--컨텍스트-기반-disable"></a>

### Option 4 (채택) — very_good_analysis + 컨텍스트 기반 disable

100+ 룰 베이스라인 + 솔로 앱에 과한 20개 룰 의식적 disable + 사유 yaml 주석에 명시.

- **장점 1**: VGV 큐레이션을 베이스로 활용 (커뮤니티 표준).
- **장점 2**: disable 결정 + 사유를 `analysis_options.yaml` 에 박아둠 → 미래의 본인이 "왜 이 룰 꺼져있지?" 답을 찾을 수 있음.
- **장점 3**: 자동 수정 가능한 위반 (633개) 은 `dart fix --apply` 로 일괄 처리.
- **단점**: 큐레이션 결정에 1회 시간 투입 (~2시간).

## 결정

### 채택된 룰셋 구조

```yaml
# analysis_options.yaml
include: package:very_good_analysis/analysis_options.yaml

linter:
  rules:
    # 기존 flutter_lints 명시 룰 유지 (very_good_analysis에 포함되지만 표현 명시)
    avoid_print: true
    prefer_single_quotes: true
    # ... (총 9개)

    # 솔로 앱 컨텍스트에 과한 룰 disable (사유는 yaml 주석)
    public_member_api_docs: false   # 라이브러리용 — 앱 코드 dartdoc 강제 불필요
    cascade_invocations: false      # `.foo().bar()` vs `..foo()..bar()` 취향
    avoid_returning_this: false     # fluent builder 비추 (취향)
    # ... (총 19개)
    lines_longer_than_80_chars: false  # Flutter Material API에 비현실적

analyzer:
  errors:
    # very_good_analysis가 warning으로 승격한 inference 경고 — solo ROI 낮음
    inference_failure_on_function_invocation: ignore
    inference_failure_on_instance_creation: ignore
```

### Disable 분류

| 분류 | 룰 예시 | 사유 |
|------|--------|------|
| 라이브러리 전용 | `public_member_api_docs` | 앱 코드는 dartdoc 강제 불필요 |
| 의도된 패턴 | `avoid_catches_without_on_clauses` | splash/storage 의 광범위 catch 는 의도적 |
| 거짓 양성 | `only_throw_errors` | `ApiException implements Exception` 인데 ternary 추론 한계로 fire |
| 비현실적 | `lines_longer_than_80_chars` | Material API 호출에 80자 제한 어려움 |
| 취향 | `cascade_invocations`, `avoid_returning_this` | 스타일 강제, ROI 낮음 |

### 도입 절차 (재현 가능)

1. `flutter pub add --dev very_good_analysis` (자동으로 호환 버전 해결)
2. `analysis_options.yaml` 의 `include:` 교체
3. `flutter analyze` 로 baseline 측정 (1,367 위반 확인)
4. `dart fix --apply` 로 자동 수정 (633 fix in 139 files)
5. 잔여 위반 카테고리별 분류 → disable 결정 (사유 yaml 주석)
6. 진짜 버그 (`argument_type_not_assignable` 9, `unawaited_futures` 4) 수동 수정
7. 검증: `flutter analyze` 0 이슈 + `flutter test` 397 통과

## 이 선택이 가져온 것

### 긍정적 결과

정적 분석은 비동기 호출 누락과 타입·스타일 문제를 검토하는 데 도움을 줘요. 현재 pre-push 와 CI 에서 분석을 실행해요. 새 파생 레포에는 현재 설정이 복사되지만, 기존 파생 레포에 이후 변경이 자동 반영되지는 않아요. 당시 발견·변경 건수는 도입 기록으로 구분하고 현재 효과를 보장하는 수치로 사용하지 않아요.

### 부정적 결과

규칙을 도입하거나 바꿀 때 많은 파일에 형식 변경이 생길 수 있어 검토 범위를 나누어야 해요. 비활성화한 규칙은 프로젝트 맥락에 따른 선택이므로 새 요구가 생기면 다시 검토해요. 분석 메시지를 이해하고 실제 버그와 스타일 문제를 구분하는 작업도 필요해요.

## 교훈

<a id="교훈-1-노이즈-비율이-높아도-도입-roi-있음"></a>
<a id="교훈-1--노이즈-비율이-높아도-도입-roi-있음"></a>

### 교훈 1 — 위반 개수보다 문제의 영향을 살펴봐요

정적 분석의 가치는 위반 수만으로 정하지 않아요. 발견한 문제의 영향과 수정·유지 비용을 함께 봐요.

<a id="교훈-2--무조건-활성보다-의식적-큐레이션"></a>

### 교훈 2 — 무조건 활성보다 의식적 큐레이션

기본 룰셋을 출발점으로 삼되 앱의 구조와 맞지 않는 규칙은 이유를 남겨 조정해요. 예를 들어 모든 public 멤버에 문서를 강제할지 여부는 라이브러리와 앱에서 판단이 다를 수 있어요. 엄격함 자체를 목표로 삼지는 않아요.

<a id="교훈-3-사유는-yaml-주석에-박아두기"></a>
<a id="교훈-3--사유는-yaml-주석에-박아두기"></a>

### 교훈 3 — 규칙을 조정한 이유를 설정 옆에 남겨요

analysis_options.yaml 에 규칙을 조정한 이유를 함께 적으면 나중에 값을 바꿀 때 배경을 확인할 수 있어요. 긴 설명이나 공통 정책은 정본 문서로 연결하고 설정 옆에는 필요한 이유만 남겨요.

## 관련 사례 (Prior Art)

- [very_good_analysis (Very Good Ventures)](https://pub.dev/packages/very_good_analysis) — Flutter 커뮤니티 사실상 표준급 강한 룰셋
- [Bloc 공식 라이브러리](https://github.com/felangel/bloc) — VGV 룰셋 채택 사례
- [Google lints 패키지](https://pub.dev/packages/lints) — Dart 팀 공식이지만 더 가벼움 (이 ADR과 다른 선택지)
- [Airbnb JavaScript Style Guide](https://github.com/airbnb/javascript) — "강한 룰 + 사유 주석" 패턴의 원형 (다른 생태계지만 사상 유사)

## Code References

- [`analysis_options.yaml`](https://github.com/storkspear/template-flutter/blob/main/analysis_options.yaml) — 룰셋 include + disable 사유 (yaml 주석)
- [`pubspec.yaml`](https://github.com/storkspear/template-flutter/blob/main/pubspec.yaml) — `very_good_analysis` dev_dependency
- [`lib/core/kits/app_kits.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/core/kits/app_kits.dart) — 발견된 버그 수정 (line 54, 66 `await _rollback`)
- [`lib/kits/backend_api_kit/api_client.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/backend_api_kit/api_client.dart) — 타입 캐스트 명시 (`as Map<String, dynamic>`)

**관련 ADR**:
- [`ADR-019 · 솔로 친화적 운영`](./adr-019-solo-friendly.md) — "솔로 감당 가능" 기준의 상위 ADR. 이 ADR은 그 구체 사례.
- [`ADR-004 · YAML ↔ Dart 수동 동기화 + CI 검증`](./adr-004-manual-sync-ci-audit.md) — `configure_app.dart --audit` 와 함께 자동 강제의 두 축.

---

<a id="-책-목차--journey-6단계-운영--배포"></a>

## 📖 책 목차 — Journey 6단계 (운영 & 배포)

[`Developer Journey`](../journey/README.md) 의 **6단계 — 운영** 보강. [`ADR-019 · 솔로 친화적 운영`](./adr-019-solo-friendly.md) 의 구체 사례 — "솔로가 감당 가능한 코드 품질 자동 강제는 어디까지?" 의 답.

| 방향 | 문서 | 한 줄 |
|---|---|---|
| ← 이전 | [`ADR-021 · Multi-Recipe`](./adr-021-multi-recipe.md) | 동일 테마 (운영 & 배포) |
| → 다음 | [`ADR-023 · Typeface Registry`](./adr-023-typeface-registry.md) | 폰트도 Palette 패턴으로 — 앱별 타이페이스 교체 |
