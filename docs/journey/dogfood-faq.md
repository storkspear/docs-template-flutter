# Dogfood FAQ

파생 레포를 만들고 개발할 때 자주 확인하는 내용을 모았어요.

> 오류 메시지나 증상으로 해결 방법을 찾으려면 [Pitfalls](./dogfood-pitfalls.md) 를 보세요.

---

## 기본

### Q. 이 템플릿을 어떻게 복제하나요?

**A.** GitHub 의 **"Use this template"** 버튼을 사용해주세요. 히스토리가 끊긴 독립 레포가 생성돼요. 근거: [`ADR-001`](../philosophy/adr-001-template-cherry-pick.md).

### Q. 템플릿 업데이트를 어떻게 가져오나요?

**A.** 필요한 변경을 골라 수동으로 cherry-pick 해요. 충돌 확인과 검증 절차는 [Migration from Template](../reference/migration-from-template.md) 에 정리되어 있어요.

### Q. 왜 Kit 이 나눠져 있나요?

**A.** 앱마다 필요한 기능이 달라서예요. Kit 를 선택해 조립하면 사용할 기능과 초기화 범위를 드러낼 수 있어요. 다만 Kit 비활성화만으로 native SDK 가 바이너리에서 제거되지는 않아요. 의존성 제거 범위도 함께 확인해야 해요. [ADR-003](../philosophy/adr-003-featurekit-registry.md) 에서 배경을 설명해요.

### Q. `<repo> local init` 과 `<repo> dev init` 차이가 뭐예요?

**A.** 셋업 깊이가 달라요.

| verb | 하는 일 | 외부 자격 필요 |
|---|---|---|
| `local init` | rename + `.env` + `flutter pub get` | node 18+ · gh CLI 로그인 (prereq 검증) — 백엔드/Firebase 는 불필요 |
| `dev init` | Firebase dev project 생성 + iOS/Android 앱 등록 + plist/json 다운 + link-oauth | `firebase login` 1회 |
| `prod init` | 동일 흐름의 prod (별도 Firebase project) | 동일 |

`local start` 의 mock 폴백 조건을 만족하면 `dev init` 없이 인증 흐름을 시연할 수 있어요. 실제 Google 로그인을 확인할 때 Firebase 와 OAuth 설정을 진행해요.

<a id="q-dev--prod-별-bundle-id-가-다르게-떨어지는-메커니즘이"></a>

### Q. dev / prod 별 Bundle ID 가 다르게 떨어지는 메커니즘이?

**A.** iOS 는 `BUNDLE_ID_BASE` 에 환경별 `BUNDLE_ID_SUFFIX` 를 붙여요. dev suffix 는 `.dev`, prod 는 빈 값이에요. Xcode 는 이 값으로 `PRODUCT_BUNDLE_IDENTIFIER` 를 만들고, Android 는 dev flavor 의 `applicationIdSuffix = ".dev"` 로 같은 구분을 해요. 자세한 구성은 [환경 분리 인프라](./architecture.md#환경-분리-인프라-devprod-flavor) 에서 확인해요.

### Q. `<repo> dev link-oauth` 가 secrets 파일을 만든다는데 어디인가요?

**A.** `ios/Flutter/AppEnv-secrets-dev.xcconfig` 에 기록해요. dev plist 의 `CLIENT_ID` 와 `REVERSED_CLIENT_ID` 를 복사하며, `AppEnv-dev.xcconfig` 가 이 파일을 선택적으로 포함해요. 기본 `.gitignore` 에 포함되어 일반적인 `git status` 에는 나타나지 않지만, 강제 추가나 다른 경로로 복사한 파일까지 보호하는 것은 아니에요.

---

## 아키텍처

### Q. `core/`, `kits/`, `common/`, `features/` 차이가 뭐예요?

**A.**
- `core/` — 모든 앱 필수 기반 (테마 · 저장소 · 위젯)
- `kits/` — 선택 15개 (인증 · 알림 · 차트 · 결제 등)
- `common/` — 여러 Kit 조립 지점 (DI · 라우터 · 스플래시)
- `features/` — 파생 레포 도메인 영역 (템플릿은 스텁)

자세한 건 [`ADR-002`](../philosophy/adr-002-layered-modules.md).

### Q. 왜 `common/` 에 DI 가 있나요? Kit 이 Provider 를 기여하는 거 아닌가요?

**A.** Kit 는 자기 기능의 Provider 와 override 를 제공하고, `common/providers.dart` 는 여러 Kit 를 연결해요. 예를 들어 ApiClient 와 AuthService 의 콜백 연결을 여기서 조립해요. 화면에만 필요한 Provider 는 해당 feature 에 둘 수 있어요.

### Q. ViewModel 이 다른 ViewModel 을 쓸 수 있나요?

**A.** 권장하지 않아요. ViewModel 은 **Screen-local 상태**예요. 공유 상태는 Service (Kit 레벨) 로 올려서 두 ViewModel 이 같은 Service 를 참조하게 해주세요.

---

## 네트워크

### Q. 401 을 ViewModel 이 직접 처리해야 하나요?

**A.** 토큰 갱신과 재시도는 `AuthInterceptor` 와 `AuthService` 가 담당해요. 갱신 토큰이 거절되면 AuthService 가 로컬 세션을 정리하지만, 네트워크·서버 장애에는 토큰을 보존해요. 따라서 ViewModel 에 전달된 401 만 보고 무조건 `signOut()` 하면 이 구분을 깨뜨릴 수 있어요. [ADR-010](../philosophy/adr-010-queued-interceptor.md) 을 참고해요.

### Q. 왜 서버 응답이 `{data, error}` 구조인가요?

**A.** 성공 데이터와 오류 정보를 구분해 처리하기 위해서예요. 실제 JSON 에서 null 필드는 생략될 수 있어요. 응답 예시와 빈 응답 처리는 [ADR-009](../philosophy/adr-009-backend-contract.md) 와 API 계약 문서에서 확인해요.

<a id="q-snake_case-json-도-지원하나요"></a>

### Q. `snake_case` JSON 도 지원하나요?

**A.** 지원하지 않아요. 백엔드 · 프론트 둘 다 **camelCase** 로 고정돼 있어요. 짝 `template-spring` 이 Jackson 기본값 camelCase 로 직렬화해요.

<a id="q-graphql--trpc-로-바꾸고-싶어요"></a>

### Q. GraphQL · tRPC 로 바꾸고 싶어요.

**A.** 가능하지만 템플릿이 지원하지 않아요. 파생 레포에서 자체 통합이 필요해요. 이 경우 `backend_api_kit` 대신 새 Kit 을 만들고, 에러 처리 · 인터셉터 패턴을 자체 설계해야 해요.

---

## 인증

### Q. 같은 이메일로 여러 앱에 가입할 수 있나요?

**A.** 네. 계정은 앱 단위로 구분하므로 같은 이메일을 써도 앱 A 와 B 에서는 별개 계정이에요. 백엔드의 데이터 배치와 JWT `appSlug` 검증은 [ADR-012](../philosophy/adr-012-per-app-user.md) 에서 확인해요.

### Q. 통합 계정 (한 번 가입하면 모든 앱 로그인) 가능한가요?

**A.** 기본 설계는 앱별 독립 계정이에요. 통합 계정이 필요하면 백엔드의 계정 범위와 권한 모델을 별도로 설계해야 해요. 여러 앱의 변경과 운영이 서로 연결되므로 현재 앱 공장 구조에서는 권장하지 않아요.

### Q. 소셜 로그인 중 하나 (예: Google 만) 만 쓸 수 있나요?

**A.** 가능해요. `app_kits.yaml` 과 `AuthKit(providers: ...)` 에 사용할 provider 를 맞춰 지정해요. 로그인 버튼을 숨기는 것과 관련 SDK 의존성을 제거하는 것은 별도 작업이에요.

<a id="q-이메일-인증--비번-재설정은-어떻게"></a>

### Q. 이메일 인증 · 비번 재설정은 어떻게?

**A.** `auth_kit` 이 `/verify-email` 과 `/forgot-password` 화면을 제공해요. 실제 인증 메일과 비밀번호 재설정은 대응하는 백엔드 엔드포인트와 발송 설정이 준비되어 있어야 해요.

---

## Kit

### Q. 새 Kit 을 추가하려면?

**A.**
1. `lib/kits/<kit_name>/` 폴더 생성
2. `kit_manifest.yaml` · `<kit_name>.dart` 작성
3. `app_kits.yaml` · `main.dart` 활성화
4. `configure_app.dart` 검증

작은 Kit 의 구조를 참고하되 필요한 계약만 구현해요. 전체 인터페이스는 [FeatureKit Contract](../architecture/featurekit-contract.md) 에서 확인해요.

### Q. Kit 은 꼭 AppKit 을 extends 해야 하나요?

**A.** `AppKits.install` 에 전달할 객체는 `AppKit` 계약을 충족해야 해요. 기존 Kit 처럼 `extends AppKit` 을 사용하면 기본 구현을 물려받아 필요한 메서드만 재정의할 수 있어요.

### Q. Kit 간 공유 상태가 있어요. 어떻게 하나요?

**A.** 두 Kit 가 함께 참조할 Service 로 상태를 옮길 수 있어요. 여러 Kit 를 연결하는 Provider 는 `common/providers.dart` 에서 조립하고, Kit 간 의존 방향도 확인해요.

---

## 상태 관리

<a id="q-viewmodel-이-notifier-네요--statenotifier-는-왜-안-쓰나요"></a>

### Q. ViewModel 이 `Notifier` 네요 — `StateNotifier` 는 왜 안 쓰나요?

**A.** 이 프로젝트는 ViewModel 을 `Notifier` 와 `NotifierProvider` 로 작성해요. `StateNotifier` 가 Riverpod 3 에서 완전히 사라졌기 때문이라는 설명은 맞지 않아요. 템플릿의 선택과 사용 패턴은 [ADR-005](../philosophy/adr-005-riverpod-mvvm.md) 에서 확인해요.

### Q. BLoC 이나 GetX 로 바꿔도 되나요?

**A.** 가능하지만 ViewModel, Provider 조립, 테스트, 규약이 Riverpod 를 기준으로 작성되어 있어요. 다른 상태 관리 도구로 바꾸면 이 범위를 함께 수정해야 하므로, 혼자 운영할 때는 현재 구성을 유지하는 편을 권장해요.

### Q. Provider 가 너무 많아져서 어떻게 관리하나요?

**A.** Kit 내부 Provider 는 `lib/kits/<kit>/<kit>_providers.dart`, 도메인별 Provider 는 `lib/features/<domain>/providers.dart` 처럼 역할에 맞춰 모아요. `common/providers.dart` 에는 앱 전체에서 공유하거나 여러 Kit 를 연결하는 Provider 를 둬요.

---

<a id="ui--테마"></a>

## UI · 테마

### Q. 앱 색상을 바꾸려면?

**A.** `AppPalette` 를 extends 한 클래스 정의 + `seed` 색상만 지정. 나머지 Material 3 스키마 자동. [`ADR-015`](../philosophy/adr-015-palette-registry.md).

```dart
class MyPalette extends AppPalette {
  @override String get id => 'my-palette';
  @override String get name => 'My App';
  @override Color get seed => const Color(0xFFFF6B35);
}
```

### Q. 다크모드 지원 자동인가요?

**A.** 현재 `App` 은 `AppTheme.dark()` 를 `MaterialApp.darkTheme` 에 연결하고, 테마는 팔레트의 `darkScheme()` 을 사용해요. `supportsDarkMode` 속성은 선언되어 있지만 현재 조립 코드에서 조건으로 읽지 않으므로, 값을 바꾸는 것만으로 다크 모드가 꺼지지는 않아요.

### Q. 폰트를 바꾸려면?

**A.** **폰트 패밀리 교체**는 `AppTypeface` 를 extends 한 클래스를 만든 뒤 `AppTypefaceRegistry.install(MyTypeface())` 로 등록해주세요. `pubspec.yaml` 의 `fonts:` + `assets/fonts/` 자산 등록도 필요해요. **텍스트 스타일 토큰**(headline/body/caption 등)은 `AppTypography` 에서 다루고, `Theme.of(context).textTheme` 에 반영돼요.

### Q. 스플래시 화면을 커스텀하려면?

**A.** native 스플래시는 `flutter_native_splash.yaml` 을 수정한 뒤 자산 재생성 스크립트를 실행해요. Flutter 화면의 로딩 UI 를 바꾸려면 해당 화면에서 사용하는 `LoadingView` 또는 로딩 위젯을 수정해요.

---

## i18n

### Q. 한국어만 쓸 건데 i18n 꼭 해야 해요?

**A.** 이 템플릿은 처음부터 문자열을 ARB 로 분리해요. 나중에 언어를 추가할 때 화면에 흩어진 문자열을 다시 찾는 작업을 줄이기 위해서예요. 필요한 작업량은 앱 규모에 따라 달라요. [ADR-016](../philosophy/adr-016-i18n-from-start.md) 에서 배경을 설명해요.

### Q. ViewModel 에서 번역 문자열을 쓸 수 있나요?

**A.** 안 돼요. ViewModel 은 `BuildContext` 가 없어 `S.of(context)` 접근이 불가해요. **code 만 state 에 저장** 하고, Screen 에서 번역해요.

### Q. 새 언어 추가는 어떻게?

**A.** `lib/core/i18n/app_<locale>.arb` 를 추가하고 메시지와 placeholder 를 번역한 뒤 `flutter gen-l10n` 을 실행해요. 생성된 지원 언어와 날짜·숫자 형식, 화면 길이를 확인해요. 현재 키 일치 테스트는 ko/en 을 비교하므로 새 언어도 검사하려면 테스트 범위를 늘려야 해요.

---

## 테스트

### Q. 모든 Kit 에 대해 계약 테스트를 써야 하나요?

**A.** 아니요. 핵심 Kit (`auth_kit` · `backend_api_kit` · `payment_kit` · `file_kit`) 의 `{kit_name}_contract_test.dart` 를 우선하고, 메타가 단순한 Kit 은 통합 테스트로 흡수해요. 정책: [`Testing Strategy`](../testing/testing-strategy.md), 작성법: [`Contract Testing`](../testing/contract-testing.md).

### Q. ViewModel 테스트에 Kit 설치 필요한가요?

**A.** 대부분은 `ProviderContainer(overrides: [...])` 로 의존성을 대체할 수 있어요. 다만 테스트 대상이 AppKits 전역 상태나 Kit 조립을 직접 사용한다면 설치와 초기화도 필요해요. autoDispose Provider 의 수명은 listener 로 유지해요.

### Q. Golden 이미지 테스트 필요한가요?

**A.** 권장하지 않아요 (유지 비용이 커요). 복잡한 UI 만 선택적으로 써요. 대부분은 위젯 테스트로 충분해요.

---

## 배포

<a id="q-android--ios-동시-배포-가능한가요"></a>

### Q. Android · iOS 동시 배포 가능한가요?

**A.** 현재는 Android 만 GHA 자동 배포(`release-android.yml` — `git tag v*` 트리거). iOS 워크플로우는 미구현이라 fastlane 수동 또는 Xcode Archive 로 TestFlight 업로드해요. 향후 iOS 워크플로우가 추가되면 동시 배포가 됩니다 (단 GHA 의 `macos-latest` 는 비용이 높아 트리거 정책 설계 필요).

### Q. Play Console 에 최초 업로드는 수동이에요?

**A.** 네. Play Console API 는 **이미 존재하는 앱에만** 업로드 가능. 최초 1번은 Play Console 웹에서 AAB 직접 업로드 + 내부 테스트 track 릴리스.

### Q. Sentry 심볼 업로드 실패하면 어떻게?

**A.** 원래 함수명과 위치를 복원하기 어려워져요. 실패한 업로드를 다시 시도할 때는 문제가 발생한 빌드와 같은 심볼을 사용해요.

```bash
npx @sentry/cli upload-dif --org $ORG --project $PROJECT build/symbols
```

---

## 운영

### Q. 앱 10개 운영하는데 Sentry 프로젝트도 10개인가요?

**A.** 이 템플릿은 앱별로 관측성 설정을 분리해 운영하는 방식을 전제로 해요. Sentry 와 PostHog 프로젝트를 나누면 앱별 데이터를 구분하기 쉬워요. 프로젝트 수가 늘어날 때 대시보드와 알림을 관리할 시간도 함께 고려해요.

### Q. 백엔드가 꺼지면 앱이 안 돼요. 어떻게?

**A.** 네트워크 실패 시 보여줄 상태를 정해야 해요. `CachedRepository.fetch(policy: CachePolicy.networkFirst, ...)` 는 사용할 수 있는 캐시가 있을 때 이를 반환하지만, 캐시가 없거나 만료되면 실패를 전달해요. 장기 오프라인 사용이 필요하면 `local_db_kit` 과 동기화 정책을 별도로 설계해요. 서버가 필요 없는 앱은 로컬 전용 recipe 를 선택할 수 있어요.

---

## 기타

<a id="q-flutter-말고-react-native--swift--kotlin-으로-바꿔도-되나요"></a>

### Q. Flutter 말고 React Native · Swift · Kotlin 으로 바꿔도 되나요?

**A.** 이 템플릿은 Flutter 전용이에요. 다른 프레임워크를 쓰려면 클라이언트를 별도로 구성해야 해요. 백엔드 API 계약을 지키면 `template-spring` 은 계속 사용할 수 있어요.

<a id="q-웹--데스크톱-지원"></a>

### Q. 웹 · 데스크톱 지원?

**A.** 현재 지원 범위는 Android 와 iOS 예요. 웹·데스크톱에 적용하려면 인증서 핀닝, 보안 저장소, 푸시 등 사용 중인 플러그인과 플랫폼별 구현을 따로 검증해야 해요.

### Q. 기여하고 싶어요.

**A.** 템플릿 레포에 PR 을 만들어요. 특정 앱·회사 이름이나 자격증명을 넣지 않는 템플릿 중립성 규칙을 지켜주세요.

---

## 관련 문서

- [`Pitfalls`](./dogfood-pitfalls.md) — 증상별 트러블슈팅
- [`Philosophy 인덱스`](../philosophy/README.md) — 설계 결정 배경
- [`Conventions Overview`](../conventions/README.md) — 코딩 규약
- [`Features 인덱스`](../features/README.md) — Kit 상세
