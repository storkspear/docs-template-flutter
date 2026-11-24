<div id="documentation-style-guide"></div>

# Flutter 문서 작성 지침

문체, 문서 구성, 코드 대조, 중복 통합의 공통 기준은 [문서 작성 가이드](https://storkspear.github.io/docs-template-spring/#reference/STYLE_GUIDE.md)에 모았어요. 이 문서는 Flutter에만 필요한 규칙과 적용 위치를 설명해요. 공통 규칙을 별도로 복사해 관리하지 않아요.

<div id="1-독자-페르소나-level-03"></div>
<div id="1-독자-페르소나--level-03"></div>
<div id="레벨별-톤-규칙"></div>
<div id="샘플"></div>

## 1. 독자와 읽기 순서

주요 독자는 템플릿으로 파생 앱을 만드는 개발자예요. 문서에서 사용하는 Level은 다음 읽기 순서를 안내해요.

| 독자 | 안내할 내용 | 시작 문서 |
|---|---|---|
| Level 0~1: Flutter와 템플릿을 처음 쓰는 개발자 | 필요한 도구, 첫 실행, 앱 구성과 확인 방법 | [시작 안내](./journey/onboarding.md), [첫 앱 만들기](./journey/build-first-app.md) |
| Level 2: 기능을 조립하거나 수정하는 개발자 | Kit 계약, Provider, 상태와 화면의 수명, 오류 처리 | [아키텍처](./journey/architecture.md), [개발 규약](./conventions/README.md) |
| Level 3: 설계 근거를 검토하는 개발자 | 선택한 이유, 대안과 제약, 현재 구현 | [설계 결정](./philosophy/README.md) |

독자를 구분하는 자세한 기준은 [공통 가이드 §1](https://storkspear.github.io/docs-template-spring/#reference/STYLE_GUIDE.md#1-독자와-목적)을 따라요.

<div id="2-adr-카드-표준-구조"></div>
<div id="필수-섹션-순서-h2"></div>
<div id="파일-헤더-h1-status-줄"></div>
<div id="파일-헤더-h1--status-줄"></div>
<div id="선택-섹션"></div>
<div id="샘플-1"></div>

## 2. ADR과 기능 안내

ADR에는 당시의 문제, 결정과 근거, 제약을 남겨요. 기존 번호와 상태는 유지하고, 이후 구현이 달라졌다면 현재 동작을 구분해 적어요. 정해진 절이나 교훈·외부 링크의 개수를 채우려고 내용을 만들지 않아요. 구성 기준은 [공통 가이드 §2](https://storkspear.github.io/docs-template-spring/#reference/STYLE_GUIDE.md#2-목적에-맞는-구성)에 있어요.

기능 안내에는 Kit을 켜는 데 필요한 설정, 의존 Kit, 사용 예, 플랫폼별 제약, 제거할 때 정리할 항목을 담아요. 실제 조립은 `lib/main.dart`에서 하고 `app_kits.yaml`과 수동으로 맞춰요. 구성 검사 성공을 두 파일의 자동 비교나 실제 기기 검증의 성공으로 설명하지 않아요.

ADR 제목은 독자가 내용을 알 수 있게 짧게 써요. 제목이나 절 이름을 바꾸면 기존 앵커를 보존하고, 미러의 목차 설명도 함께 맞춰요.

<div id="3-톤-문체-말투"></div>
<div id="3-톤--문체--말투"></div>
<div id="기본-말투-해요체"></div>
<div id="섹션명-자연-한국어"></div>
<div id="독자에게-직접-말-걸기-허용"></div>
<div id="표현-강도"></div>
<div id="샘플-2"></div>

## 3. 담백한 해요체

[공통 문체 기준](https://storkspear.github.io/docs-template-spring/#reference/STYLE_GUIDE.md#3-담백한-해요체)을 따라요. 과한 친근함이나 수사적인 질문 대신 실제 동작을 설명해요.

예를 들어 ‘3줄이면 완성이에요’라고 줄 수를 강조하기보다 어떤 파일을 바꾸고 무엇을 확인해야 하는지 적어요. `ref.mounted`처럼 동작에 필요한 조건은 문장을 줄이더라도 남겨요.

<div id="4-용어집-glossary"></div>
<div id="용어-사용-규칙"></div>

## 4. 용어와 표기

Flutter 용어의 정본은 [용어집](./reference/glossary.md)이에요. `Kit`, `AppKit`, `Provider`, `파생 레포`처럼 프로젝트에서 정한 표기를 유지해요. 실제 식별자와 경로는 백틱으로 표시하고 조사는 붙여 써요. 일반 설명에 불필요한 영어를 섞지 않아요.

용어를 정의하고 연결하는 원칙은 [공통 가이드 §4](https://storkspear.github.io/docs-template-spring/#reference/STYLE_GUIDE.md#4-용어와-표기)를 따라요.

<div id="5-코드-블록-규칙"></div>
<div id="언어-태깅-필수"></div>
<div id="경로-주석"></div>
<div id="공백-들여쓰기"></div>
<div id="공백--들여쓰기"></div>
<div id="주석-최소"></div>
<div id="샘플-3"></div>

## 5. Dart와 플랫폼 예제

Dart 예제는 실제 타입과 메서드, 사용 중인 Riverpod API를 확인해요. 발췌한 예제에는 생략한 부분을 표시하고, 실행 가능한 예제에는 필요한 import와 조립 위치를 포함해요. 들여쓰기는 Dart·YAML·JSON의 기존 두 칸 규칙을 따라요.

비동기 작업은 화면 상태와 서비스 작업의 수명을 구분해 설명해요. Android·iOS의 권한, 설정 파일, 서명, 외부 SDK 조건도 구분해요. Mock 동작이나 순수 Dart 테스트를 실기기·스토어·외부 서비스 검증으로 표현하지 않아요.

예제와 명령을 검증하는 공통 기준은 [공통 가이드 §5](https://storkspear.github.io/docs-template-spring/#reference/STYLE_GUIDE.md#5-코드와-명령-예제)에 있어요.

<div id="6-링크-cross-reference-규칙"></div>
<div id="6-링크--cross-reference-규칙"></div>
<div id="내부-링크는-상대-경로"></div>
<div id="링크-텍스트는-백틱"></div>
<div id="code-references-섹션의-외부-링크"></div>
<div id="앵커-링크"></div>
<div id="adr-간-참조-포맷"></div>
<div id="관련-adr-섹션-위치"></div>
<div id="외부-링크-prior-art"></div>
<div id="샘플-4"></div>

## 6. 링크와 통합한 문서

같은 `docs/` 안의 문서는 상대 경로로 연결해요. `lib/`·`test/`·스크립트처럼 공개 미러에 없는 소스 파일은 `storkspear/template-flutter`의 GitHub 링크를 사용해요. 이 원본 저장소는 비공개이므로 코드를 보려면 접근 권한이 필요해요.

기존 문서를 통합하면 내부 링크와 목차를 정본으로 바꾸고, 옛 주소에는 새 위치로 연결되는 짧은 안내를 남겨요. 제목을 바꿀 때도 기존 절별 링크를 보존해요. 자세한 기준은 [공통 가이드 §6](https://storkspear.github.io/docs-template-spring/#reference/STYLE_GUIDE.md#6-링크와-문서-통합)을 따라요.

<div id="7-문서-규모별-1-세션-작업량"></div>
<div id="1-세션-기준의-근거"></div>
<div id="세션-밀도-유지-원칙"></div>

## 7. 검토 순서

문서를 끝까지 읽은 뒤 설명한 기능의 진입점과 호출 흐름을 따라가요. Kit 선언, 실제 조립, Provider 생성, 화면 상태, 플랫폼 설정을 같은 동작으로 뭉뚱그리지 않아요. 긴 문서는 읽은 구간을 기록해 이어서 검토해요.

검토 기록과 재검토 기준은 [공통 가이드 §7](https://storkspear.github.io/docs-template-spring/#reference/STYLE_GUIDE.md#7-검토-순서와-기록)에 있어요.

<div id="8-검증-체크리스트-문서-완료-전"></div>

## 8. 검증과 공개 미러 반영

본문은 `template-flutter/docs/`에서 수정해요. `scripts/docs/sync-docs.sh`가 `docs-template-flutter/docs/`로 복사하며, main의 자동 동기화가 같은 스크립트를 사용해요. `superpowers/`와 `planned/`는 공개 대상에서 제외하고, 미러 고유 `manifest.json`은 별도로 관리해요.

문서를 추가하거나 통합하면 미러 목차도 수정해요. 본문의 링크와 기존 주소, 코드·표·그림의 PC·모바일 표시를 확인하고, 원본과 게시본을 대조해요. API 계약을 설명한 부분은 `tools/docs-check/docs-contract-test.sh`로도 검사해요. 자동 검사가 모든 문장의 정확성을 확인해 주지는 않아요.

전체 완료 기준은 [공통 가이드 §8](https://storkspear.github.io/docs-template-spring/#reference/STYLE_GUIDE.md#8-완료-전-확인)을 따라요.

<div id="9-이-가이드의-진화-원칙"></div>
<div id="귀납이-우선-연역은-금지"></div>
<div id="예외-발생-시-기록-패턴-식별-규칙-업데이트"></div>
<div id="예외-발생-시-기록--패턴-식별--규칙-업데이트"></div>
<div id="로드맵에서-이-가이드의-활용"></div>

## 9. 작성 기준을 고칠 때

여러 템플릿에 공통으로 적용할 문체·검토 규칙은 [공통 가이드](https://storkspear.github.io/docs-template-spring/#reference/STYLE_GUIDE.md)에 반영해요. Flutter의 조립 방식이나 플랫폼 제약처럼 이 템플릿에만 해당하는 내용은 이 문서에서 관리해요. 관련 `CLAUDE.md`와 안내 문서도 함께 맞춰요.

## 10. 변경 이력

이력은 `git log -- docs/STYLE_GUIDE.md`에서 확인해요. 이전 버전의 자세한 공통 규칙은 위 가이드로 통합했어요.
