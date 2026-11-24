# Boot Sequence

이 문서는 앱 시작 시 실행되는 **전체 순서도** 를 다뤄요 — `main()` 부터 첫 화면 표시까지예요. 근거는 [`ADR-008 · 부팅 단계 추상화`](../philosophy/adr-008-boot-step.md) 에 있어요.

---

## 전체 흐름

```text
┌─────────────────────────────────────────┐
│  main() 진입                              │
└──────────────────┬──────────────────────┘
                   │
                   ▼
1. WidgetsFlutterBinding.ensureInitialized()
                 │
                 ▼
2. AppPaletteRegistry.install(DefaultPalette())
   AppTypefaceRegistry.install(DefaultTypeface())
                 │
                 ▼
3. PackageInfo.fromPlatform()  (appVersion 추출)
                 │
                 ▼
4. AppConfig.init(
     appSlug: 'template',
     baseUrl: 'http://localhost:8081',
     environment: Environment.dev,
     ...
   )
                 │
                 ▼
    ┌────────────────────────────┐
    │ ObservabilityEnv             │
    │   .isSentryEnabled?          │
    │ (Sentry DSN 주입 여부)        │
    └────────┬───────────┬────────┘
             │           │
      DSN 있음        DSN 없음
             │           │
             ▼           ▼
  ┌──────────────┐  ┌──────────┐
  │ SentryFlutter│  │ 직접      │
  │   .init(     │  │_bootstrap│
  │  appRunner:  │  │   ()     │
  │  _bootstrap) │  └────┬─────┘
  └──────┬───────┘       │
         │               │
         └───────┬───────┘
                 ▼
      ┌────────────────────┐
      │   _bootstrap()      │
      └──────────┬──────────┘
                 │
                 ▼
5. PrefsStorage().init()   (SharedPreferences 초기화)
                 │
                 ▼
5-b. ApiClient.onUpgradeRequired = ...
     (426/CMN_010 → forceUpdateInfoNotifier)
                 │
                 ▼
6. AppKits.install([
     BackendApiKit(),
     AuthKit(providers: {...}, loginPath: ..., twoFactorEnabled: true, ...),
     FileKit(),
     UpdateKit(service: BackendAppUpdateService(...)),
     ObservabilityKit(),
   ])
   │
   ├─ 중복 타입 검증
   ├─ requires 의존성 검증
   ├─ 각 Kit.onInit() 순서대로
   └─ 실패 시 역순 rollback
                 │
                 ▼
7. ProviderContainer 생성
   container = ProviderContainer(
     overrides: [
       ...AppKits.allProviderOverrides,     // Kit 이 기여
       prefsStorageProvider.overrideWithValue(prefsStorage),
     ],
   )
                 │
                 ▼
8. AppKits.attachContainer(container)
   (이제 bootSteps · refreshListenable 이 container.read 가능)
                 │
                 ▼
9. CrashService 초기화
   container.read(crashServiceProvider).init()
   (ObservabilityKit 활성 + SENTRY_DSN 주입 → SentryCrashService)
   (그 외 → DebugCrashService)
                 │
                 ▼
10. SplashController(steps: AppKits.allBootSteps).run()
   │
   ├─ AuthKit 이 기여한 AuthCheckStep → authService.checkAuthStatus()
   │    │
   │    ├─ tokenStorage.repairIfPartial()     (반쪽 상태 복구)
   │    ├─ tokenStorage.hasTokens()
   │    │   ├─ true  → access token 로컬 JWT 파싱 (서버 호출 없음)
   │    │   │          ├─ 파싱 성공 → authState.emit(authenticated)
   │    │   │          └─ 만료·파싱 실패 → refreshToken() 시도
   │    │   │               ├─ 성공 → authenticated
   │    │   │               ├─ 서버 거절(ATH_002/ATH_003/401) → 토큰 삭제 → unauthenticated
   │    │   │               └─ 거절 외 실패(오프라인·5xx 등) → 토큰 보존
   │    │   │                    ├─ 만료 토큰에서 사용자 파싱 가능 → authenticated 유지
   │    │   │                    └─ 파싱 불가 → unauthenticated (토큰은 보존)
   │    │   └─ false → authState.emit(unauthenticated)
   │    
   ├─ AuthKit의 ActivityPingStep
   │    └─ 활동 ping 초기화와 포그라운드 복귀 관찰
   │
   ├─ UpdateKit의 _ForceUpdateStep
   │    └─ service.init() → check() → 업데이트 정보가 있으면 notifier 갱신
   │         (강제·경고 UI는 _ForceUpdateGate가 구분)
   │
   ├─ ObservabilityKit의 _PostHogInitStep
   │    └─ POSTHOG_KEY가 있으면 PostHog 초기화
   │
   └─ (기타 활성 Kit 의 BootStep)
                 │
                 ▼
   SplashResult 반환
   │
   ├─ status: ready → 계속 진행
   └─ status: error → crashService.reportError (non-fatal) + 계속 진행
                 │
                 ▼
11. runApp(
      UncontrolledProviderScope(
        container: container,
        child: const App(),
      )
    )
                 │
                 ▼
    App (MaterialApp.router)
        │
        ├─ AnimatedBuilder (Listenable.merge([Palette, Typeface]) 구독)
        ├─ MaterialApp.router (AppRouter.router)
        │    │
        │    ├─ initialLocation: /splash
        │    ├─ refreshListenable: AppKits.compositeRefreshListenable
        │    └─ redirect: _composedRedirect
        │         │
        │         ├─ 우선순위 정렬된 redirectRules 순회
        │         ├─ 첫 non-null 반환값 = 리다이렉트
        │         │   (실제 규칙을 반환하는 AuthKit → OnboardingKit 등)
        │         └─ 모두 null → 기본 로직 (splash → home)
        │
        └─ 첫 화면 렌더링
```

---

## 단계별 설명

<a id="1-flutter-바인딩--팔레트--설정-main-본문"></a>

### 1. Flutter 바인딩 · 팔레트 · 설정 (main 본문)

`main()` 본문에서 Sentry 래핑보다 **먼저** 실행돼요:
- 바인딩을 먼저 해요 (기타 `Platform.` 호출의 전제)
- 팔레트/타이페이스를 install 해요 (MaterialApp 이 구독할 Listenable)
- AppConfig.init 을 해요 — Sentry options 람다가 `AppConfig.instance` 를 읽으므로 Sentry 래핑보다 먼저예요

### 2. Sentry 래핑

DSN이 설정돼 있으면 `SentryFlutter.init(..., appRunner: _bootstrap)`으로 부팅을 실행하고, 없으면 `_bootstrap()`을 직접 호출해요. PrefsStorage 초기화 이후 단계는 이 함수 안에서 실행돼요. 바인딩·팔레트·패키지 버전 조회·AppConfig 초기화는 Sentry를 시작하기 전이므로, 앱 시작 중 발생하는 모든 오류가 Sentry에 보고된다고 보지는 않아요.

### 3. Kit 설치

각 Kit의 `onInit`을 설치 순서대로 실행해요. `BackendApiKit`은 이름만 선언하며, `ApiClient`는 `common/providers.dart`의 provider를 처음 읽을 때 생성돼요.

`ApiClient.onUpgradeRequired` 글루(5-b)는 install 보다 **먼저** 실행돼요 — `backend_api_kit` 은 `update_kit` 을 모르고(kit 간 디커플링), 두 kit 을 엮는 유일한 지점이 `main.dart` 라서 조립 이전에 정적 훅부터 걸어 둬요.

<a id="4-providercontainer--attachcontainer"></a>

### 4. ProviderContainer + attachContainer

ADR-003 의 3단계 패턴:
- `install` (Kit 등록 + onInit)
- `ProviderContainer` 생성 (모든 override 수집)
- `attachContainer` (bootSteps 에게 container 노출)

container를 연결하기 전에 `AppKits.container`를 읽으면 `StateError`가 나요. `maybeContainer`를 사용하는 Kit은 단계나 listener를 생략할 수도 있으므로 예외 발생 여부만으로 순서를 확인하지 않아요.

### 5. BootStep 실행

`SplashController.run()`은 각 단계를 순서대로 기다려요. 한 단계가 예외를 던지면 남은 단계는 실행하지 않고 오류 결과를 반환해요. `main.dart`는 그 오류를 보고한 뒤 앱 실행을 이어가요. `AuthCheckStep`처럼 내부에서 실패를 처리하는 단계는 이 중단 경로와 구분해요.

### 6. runApp

`UncontrolledProviderScope` 로 외부에서 만든 container 를 Flutter 트리에 주입해요.

### 7. 첫 리다이렉트

라우터는 `/splash`에서 시작하면서 redirect를 평가해요. AuthKit은 현재 인증 상태를 직접 읽어 미인증이면 `/login`, 인증 상태이면 기본 homePath `/`로 안내해요. 이후 인증 상태가 바뀌면 `_AuthRefreshBridge`가 redirect 재평가를 요청해요. 이 bridge가 생성 직후 초기 알림을 보내는 것은 아니에요. 모든 규칙이 개입하지 않고 `/splash`에 남으면 라우터의 기본 규칙이 홈으로 보내요.

---

## 에러 처리

각 단계별 실패 대응:

| 단계 | 실패 시 |
|------|--------|
| Sentry 분기 | DSN 미주입 시 plain `_bootstrap()` 으로 계속 (Sentry 없이). DSN 있을 때 `SentryFlutter.init` 자체엔 try/catch 없음 — 실패 시 전파 |
| AppKits.install | rollback 후 throw — 앱 시작 불가 (치명) |
| BootStep 실행 | 오류 결과를 반환하고 남은 단계를 생략해요. main.dart는 오류 보고가 끝나면 앱 실행을 이어가요. 보고 호출의 예외를 따로 처리하지는 않아요. |
| Flutter 화면 실행 | 프레임워크 오류 처리와 설치된 관측성 설정을 따라요. 모든 오류를 복구하거나 앱 실행을 보장하는 단계는 아니에요 |

---

## 코드 참조

- [`lib/main.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/main.dart) — 전체 부팅 코드
- [`lib/app.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/app.dart) — MaterialApp 구성
- [`lib/common/splash/splash_controller.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/common/splash/splash_controller.dart)
- [`lib/core/kits/app_kits.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/core/kits/app_kits.dart) — install · attachContainer

---

## 관련 문서

- [`ADR-008 · BootStep`](../philosophy/adr-008-boot-step.md)
- [`ADR-003 · FeatureKit`](../philosophy/adr-003-featurekit-registry.md)
- [`featurekit-contract.md`](./featurekit-contract.md)
- [`observability_kit`](../features/observability-kit.md) — Sentry 래핑 조건
