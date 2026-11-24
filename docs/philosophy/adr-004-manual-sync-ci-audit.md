<a id="manual_sync"></a>

# Manual_Sync

**Status**: Accepted. 현재 유효. 2026-04-24 작성 / 2026-05-07 line 수 갱신. `tool/configure_app.dart` 가 `app_kits.yaml` 의 kit 선언 + 의존성(requires)을 `kit_manifest.yaml` 과 대조 검증. `--audit` 플래그로 CI 에서 차단. (단, `app_kits.yaml` ↔ `main.dart` 줄 단위 일치 자체는 아직 자동 검증 안 함 — main.dart 마커 치환은 향후 확장 예정.)

## 결론부터

Kit 조합은 `app_kits.yaml`과 `main.dart`에서 수동으로 맞춰요. `configure_app.dart --audit`는 YAML의 Kit 이름·의존 선언·로그인 provider를 검사해요. `main.dart`는 읽지 않으므로 두 파일의 일치를 자동 보장하지는 않아요. 이 결정은 Kit 조립 코드 생성에 관한 것이며, l10n이나 Drift의 코드 생성을 금지하는 규칙은 아니에요.

## 왜 이런 고민이 시작됐나?

ADR-003 이 FeatureKit 레지스트리를 도입했을 때, Kit 활성화를 어디에 선언할지 자연스럽게 질문이 생겼어요.

**옵션 A — YAML 한 곳에만 선언**  
`app_kits.yaml` 만 작성하고 코드 생성기가 `main.dart` 의 install 리스트를 만든다.

**옵션 B — Dart 한 곳에만 선언**  
`main.dart` 의 `AppKits.install([...])` 에 직접 작성. YAML 은 안 씀.

두 옵션 모두 장단점이 있고, 결국 "**선언적 가독성 (YAML) + 타입 안전 (Dart)**" 을 모두 원하는 양립 불가 상황이 생겼어요.

힘들이 부딪혔어요.

**힘 A — 선언적 가독성**  
파생 레포 개발자가 "이 앱이 어떤 Kit 을 쓰는지" 를 **한눈에** 보려면 YAML 이 적합. 주석 처리만으로 on/off 가능, diff 가 깔끔.

**힘 B — 타입 안전**  
Dart 코드에서 `AuthKit()` 같은 **생성자 호출** 을 해야 Kit 의 설정 파라미터 (경로 · 옵션 등) 를 타입 체크 가능. YAML 은 문자열이라 오타 감지 불가.

**힘 C — 빌드 파이프라인 단순성**  
코드 생성기 (`build_runner` + 커스텀 builder) 를 도입하면 매 Kit 변경 시 생성 단계 필요 → 느린 cycle + 빌드 실패 시 원인 추적 복잡.

이 결정이 답해야 했던 물음이에요.

> **가독성과 타입 안전을 동시에 얻되, 코드 생성 오버헤드는 피하는 방법** 은 무엇인가?

## 고민했던 대안들

<a id="option-1--yaml-만--코드-생성기"></a>

### Option 1 — YAML 만 + 코드 생성기

`app_kits.yaml` 편집 → `dart run build_runner build` → `main.g.dart` 에 `AppKits.install([...])` 자동 생성.

- **장점**: 두 곳 동기화 불필요. 개발자는 YAML 한 곳만 신경.
- **단점 1**: **Kit 설정 파라미터 (경로 · 서비스 인스턴스 등)** 를 YAML 로 전달하기 어려움. 예: `UpdateKit(service: NoUpdateAppUpdateService())` 의 service 파라미터를 YAML 에 어떻게?
- **단점 2**: `build_runner` 가 실패하면 원인 추적이 간접적. "왜 main.g.dart 가 안 생기지?" 의 디버깅.
- **단점 3**: 생성 파일은 git 에 커밋하지 않는 게 관행 → CI 에서 매번 재생성 → 빌드 시간 증가.
- **탈락 이유**: 힘 B (타입 안전) 만족 위해 파라미터 DSL 을 YAML 에 확장해야 함 → 복잡도 폭발.

<a id="option-2--dart-만--linter-경고"></a>

### Option 2 — Dart 만 + linter 경고

YAML 포기. `main.dart` 에서 `AppKits.install([...])` 만 보고 의존성 검증.

- **장점**: 타입 안전 완벽. 코드 생성 없음.
- **단점 1**: 파생 레포 개발자가 "이 앱이 쓰는 Kit" 을 보려면 `main.dart` 를 파싱해야 함. 선언적 가독성 없음.
- **단점 2**: Recipe 샘플 (`recipes/*.yaml`) 의 포맷을 Dart 로 어떻게? 주석 단순 Dart 스니펫?
- **단점 3**: 신규 팀원 온보딩 시 "뭘 켜고 뭘 껐지?" 를 빨리 파악 불가.
- **탈락 이유**: 힘 A (선언적 가독성) 위반. Recipe 시스템 (ADR-021) 과 맞지 않음.

<a id="option-3--둘-다-수동--ci-검증--채택"></a>

### Option 3 — 둘 다 수동 + CI 검증 ★ (채택)

YAML 과 Dart **둘 다 작성**. 개발자가 양쪽을 맞춰야 함. 단 CI 에서 `configure_app.dart --audit` 가 불일치 시 fail.

- **힘 A 만족**: YAML 이 "이 앱이 뭐 쓰는지" 선언적 요약.
- **힘 B 만족**: Dart 코드에서 생성자 · 파라미터 타입 체크.
- **힘 C 만족**: 코드 생성 파이프라인 없음. `dart run tool/configure_app.dart` 가 단일 명령.

## 결정

### 1. 선언 위치

**`app_kits.yaml`** — 활성 Kit 이름 + 설정 파라미터 (문자열 · 기본값 수준):

```yaml
# app_kits.yaml 발췌
kits:
  update_kit: {}
  backend_api_kit: {}
  auth_kit:
    providers:
      - email
      - google
      - apple
    two_factor_enabled: true
  file_kit: {}
  observability_kit: {}
  # local_db_kit:
  #   database_class: AppDatabase      # 주석 처리로 비활성
```

**`lib/main.dart`** — 같은 Kit 의 실제 생성자 호출 (install 순서는 의존성 순서라 YAML 나열 순서와 달라도 돼요):

```dart
// lib/main.dart 발췌 (UpdateKit 의 fetch 콜백 본문은 생략)
await AppKits.install([
  BackendApiKit(),
  AuthKit(
    providers: const {AuthProvider.email, AuthProvider.google, AuthProvider.apple},
    loginPath: Routes.login,
    twoFactorEnabled: true,                        // ← yaml 의 two_factor_enabled 와 짝
    twoFactorLoginPath: Routes.twoFactorLogin,
    twoFactorSettingsPath: Routes.twoFactorSettings,
  ),
  FileKit(),                                       // ← yaml 의 file_kit 와 짝
  UpdateKit(
    service: BackendAppUpdateService(() async { /* GET /app-version */ }),
  ),
  ObservabilityKit(),
]);
```

`NoUpdateAppUpdateService` 는 `appUpdateServiceProvider` 의 **기본값** 이지 `main.dart` 가 설치하는 구현체가 아니에요. 템플릿 기본 조립은 `BackendAppUpdateService` 를 쓰고, `backend_api_kit` 을 안 켜는 recipe 만 `NoUpdateAppUpdateService` 로 되돌려요.

<a id="2-각-kit-의-kit_manifestyaml"></a>

### 2. 각 Kit 의 `kit_manifest.yaml`

Kit 의 의존성 · 필요 플러그인을 선언:

```yaml
# lib/kits/auth_kit/kit_manifest.yaml
name: auth_kit
description: JWT 인증 + 소셜 로그인 (Google/Apple/Kakao/Naver) + 로그인 화면
dependencies:
  - sign_in_with_apple
  - google_sign_in
  - kakao_flutter_sdk_user
  - flutter_naver_login
  - flutter_secure_storage
requires:
  - backend_api_kit
```

<a id="3-검증-도구-configure_appdart"></a>

### 3. 검증 도구: `configure_app.dart`

```bash
# 현재 상태 리포트
dart run tool/configure_app.dart

# 예시 출력
=== Configure App ===
app.name  : Template App
app.slug  : template
palette   : DefaultPalette

--- Kits ---
  [x] auth_kit
  [x] backend_api_kit
  [x] observability_kit
  [x] update_kit
  [ ] ads_kit (available, not enabled)
  [ ] charts_kit (available, not enabled)
  [ ] local_db_kit (available, not enabled)
  ...

Status: OK
```

`--audit` 모드는 **이슈가 있으면 exit 1**:

```bash
dart run tool/configure_app.dart --audit

# 의존성 불일치 예시
--- Dependency Issues ---
  ✗ auth_kit requires backend_api_kit, which is not enabled
Status: ISSUES FOUND
$ echo $?
1
```

<a id="4-검증-로직-configure_appdart-내부"></a>

### 4. 검증 로직 (configure_app.dart 내부)

```dart
// tool/configure_app.dart 발췌
List<String> _enabledKitNames(Map<String, Object?> config) {
  final kits = config['kits'];
  if (kits is! Map<String, Object?>) return const [];
  return kits.keys.toList()..sort();
}

List<String> _discoverKits() {
  final dir = Directory('lib/kits');
  final names = <String>[];
  for (final entity in dir.listSync()) {
    if (entity is Directory) {
      final manifest = File('${entity.path}/kit_manifest.yaml');
      if (manifest.existsSync()) names.add(entity.path.split('/').last);
    }
  }
  return names..sort();
}

List<String> _validateDependencies(List<String> enabled) {
  final errors = <String>[];
  for (final kit in enabled) {
    final manifest = File('lib/kits/$kit/kit_manifest.yaml');
    if (!manifest.existsSync()) continue;
    final parsed = _parseYaml(manifest.readAsStringSync());
    final deps = _asStringList(parsed['requires']);
    for (final req in deps) {
      if (!enabled.contains(req)) {
        errors.add('$kit requires $req, which is not enabled');
      }
    }
  }
  return errors;
}
```

### 5. CI 통합

```yaml
# .github/workflows/ci.yml 발췌
jobs:
  analyze-and-test:
    steps:
      - uses: actions/checkout@v4
      - uses: subosito/flutter-action@v2
      - run: flutter pub get
      - run: dart run tool/configure_app.dart --audit   # ← 불일치 시 fail
      - run: flutter analyze
      - run: flutter test
```

### 설계 선택 포인트

**포인트 1 — YAML 은 "Kit 이름" 만, 파라미터는 Dart 에**  
`app_kits.yaml` 에 `auth_kit:` 옆에 `loginPath: /login` 같은 걸 넣지 않아요. YAML 파서가 파라미터 스키마를 알아야 하니 복잡. 대신 Dart 생성자 `AuthKit(loginPath: '/login')` 에서 타입 체크. YAML 은 활성화 플래그만.

**포인트 2 — `configure_app.dart` 는 단일 파일 Dart 스크립트**  
`pubspec.yaml` 에 별도 package 추가하지 않고 `tool/configure_app.dart` 하나로 해결. 자체 YAML 파서 (단순 subset) 까지 포함. 외부 의존 없음 → 유지보수 부담 최소.

**포인트 3 — `--audit` 는 CI 용 · 기본은 `--dry-run`**  
로컬 개발 중엔 "상태 리포트" 만 보고 싶음. exit 1 이 터지면 개발 흐름이 끊어져서 불편. CI 에만 `--audit` 플래그 부여. 로컬 개발자는 수동으로 Status: OK 확인.

**포인트 4 — `kit_manifest.yaml` 는 Kit 자체 소유**  
각 Kit 폴더 안에 자기 의존성을 선언. 템플릿 중앙 파일이 모든 의존을 알 필요 없음. Kit 추가 시 해당 폴더에 `kit_manifest.yaml` 추가로 등록. 탈중앙 구조.

## 이 선택이 가져온 것

### 긍정적 결과

YAML 은 선택한 구성을 읽는 선언으로, Dart 는 실제 객체와 타입을 조립하는 코드로 사용해요. configure audit 는 YAML 의 Kit 이름·의존성·지원 provider 를 검사해요. 이 조립 방식에 코드 생성이 필요하지 않다는 뜻이지, Drift 등 다른 기능의 코드 생성까지 없다는 뜻은 아니에요. recipe 를 복사한 뒤에도 Dart 조립을 맞춰야 해요.

### 부정적 결과

Kit 를 바꿀 때 YAML, Dart 설치 목록, import 를 함께 확인해야 해요. 도구는 프로젝트가 정한 선언 형식만 해석하므로 YAML 전체 문법이나 임의의 Dart 객체 구성을 지원하지 않아요. 로컬 훅과 CI 에서 audit 를 실행하되, Dart 설치 목록과의 차이는 별도로 검토해요.

## 교훈

<a id="교훈-1--자동화-와-수동--검증-은-다른-전략"></a>

### 교훈 1 — "자동화" 와 "수동 + 검증" 은 다른 전략

Kit 의 생성자에 객체와 콜백을 전달할 수 있도록 실제 조립은 Dart 에 남겼어요. YAML 로 모두 표현하려면 추가 스키마와 해석기가 필요해요. 현재 선택은 수동 조립과 선언 검사이며, 어느 자동화 방식보다 항상 낫다는 일반 규칙은 아니에요.

<a id="교훈-2--build_runner-는-비용"></a>

### 교훈 2 — `build_runner` 는 비용

코드 생성은 생성 결과와 실행 도구를 함께 관리해야 해요. 이 템플릿은 Kit 조립에는 사용하지 않고 Drift 처럼 필요한 곳에는 사용해요. 개발자 수나 임의의 시간 계산만으로 도입 여부를 정하지 않고 반복 작업과 유지 비용을 비교해요.

<a id="교훈-3--ci-검증은-경고-가-아니라-차단-이어야"></a>

### 교훈 3 — CI 검증은 "경고" 가 아니라 "차단" 이어야

`--audit` 는 문제가 있으면 실패 종료 코드로 알려 CI 검사를 실패시켜요. PR 머지 차단에는 해당 검사를 필수 상태 검사로 지정하는 저장소 설정도 필요해요.

## 관련 사례 (Prior Art)

- [NPM `package.json` vs `node_modules`](https://docs.npmjs.com/cli/v10/configuring-npm/package-json) — 선언 (package.json) + 실제 (node_modules) 이원화. `npm ci` 가 일치 검증
- [Cargo `Cargo.toml` vs `Cargo.lock`](https://doc.rust-lang.org/cargo/guide/cargo-toml-vs-cargo-lock.html) — 선언 · 락 파일 이원 관리
- [Gradle Version Catalog (`libs.versions.toml`)](https://docs.gradle.org/current/userguide/platforms.html) — TOML 선언 + Gradle 코드에서 참조
- [Terraform `.tfvars` + HCL](https://developer.hashicorp.com/terraform/language/values/variables) — 변수 선언 vs 실제 리소스
- [`template-spring 의 ADR-004 ArchUnit`](https://github.com/storkspear/template-spring/blob/main/docs/philosophy/adr-004-gradle-archunit.md) — 백엔드 템플릿의 "컨벤션을 기계가 강제" 철학 공유

## Code References

**검증 도구**
- [`tool/configure_app.dart`](https://github.com/storkspear/template-flutter/blob/main/tool/configure_app.dart) — 288줄 단일 Dart 스크립트
- [`.github/workflows/ci.yml`](https://github.com/storkspear/template-flutter/blob/main/.github/workflows/ci.yml) — `--audit` 호출 지점

**선언 파일**
- [`app_kits.yaml`](https://github.com/storkspear/template-flutter/blob/main/app_kits.yaml) — 루트의 활성 Kit 선언
- [`lib/main.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/main.dart) — `AppKits.install([...])` 생성자 호출
- Kit 별 `kit_manifest.yaml` — 각 Kit 폴더 (예: `lib/kits/auth_kit/kit_manifest.yaml`)

**Recipe 샘플**
- [`recipes/local-only-tracker.yaml`](https://github.com/storkspear/template-flutter/blob/main/recipes/local-only-tracker.yaml)
- [`recipes/backend-auth-app.yaml`](https://github.com/storkspear/template-flutter/blob/main/recipes/backend-auth-app.yaml)

**관련 ADR**:
- [`ADR-003 · FeatureKit 동적 레지스트리`](./adr-003-featurekit-registry.md) — 두 곳 선언이 필요한 원인
- [`ADR-021 · Multi-Recipe 구성`](./adr-021-multi-recipe.md) — `app_kits.yaml` 포맷이 recipe 와 일치
- [`ADR-019 · 솔로 친화적 운영`](./adr-019-solo-friendly.md) — 자동화보다 "수동 + 검증" 이 솔로에 적합한 이유
