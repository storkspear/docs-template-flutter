# Testing Strategy

이 문서는 5 레이어 테스트 전략 — **Unit · Kit 계약 · 조립 통합 · 마이그레이션 지문 · 백엔드 계약 스냅샷** — 을 정리해요. 각 레이어는 검증 대상이 다르고, 도구도 달라요. Kit 계약 테스트의 상세 패턴은 [`contract-testing.md`](./contract-testing.md) 를 참조하세요.

---

## 레이어 개요

```text
┌─────────────────────────────────────────┐
│  1. Unit (가장 많음)                       │
│     Service · ViewModel · Util · Widget   │
│     → AppKits.install 없이 실행            │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  2. Kit 계약                              │
│     {kit}_contract_test.dart              │
│     → Kit 의 불변 속성 (requires 등)        │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  3. 조립 통합                              │
│     main_assembly_test.dart               │
│     → 실제 main.dart 흐름 재현             │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  4. 마이그레이션 지문                       │
│     Drift 스키마 변경 자동 감지             │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  5. 백엔드 계약 스냅샷                      │
│     contract_test.dart                    │
│     → 클라 참조 ⊆ contract-snapshot.json  │
└─────────────────────────────────────────┘
```

---

## 1. Unit

### Service (가장 단순)

가짜 `HttpClientAdapter`(`MockDioAdapter`)를 **실제 `ApiClient`/Dio 에 주입**해요. 별도 fake 서비스를 만들지 않고 진짜 인터셉터·파싱 경로를 태우는 게 이 레포 컨벤션이에요. 조립은 `test/helpers/auth_test_harness.dart`(`buildAuthTestHarness`)가 한 번에 해줘요.

```dart
void main() {
  group('AuthService', () {
    late MockDioAdapter adapter;
    late AuthStateNotifier authState;
    late AuthService service;

    setUp(() {
      // 스토리지·상태·ApiClient(+MockDioAdapter)·AuthService 를 한 번에 조립.
      final h = buildAuthTestHarness(onTokenRefresh: () async => false);
      adapter = h.adapter;
      authState = h.authState;
      service = h.authService;
    });

    tearDown(() {
      authState.dispose();
      AppConfig.resetForTest();
    });

    test('signIn succeeds with valid credentials', () async {
      adapter.onPost(
        '/auth/email/signin',
        MockResponse.ok({
          'data': {
            'user': {'id': 42, 'email': 'x@y.com', 'emailVerified': true},
            'tokens': {'accessToken': 'a', 'refreshToken': 'r'},
          },
          'error': null,
        }),
      );

      await service.signInWithEmail(email: 'x@y.com', password: 'pw');

      expect(authState.current.isAuthenticated, true);
    });
  });
}
```

### ViewModel (ProviderContainer 필요)

이 레포엔 mockito·mocktail 이 없어요 (`pubspec.yaml` dev_dependencies 확인). `implements` + `noSuchMethod` 로 손수 fake 를 쓰는 게 컨벤션이에요 — `login_view_model_test.dart` · `two_factor_view_model_test.dart` 가 실물 예시예요.

```dart
class _FakeAuthService implements AuthService {
  Object? throwOnSignIn;

  @override
  Future<String?> signInWithEmail({
    required String email,
    required String password,
  }) async {
    if (throwOnSignIn != null) throw throwOnSignIn!;
    return null;
  }

  // 나머지 메서드는 이 테스트가 안 쓰므로 noSuchMethod 로 위임.
  @override
  dynamic noSuchMethod(Invocation i) => super.noSuchMethod(i);
}

void main() {
  group('LoginViewModel', () {
    late ProviderContainer container;
    late _FakeAuthService fakeAuth;

    setUp(() {
      fakeAuth = _FakeAuthService();
      container = ProviderContainer(overrides: [
        authServiceProvider.overrideWithValue(fakeAuth),
      ]);
    });

    tearDown(() => container.dispose());

    test('error state set on failure', () async {
      fakeAuth.throwOnSignIn = const ApiException(
        code: ErrorCode.invalidCredentials,
        message: '...',
      );

      await container.read(loginViewModelProvider.notifier)
        .signInWithEmail('x@y.com', 'wrong');

      expect(
        container.read(loginViewModelProvider).errorCode,
        ErrorCode.invalidCredentials,
      );
    });
  });
}
```

### Widget (특수 상황만)

대부분의 UI 검증은 ViewModel 테스트로 충분해요. Widget 테스트는 이럴 때 써요:
- 복잡한 Gesture · 애니메이션
- 플랫폼별 분기 (iOS vs Android)
- Golden 이미지 비교

```dart
testWidgets('PrimaryButton shows spinner when loading', (tester) async {
  await tester.pumpWidget(MaterialApp(
    home: Scaffold(body: PrimaryButton(text: 'OK', isLoading: true, onPressed: () {})),
  ));
  expect(find.byType(CircularProgressIndicator), findsOneWidget);
});
```

---

## 2. Kit 계약 테스트

각 Kit 의 `{kit_name}_contract_test.dart` 에서 **불변 속성** 을 검증해요:

```dart
void main() {
  tearDown(() => AppKits.resetForTest());

  group('AuthKit contract', () {
    test('requires BackendApiKit', () {
      expect(AuthKit().requires, contains(BackendApiKit));
    });

    test('redirectPriority is 10', () {
      expect(AuthKit().redirectPriority, 10);
    });

    test('contributes /login route', () {
      final paths = AuthKit().routes.whereType<GoRoute>().map((r) => r.path);
      expect(paths, containsAll(['/login', '/forgot-password', '/verify-email']));
    });
  });
}
```

### 왜 계약 테스트?

Kit 의 `requires`, `redirectPriority`, `routes` 같은 **외부 의존적 속성** 은 실수로 바꾸면 다른 Kit · 라우터가 깨져요. 계약 테스트가 **의도된 변경인지 검토** 를 강제해요.

상세는 [`contract-testing.md`](./contract-testing.md) 를 참고하세요.

---

## 3. 조립 통합 테스트

실제 `main.dart` 흐름 재현 — 정본은 [`test/integration/main_assembly_test.dart`](https://github.com/storkspear/template-flutter/blob/main/test/integration/main_assembly_test.dart) 예요.
검증 대상은 **"install → container(allProviderOverrides) → attach → provider read"** 경로이고,
Kit 조합은 테스트가 무엇을 확인하려는지에 따라 고릅니다(아래는 provider 주입 확인용 최소 조합).

```dart
void main() {
  setUp(() async {
    await AppKits.resetForTest();
    forceUpdateInfoNotifier.value = null;
  });

  test('install → container → attach → provider read 성공', () async {
    final fakeDb = FakeDatabase();
    final alertSvc = InMemoryScheduledAlertService();
    final prefs = await buildTestPrefs();   // SharedPreferences mock init 을 감싼 헬퍼

    // 1. Kit install — 주입 인스턴스를 넘겨 네트워크 의존 없이 조립만 검증해요.
    await AppKits.install([
      LocalDbKit(database: () => fakeDb),
      NotificationsKit(service: alertSvc),
    ]);

    // 2. Container 생성 (모든 kit override + 앱 수준 override 합성)
    final container = ProviderContainer(
      overrides: [...AppKits.allProviderOverrides, prefsStorageProvider.overrideWithValue(prefs)],
    );
    addTearDown(container.dispose);

    // 3. container 부착 → 4. kit 이 기여한 Provider 가 실제로 resolve 되는지
    AppKits.attachContainer(container);
    expect(identical(container.read(databaseProvider), fakeDb), isTrue);
    expect(identical(container.read(scheduledAlertServiceProvider), alertSvc), isTrue);
  });
}
```

같은 파일의 다른 케이스가 **Splash 부트 경로**(`AppKits.allBootSteps` 전수 실행)와
**UpdateKit 실패 시 게이트 동작**을 따로 검증해요.

### 검증 포인트

- 모든 Kit 이 `install` 에 성공해요
- `requires` 검증을 통과해요
- BootStep 이 실패하지 않아요
- 최종 상태 (`authState`, `forceUpdate` 등) 가 기대대로예요

---

## 4. 마이그레이션 지문 (recipe 재구성 회귀)

`test/migration_fingerprint/` 는 **Drift 스키마 지문이 아니라**, 과거 앱 시나리오가 현재 kit 조합으로 재현 가능한지 검증하는 회귀 테스트예요 (`sumtally_onboarding_fingerprint_test.dart`, `rny_daily_alert_fingerprint_test.dart`). kit 계약이 깨지면 여기서 잡혀요.

```bash
flutter test test/migration_fingerprint/
```

### Drift schema fingerprint 는 템플릿 미포함

스키마 hash 스냅샷 비교 방식은 **템플릿에 없어요** — `AppDatabase` · `lib/database/` 자체가 스텁이라 없어요. `local_db_kit` 쓰는 파생 레포가 `drift_dev schema dump` 로 직접 셋업하세요.

```bash
# 파생 레포에서 (local_db_kit + AppDatabase 정의 후)
dart run drift_dev schema dump lib/database/app_database.dart drift_schemas/
```

---

## 5. 백엔드 계약 스냅샷

`test/contract/contract_test.dart` 는 template-spring 이 생성한 계약 스냅샷(`tools/contract-check/contract-snapshot.json`)을 로드해, flutter 클라가 실제로 의존하는 경로·에러코드·enum·DTO 필드가 스냅샷의 **subset** 인지 검증해요. 별도 CI job 없이 `flutter test` 에 그대로 탑승해요.

```bash
flutter test test/contract/
```

- 스냅샷 갱신: `tools/contract-check/refresh-spec.sh` (형제 backend 레포에서 복사)
- 자동 PR: `.github/workflows/contract-sync.yml`
- 계약 문서: [`docs/api-contract/README.md`](../api-contract/README.md)

---

## 커버리지 목표

| 레이어 | 목표 커버리지 |
|------|------------|
| Service · ViewModel | 80%+ |
| Kit 계약 | 핵심 Kit (현재 `auth_kit` · `backend_api_kit` · `payment_kit` · `file_kit`) 우선. 메타가 단순한 Kit 은 통합 테스트로 흡수 |
| 조립 통합 | 1개 유효 (smoke test 수준 — `test/integration/main_assembly_test.dart`) |
| 마이그레이션 지문 | 전 스키마 버전 (Drift 사용 시) |
| 백엔드 계약 스냅샷 | 클라가 호출하는 전 경로·전 ErrorCode |
| Widget (golden) | 주요 화면만 (선택) |

```bash
flutter test --coverage
# coverage/lcov.info 생성
# genhtml coverage/lcov.info -o coverage/html  (HTML 리포트)
```

---

## 테스트 데이터 · 헬퍼

`test/helpers/` 에 공용 fake·빌더가 있어요 (상세 표는 [`test/helpers/README.md`](../../test/helpers/README.md)):

- `FakeSecureStorage` — 메모리 기반 `SecureStorage` (`fake_secure_storage.dart`)
- `MockDioAdapter` — Dio 응답 조작 (`mock_dio_adapter.dart`)
- `buildTestJwt(...)` — 테스트용 JWT 생성 (서명 미검증, `test_jwt.dart`)
- `buildAuthTestHarness()` — AppConfig + 스토리지 + ApiClient + AuthService 를 한 번에 조립 (`auth_test_harness.dart`)
- `installDefaultPaletteForTest()` — 팔레트 의존 위젯 테스트의 `setUpAll` 공용 설치 (`palette_test_helper.dart`)
- `buildTestPrefs()` — mock SharedPreferences 위에 초기화된 `PrefsStorage` 생성 (`prefs_test_helper.dart`)

`PrefsStorage` 가 필요한 테스트는 `buildTestPrefs()` 를 재사용해 일관성을 지켜요.

---

## CI 통합

`.github/workflows/ci.yml` 의 `analyze-and-test` 잡 실제 단계:

```yaml
- run: dart format --output=none --set-exit-if-changed lib/ test/
- run: dart run tool/configure_app.dart --audit
- run: bash tools/docs-check/docs-contract-test.sh   # Docs contract guard
- run: flutter analyze
- run: flutter test --reporter=expanded
```

> 커버리지 측정 / Codecov 업로드는 CI 에 **없어요** — 로컬에서 `./scripts/verify/coverage.sh` 로 측정해요 (게이트 아님, 월 1회 권장).

---

## 관련 문서

- [`contract-testing.md`](./contract-testing.md) — Kit 계약 테스트 상세
- [`conventions/architecture.md`](../conventions/architecture.md) — MVVM · 의존 방향 (테스트 대상 패턴 출처)
- [`ADR-003 · FeatureKit`](../philosophy/adr-003-featurekit-registry.md)
