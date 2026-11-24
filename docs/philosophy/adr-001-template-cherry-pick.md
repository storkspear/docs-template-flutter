<a id="template_cherry"></a>

# Template_Cherry

**Status**: Accepted. 현재 유효. 2026-04-24 기준 레포가 GitHub Template Repository 로 표시됨. 파생 레포와의 공통 코드 동기화는 수동 cherry-pick.

## 결론부터

GitHub Template로 앱별 독립 레포를 만들고, 필요한 공통 개선을 수동으로 cherry-pick해요. 적용할 커밋과 의존 변경을 검토하고 파생 앱에서 검증하는 책임은 각 레포에 있어요. 이 방식은 자동 동기화를 제공하지 않으며, 파생 코드가 달라지면 충돌을 해결해야 해요.

## 왜 이런 고민이 시작됐나?

솔로 개발자가 여러 Flutter 앱을 빠른 주기로 출시하려면 **공통 코드 (테마 · 인증 · 네트워크 · 관측성)** 는 반드시 한 번만 잘 만들고 재사용해야 해요 (프롤로그 제약 2). 이때 "공통 코드 저장소" 와 "앱별 개별 레포" 의 관계를 어떻게 맺을지가 첫 질문이에요.

두 방향의 힘이 부딪혀요.

**힘 A — 공통 코드 진화**  
템플릿에 "더 나은 `ApiClient` 인터셉터" 가 추가되면 이미 만든 앱 A · B · C 에도 그 개선을 가져오고 싶어요. 안 그러면 옛 버전이 박제돼요.

**힘 B — 파생 레포의 고유성 보존**  
앱 A 는 이미 도메인 코드 (화면 · ViewModel · 모델) 가 수천 줄 쌓여 있어요. 템플릿 변경을 자동 merge 하면 도메인 코드의 구조나 테스트를 망가뜨릴 수 있어요. 예: 템플릿이 `LoginViewModel` 의 `state` 필드 이름을 바꾸는데 파생 레포에서 이미 그 필드를 직접 수정해서 쓰는 경우.

두 힘 모두 진심이지만, 동시에 만족하긴 어려워요. 완전 자동 merge 는 B 를 깨고, 완전 독립은 A 를 포기해요. 이 결정이 답해야 했던 물음이에요.

> **공통 코드는 진화시키되, 파생 레포의 도메인 코드는 해치지 않는 전파 방식** 은 무엇인가?

## 고민했던 대안들

<a id="option-1--monorepo-공통--앱들이-한-레포"></a>

### Option 1 — Monorepo (공통 + 앱들이 한 레포)

`apps/app-a/`, `apps/app-b/`, `packages/common/` 같은 monorepo 구조.

- **장점**: 공통 코드 변경이 모든 앱에 즉시 반영. atomic commit 으로 API 변경 + 호출부 수정이 한 번에.
- **단점 1**: 앱 하나 출시할 때마다 전체 레포 CI 가 돌아감 → 빌드 시간 누적.
- **단점 2**: 앱 저장소가 거대해지면 `git clone` 이 느려짐. 신규 기기 셋업 비용.
- **단점 3**: "한 앱만 파괴적으로 실험" 이 어려워짐 — 전체 빌드가 깨지니까.
- **탈락 이유**: 솔로 운영에서 앱이 N 개 늘어날 때 repo 규모가 지수적으로 증가. 제약 1 위반.

<a id="option-2--github-분기-기능--upstream-pull"></a>

### Option 2 — GitHub 분기 기능 + upstream pull

템플릿 레포를 GitHub 의 분기 기능으로 가져와 앱 레포 생성. 이후 `git remote add upstream ...` + `git pull upstream main` 으로 공통 변경 흡수.

- **장점**: git 표준 워크플로우. GitHub 가 "N commits behind upstream" 표시로 상태 시각화.
- **단점 1**: **분기는 부모 네트워크 레포** 로 관리돼요. 검색 · starring · 브랜드 식별에서 "storkspear/template-flutter 에서 분기" 로 계속 보여요. 독립 브랜드가 아님.
- **단점 2**: `pull` 이 **full merge** 를 의도 — 파생 레포의 도메인 코드와 충돌이 나면 conflict 해결 비용. 앱이 오래 될수록 conflict 가 커져요.
- **단점 3**: GitHub 분기는 **공개 템플릿 레포에서만 가능** — 조직 내 사설 템플릿에는 쓰기 복잡.
- **탈락 이유**: 힘 B (고유성 보존) 가 깨져요. 자동화가 오히려 위험해요.

<a id="option-3--github-template-repository--cherry-pick--채택"></a>

### Option 3 — GitHub Template Repository + cherry-pick ★ (채택)

템플릿 레포를 GitHub Template 으로 표시 → "Use this template" 버튼으로 **히스토리가 끊긴 독립 레포** 생성. 이후 공통 변경은 **수동 cherry-pick** 으로 필요한 것만 가져옴.

- **힘 A 만족**: 템플릿이 진화하면 각 파생 레포가 필요한 변경만 선별해서 가져옴. 최근 개선 확인 가능 (` git log <template-remote>/main`).
- **힘 B 만족**: 자동 merge 가 없으니 도메인 코드와의 충돌이 원천 차단. cherry-pick 시 **명시적으로** 도입 여부 결정.
- **추가 이점**: 파생 레포가 **완전 독립 브랜드** 로 보임. GitHub 검색 · README 에서 "xxx 의 포크" 로 표시되지 않음.

## 결정

### 1. 레포 수준

- `template-flutter` 은 **GitHub Template Repository 로 표시**. Settings → General → "Template repository" 체크.
- "Use this template → Create a new repository" 로 파생 레포 생성. 자동으로 히스토리 없는 single commit 으로 시작.

### 2. 초기 커스터마이징

파생 레포 클론 직후 아래 스크립트로 앱 정체성을 일괄 변경.

```bash
./scripts/app/rename-app.sh <slug> com.<org>.<slug>
```

> ⚠️ **slug 는 소문자 · 숫자 · 하이픈만 써요 — 언더스코어는 안 돼요.** `AppConfig` 가 부트 시점에 `^[a-z][a-z0-9-]*$` 로 검증하고, 어긋나면 `ArgumentError` 를 던져 앱이 그 자리에서 크래시해요 (백엔드 `AppSlugExtractor` 규칙과 같아야 라우팅이 성립하기 때문). 스크립트도 같은 정규식으로 인자를 먼저 검증하니 `my_tracker` 를 넣으면 아무것도 바꾸지 않고 거부해요.
>
> Bundle ID 는 **영숫자와 점만** 써요. Apple 은 언더스코어를, Android 는 하이픈을 거부하는데 이 스크립트는 양쪽에 같은 문자열을 넣기 때문이에요 — `com.example.myTracker` 처럼 넣어요.

이 스크립트가 바꾸는 곳:
- `pubspec.yaml` 의 `name:`
- `lib/main.dart` 의 `AppConfig.init(appSlug: ...)`
- `android/app/build.gradle.kts` 의 `applicationId` + `AndroidManifest.xml` 의 app label
- iOS Bundle ID — `ios/Flutter/AppEnv-{dev,prod}.xcconfig` 의 `BUNDLE_ID_BASE` (Info.plist 의 `CFBundleIdentifier` 는 `$(PRODUCT_BUNDLE_IDENTIFIER)` 변수 참조라 자동 반영) + iOS Display Name
- Kotlin `MainActivity` 의 패키지 선언 + Android Fastlane `Appfile` 의 `package_name`
- `app_kits.yaml` 의 `app.name` · `app.slug` + Dart import 경로 일괄 치환

<a id="3-템플릿--파생-전파-cherry-pick"></a>

### 3. 템플릿 → 파생 전파 (cherry-pick)

파생 레포에서 템플릿 원본을 remote 로 등록하고 필요한 커밋만 집어 옴.

```bash
# 최초 1회
git remote add template https://github.com/storkspear/template-flutter.git
git fetch template

# 템플릿에서 뭐가 바뀌었는지 확인
git log template/main --oneline --not main

# 특정 커밋만 가져오기
git cherry-pick <SHA>

# 범위로 가져오기 (충돌 시 수동 해결)
git cherry-pick A..B
```

Conflict 가 나면 도메인 코드 보존이 우선. 이미 파생 레포가 해당 파일을 크게 수정했다면 cherry-pick 을 **포기** 하는 것도 정당한 선택이에요.

### 4. 템플릿 레포에 커밋할 때 지켜야 할 절대 금지

- 특정 앱 · 도메인 · 회사 이름을 코드 · 문서에 박지 않음 (실제 앱 slug, 회사 도메인, bundle ID 같은 식별자)
- 실제 Bundle ID · Firebase project ID · Sentry DSN 을 커밋하지 않음
- 비즈니스 로직은 `lib/features/` 에 스텁만 — 실제 도메인은 파생 레포 몫
- 운영 환경 파일 (`.env`, `.env.prod`) 커밋 금지 — 운영 값은 파생 레포의 GitHub Secrets 만

## 이 선택이 가져온 것

### 긍정적 결과

- 파생 레포는 독립된 저장소로 만들어요. 템플릿 변경이 자동으로 들어오지는 않아요.
- 필요한 커밋을 골라 가져오므로 앱 고유 코드와 충돌하는 변경은 미루거나 조정할 수 있어요.
- 템플릿에서 계약을 바꿔도 각 앱의 적용 시점은 따로 정할 수 있어요. 적용한 뒤의 동작은 해당 앱에서 검증해야 해요.

### 부정적 결과

- 앱마다 어떤 변경을 반영했는지 추적해야 해요. 운영 앱이 많아질수록 이 확인 작업도 늘어나요.
- 충돌이 나면 원래 변경 의도와 앱의 수정 내용을 함께 이해해야 해요. 반복 충돌에는 `git rerere` 같은 도구를 활용할 수 있어요.
- 오랫동안 변경을 반영하지 않은 앱은 커밋을 그대로 가져오기 어려워 수동으로 적용해야 할 수 있어요.
- 현재 템플릿 변경을 모든 파생 레포에 전파하는 자동 sync PR 도구는 없어요.

## 교훈

<a id="교훈-1--자동화된-synchronization-이-항상-이득은-아니다"></a>

### 교훈 1 — "자동화된 synchronization" 이 항상 이득은 아니다

subtree 나 submodule 도 업데이트 시점과 통합 방식을 정할 수 있으므로, 자동으로 앱 코드를 바꾼다는 이유만으로 배제하지 않아요. 이 프로젝트는 각 앱이 필요한 변경을 고르고 독립적으로 유지하는 흐름을 선택했어요. 자동화 도입 여부는 반복 작업 감소와 충돌 처리 부담을 함께 비교해요.

<a id="교훈-2--공통-코드-vs-도메인-코드-경계는-시간과-함께-옮겨간다"></a>

### 교훈 2 — "공통 코드 vs 도메인 코드" 경계는 시간과 함께 옮겨간다

앱에서 공통 코드를 수정하면 이후 같은 파일의 템플릿 변경과 충돌할 수 있어요. 같은 확장이 여러 앱에 필요해졌을 때 공통 계약이나 설정으로 옮길지 검토해요. 미래의 변경을 모두 예상해 확장점을 늘리는 것은 피하고, 실제 반복되는 요구를 기준으로 삼아요.

<a id="교훈-3--템플릿-순수성-규칙은-자동-검증으로"></a>

### 교훈 3 — 템플릿 순수성 규칙은 자동 검증으로

템플릿에 특정 앱의 이름과 자격증명을 넣지 않는 규칙은 변경 검토에서 확인해야 해요. 현재 pre-commit 과 CI 가 모든 고유명사를 자동 차단하지는 않아요. 자동 검사를 추가한다면 검사 범위와 오탐을 정하고, 그 검사만으로 중립성이 보장된다고 설명하지 않아요.

## 관련 사례 (Prior Art)

- [GitHub Template Repositories 공식 문서](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-template-repository) — 본 ADR 의 기반 기능
- [`template-spring 의 ADR-002`](https://github.com/storkspear/template-spring/blob/main/docs/philosophy/adr-002-use-this-template.md) — 짝이 되는 백엔드 템플릿의 같은 결정. 프롤로그 제약 공유
- [Create React App · Next.js 의 `create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app) — 템플릿 복제 + 초기 이름 설정 패턴
- [cookiecutter (Python)](https://cookiecutter.readthedocs.io/) — 템플릿 변수 치환 기반 프로젝트 생성기
- [Git rerere](https://git-scm.com/book/en/v2/Git-Tools-Rerere) — 반복되는 cherry-pick conflict 자동 해결

## Code References

**템플릿 유지 규칙**
- [`README.md`](https://github.com/storkspear/template-flutter/blob/main/README.md) — "Use this template" 안내 + 파생 레포 생성 후 체크리스트
- [`CLAUDE.md`](https://github.com/storkspear/template-flutter/blob/main/CLAUDE.md) — 절대 룰: 직접 개발 금지 · "파생 레포" 용어 · 순수성 규칙
- [`scripts/app/rename-app.sh`](https://github.com/storkspear/template-flutter/blob/main/scripts/app/rename-app.sh) — 앱 정체성 일괄 치환
- [`scripts/init/setup.sh`](https://github.com/storkspear/template-flutter/blob/main/scripts/init/setup.sh) — git hooks 활성화

**짝이 되는 백엔드 템플릿**
- [`Spring Backend — Cross-repo Cherry-pick`](https://github.com/storkspear/template-spring/blob/main/docs/start/cross-repo-cherry-pick.md) — 같은 전파 원칙 상세. 이 ADR 의 실전 가이드로 재사용 가능

**관련 ADR**:
- [`ADR-002 · 3계층 모듈 구조`](./adr-002-layered-modules.md) — 템플릿에 뭐를 둘지 / 파생 레포에 뭐를 둘지 경계
- [`ADR-019 · 솔로 친화적 운영`](./adr-019-solo-friendly.md) — 수동 cherry-pick 의 "솔로 감당 가능" 판정
- [`ADR-021 · Multi-Recipe 구성`](./adr-021-multi-recipe.md) — 파생 레포가 어떤 Kit 조합으로 시작할지 선택
