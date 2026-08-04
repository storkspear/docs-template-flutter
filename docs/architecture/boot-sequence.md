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
   │    │   │          └─ 파싱 실패 → refreshToken() 시도, 실패 시 unauthenticated
   │    │   └─ false → authState.emit(unauthenticated)
   │    
   ├─ ObservabilityKit 의 _PostHogInitStep
   │    └─ PostHog SDK 초기화 (POSTHOG_KEY 주입 시)
   │
   ├─ UpdateKit 의 _ForceUpdateStep
   │    └─ service.init() → check() → null 아니면 forceUpdateInfoNotifier 갱신(isForce 로 강제/경고 분기는 UI 몫)
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
        │         │   (UpdateKit → AuthKit → OnboardingKit → ...)
        │         └─ 모두 null → 기본 로직 (splash → home)
        │
        └─ 첫 화면 렌더링
```

---

## 단계별 설명

### 1. Flutter 바인딩 · 팔레트 · 설정 (main 본문)

`main()` 본문에서 Sentry 래핑보다 **먼저** 실행돼요:
- 바인딩을 먼저 해요 (기타 `Platform.` 호출의 전제)
- 팔레트/타이페이스를 install 해요 (MaterialApp 이 구독할 Listenable)
- AppConfig.init 을 해요 — Sentry options 람다가 `AppConfig.instance` 를 읽으므로 Sentry 래핑보다 먼저예요

### 2. Sentry 래핑

`ObservabilityEnv.isSentryEnabled` 를 확인해요. DSN 이 주입되어 있으면 `SentryFlutter.init(..., appRunner: _bootstrap)` 이 내부적으로 `runZonedGuarded` 를 세팅해서 **비동기 에러까지 자동 포착돼요**. 미주입 시 `_bootstrap()` 을 직접 호출해요. 이후 단계(PrefsStorage·Kit 설치·container·splash)는 모두 `_bootstrap()` 안에서 실행돼요. (PrefsStorage 는 Provider override 로 주입되므로 container 생성 전이에요.)

### 3. Kit 설치

여기서 각 Kit 의 `onInit` 이 실행돼요. 예를 들어 `BackendApiKit.onInit` 은 Dio 인스턴스를 생성해요.

`ApiClient.onUpgradeRequired` 글루(5-b)는 install 보다 **먼저** 실행돼요 — `backend_api_kit` 은 `update_kit` 을 모르고(kit 간 디커플링), 두 kit 을 엮는 유일한 지점이 `main.dart` 라서 조립 이전에 정적 훅부터 걸어 둬요.

### 4. ProviderContainer + attachContainer

ADR-003 의 3단계 패턴:
- `install` (Kit 등록 + onInit)
- `ProviderContainer` 생성 (모든 override 수집)
- `attachContainer` (bootSteps 에게 container 노출)

순서가 깨지면 런타임 StateError 가 나요.

### 5. BootStep 실행

`SplashController.run()` 이 각 step 을 순차로 `await` 해요. 한 step 이 실패해도 앱은 계속 진행돼요 — graceful degradation 이에요.

### 6. runApp

`UncontrolledProviderScope` 로 외부에서 만든 container 를 Flutter 트리에 주입해요.

### 7. 첫 리다이렉트

initialLocation `/splash` → refreshListenable 이 곧 초기 notify → `_composedRedirect` 실행 → AuthKit rule 이 상태에 따라 `/` (homePath 기본값) 또는 `/login` 을 반환해 이동해요.

---

## 에러 처리

각 단계별 실패 대응:

| 단계 | 실패 시 |
|------|--------|
| Sentry 분기 | DSN 미주입 시 plain `_bootstrap()` 으로 계속 (Sentry 없이). DSN 있을 때 `SentryFlutter.init` 자체엔 try/catch 없음 — 실패 시 전파 |
| AppKits.install | rollback 후 throw — 앱 시작 불가 (치명) |
| BootStep 실행 | Result.error 반환 + crashService 리포트, 앱 계속 |
| runApp | Flutter 프레임워크가 자체 처리 |

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
