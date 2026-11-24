<a id="token_atomic_storage"></a>

# Token_Atomic_Storage

**Status**: Accepted. 현재 유효. 2026-04-24 작성 / 2026-05-07 line 수 갱신. `lib/core/storage/token_storage.dart` (72줄) 가 `saveTokens` 원자 저장 + `repairIfPartial` 복구 담당. iOS Keychain: `first_unlock_this_device`, Android: flutter_secure_storage 기본 KeyStore 기반 cipher.

## 결론부터

access token과 refresh token은 `SecureStorage`, 일반 설정은 `PrefsStorage`에 저장해요. `saveTokens`는 순서대로 쓰고 하나라도 실패하면 두 키의 삭제를 시도해요. 부팅할 때 `repairIfPartial`로 한쪽만 남은 상태를 정리해요. 이 방식은 이전 값을 복원하는 트랜잭션이 아니며, 프로세스 중단·정리 실패·동시 접근까지 원자적으로 보장하지는 않아요.

## 왜 이런 고민이 시작됐나?

JWT 기반 인증에선 access · refresh 두 토큰을 저장해야 해요. 그리고 저장 매체는 민감도 · 플랫폼 특성에 따라 달라야 해요.

네 가지 상황이 부딪혀요.

**상황 A — 민감 데이터의 암호화 저장**  
access · refresh token 은 **서버 인증 credential**. 이걸 평문으로 `SharedPreferences` 에 저장하면 탈옥 / 루팅된 기기에서 추출 가능. 플랫폼이 제공하는 **하드웨어 지원 암호화** (Keychain · EncryptedSharedPreferences) 가 필수.

**상황 B — 반쪽 저장 상태의 위험**  
`await write(accessToken)` 성공 후 `await write(refreshToken)` 실패 (저장 공간 부족 · OS 중단 등) → 다음 부팅 시 **access 는 있고 refresh 없는 상태**. 로그인됐다고 판단 → API 호출 → 401 → refresh 시도 → refresh token 없음 → **강제 로그아웃 루프**.

**상황 C — 백그라운드에서 접근 필요**  
FCM 푸시 수신 → 백엔드 device 등록 갱신 등 **앱이 포그라운드가 아닐 때** 도 토큰 필요. 이건 iOS Keychain 의 `first_unlock` accessibility 를 선택해야 가능.

**상황 D — iCloud 백업에서 제외**  
사용자가 기기 A → 기기 B 로 복원 시 iCloud 가 Keychain 을 복사. 이때 **토큰도 따라가면** 보안 이슈 · 서버 세션 혼란. iCloud 백업 제외 옵션 필요.

이 결정이 답해야 했던 물음이에요.

> **민감도가 다른 데이터를 적절한 매체에 저장하되, 원자성 · 플랫폼 보안 정책 · 반쪽 상태 복구를 모두 다루는** 구조는?

## 고민했던 대안들

<a id="option-1--모든-데이터를-sharedpreferences"></a>

### Option 1 — 모든 데이터를 SharedPreferences

토큰 · 설정 · 테마 선호 모두 `SharedPreferences`.

- **장점**: 단순. 단일 API.
- **단점 1**: **토큰 평문 저장**. 탈옥/루팅 기기 공격 시 노출.
- **단점 2**: iOS 에선 SharedPreferences = plist. **NSUserDefaults** 에 해당. 기기 연결 / backup 시 추출 쉬움.
- **탈락 이유**: 상황 A 정면 위반. 보안 표준 미달.

<a id="option-2--토큰을-서버-쿠키--samesite-전략"></a>

### Option 2 — 토큰을 서버 쿠키 + SameSite 전략

HTTP only cookie 로 서버가 토큰 관리. 클라 코드에서 접근 안 함.

- **장점**: 웹 환경에선 표준. 클라이언트 XSS 취약점 영향 최소.
- **단점 1**: **네이티브 앱 (Flutter)** 에선 쿠키 jar 관리 · SSO · 공유 브라우저 쿠키 등 웹 중심 가정이 안 맞음.
- **단점 2**: `dio` 등 HTTP 클라이언트의 cookie manager 설정 복잡 + iOS / Android 플랫폼별 동작 차이.
- **단점 3**: 백그라운드 작업 (FCM · workmanager) 에서 쿠키 jar 접근 경계 모호.
- **탈락 이유**: 모바일 네이티브 환경에 부적합.

<a id="option-3--securestorage--sharedpreferences-이원화--원자-저장--채택"></a>

### Option 3 — SecureStorage + SharedPreferences 이원화 + 원자 저장 ★ (채택)

**민감도별 매체 분리**:
- 토큰 → `SecureStorage` (flutter_secure_storage)
- 일반 설정 → `SharedPreferences` (shared_preferences)

**원자 저장 로직**:
- `TokenStorage.saveTokens(access, refresh)` — 순차 저장하고 실패하면 두 키 삭제를 시도해요.
- `TokenStorage.repairIfPartial()` — 부팅 시 반쪽 상태 복구

- **상황 A 만족**: iOS Keychain · Android KeyStore 로 하드웨어 지원 암호화.
- **상황 B 만족**: `saveTokens` 가 실패 시 `clearTokens()` 로 둘 다 삭제. `repairIfPartial` 가 부팅 시 복구.
- **상황 C 만족**: iOS accessibility `first_unlock_this_device` → 첫 unlock 후 백그라운드 접근 가능.
- **상황 D 만족**: `this_device` suffix → iCloud 백업에서 제외.

## 결정

<a id="securestorage-설정-ios--android"></a>

### SecureStorage 설정 (iOS / Android)

```dart
// lib/core/storage/secure_storage.dart 전체
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// 안전 저장소 (iOS Keychain / Android KeyStore 기반 암호화).
///
/// 토큰 등 민감 정보 전용. 일반 설정은 [PrefsStorage] 사용.
class SecureStorage {
  /// iOS: [KeychainAccessibility.first_unlock_this_device]
  /// - `thisDevice` → iCloud Keychain 백업 대상에서 제외 (기기 복원 시 토큰 이전 방지)
  /// - `first_unlock` → 첫 unlock 후 접근 가능, 백그라운드 refresh 허용
  ///
  /// Android: 기본이 KeyStore 기반 커스텀 cipher 라 별도 옵션이 없다.
  /// `encryptedSharedPreferences` 는 주지 않는다 — Jetpack Security deprecate 와 함께
  /// deprecated 됐고(v11 제거 예정) 지정해도 무시된다.
  static const _storage = FlutterSecureStorage(
    iOptions: IOSOptions(
      accessibility: KeychainAccessibility.first_unlock_this_device,
    ),
  );

  /// 키로 읽기. 없으면 null.
  Future<String?> read(String key) => _storage.read(key: key);

  /// 저장 (기존 값 덮어씀).
  Future<void> write(String key, String value) =>
      _storage.write(key: key, value: value);

  /// 특정 키 삭제.
  Future<void> delete(String key) => _storage.delete(key: key);

  /// 모든 키 삭제. 로그아웃/탈퇴 시 사용.
  Future<void> deleteAll() => _storage.deleteAll();
}
```

**Android 쪽에 옵션이 없는 게 정상이에요.** `flutter_secure_storage` 의 Android 구현은 기본이 KeyStore 기반 커스텀 cipher 라 우리가 고를 값이 없어요. 예전에 쓰이던 `AndroidOptions(encryptedSharedPreferences: true)` 는 Jetpack Security 의 deprecate 와 함께 deprecated 됐고 (v11 에서 제거 예정) 지금은 지정해도 무시돼요. 그래서 코드에 `aOptions` 자체가 없어요 — 빠뜨린 게 아니라 **의도적으로 뺀** 거예요.

### TokenStorage 원자 저장

```dart
// lib/core/storage/token_storage.dart 전체
class TokenStorage {
  static const _accessTokenKey = 'access_token';
  static const _refreshTokenKey = 'refresh_token';

  final SecureStorage _storage;

  TokenStorage({required SecureStorage storage}) : _storage = storage;

  Future<String?> getAccessToken() => _storage.read(_accessTokenKey);
  Future<String?> getRefreshToken() => _storage.read(_refreshTokenKey);

  /// 순차 저장 후 중간 실패 시 두 키 삭제를 시도해요.
  Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
  }) async {
    try {
      await _storage.write(_accessTokenKey, accessToken);
      await _storage.write(_refreshTokenKey, refreshToken);
    } catch (_) {
      try {
        await clearTokens();  // ← 둘 다 정리
      } catch (cleanupError, cleanupStack) {
        developer.log(
          'clearTokens during saveTokens rollback failed',
          name: 'TokenStorage',
          error: cleanupError,
          stackTrace: cleanupStack,
        );
      }
      rethrow;  // ← 원 에러 전파
    }
  }

  /// 두 토큰 제거. 첫 delete 가 실패해도 두 번째 delete 는 반드시 시도.
  Future<void> clearTokens() async {
    try {
      await _storage.delete(_accessTokenKey);
    } finally {
      await _storage.delete(_refreshTokenKey);
    }
  }

  /// access + refresh **둘 다** 존재하면 true. 순수 조회.
  Future<bool> hasTokens() async {
    final access = await getAccessToken();
    final refresh = await getRefreshToken();
    return access != null && refresh != null;
  }

  /// 반쪽 상태이면 clearTokens. 부팅 시 한 번 호출해 일관성 복구.
  Future<void> repairIfPartial() async {
    final access = await getAccessToken();
    final refresh = await getRefreshToken();
    final partial = (access != null && refresh == null) ||
                    (access == null && refresh != null);
    if (partial) await clearTokens();
  }
}
```

### 부팅 시 복구 흐름

> **2026-07-15 정정**: 이 절은 부팅 시 서버 `/users/me` 검증으로 서술돼 있었지만, 실코드는 **서버 왕복 없는 로컬 JWT 파싱** 이에요. 현행 구현 기준으로 다시 썼어요.

부팅 시 `AuthCheckStep` (ADR-008) 이 `AuthService.checkAuthStatus()` 를 1회 호출해요.

```dart
// lib/kits/auth_kit/auth_service.dart 발췌
Future<void> checkAuthStatus() async {
  // 1. 반쪽 상태 복구
  await _tokenStorage.repairIfPartial();

  // 2. 정상 토큰 있는지 확인
  final hasTokens = await _tokenStorage.hasTokens();
  if (!hasTokens) {
    _authState.emit(const AuthState.unauthenticated());
    return;
  }

  // 3. 로컬 JWT 파싱으로 유효성 확인 (exp 만료 검사 — 서버 호출 없음)
  final accessToken = await _tokenStorage.getAccessToken();
  final user = accessToken == null ? null : _parseJwtUser(accessToken);
  if (user != null) {
    _authState.emit(AuthState.authenticated(user));
    return;
  }

  // 4. 만료 → refresh 시도
  if (await refreshToken()) return;

  // 5. 서버 거절이면 refreshToken() 이 이미 토큰을 지우고 unauthenticated 를 emit 했다.
  if (!await _tokenStorage.hasTokens()) { /* ... */ return; }

  // 6. 토큰이 남아 있으면 거절 외 실패(오프라인 등) — 만료 토큰의 사용자로 세션 유지.
  //    온라인 복귀 후 첫 401 에서 ADR-010 경로가 refresh 를 다시 시도한다.
  final staleUser = accessToken == null
      ? null
      : _parseJwtUser(accessToken, checkExpiry: false);
  _authState.emit(
    staleUser == null
        ? const AuthState.unauthenticated()
        : AuthState.authenticated(staleUser),
  );
}
```

유효한 access token이면 로컬 파싱으로 상태를 복원해요. 만료됐거나 파싱할 수 없으면 서버에 refresh를 요청할 수 있어요. 서버가 토큰을 취소 (revoke) 한 경우는 부팅에선 못 잡지만, 이후 첫 API 호출이 401 을 받으면 ADR-010 의 자동 refresh 경로가 처리해요. `AuthCheckStep` 은 `checkAuthStatus()` 가 예외를 던지면 non-fatal 리포트 후 `unauthenticated` 로 복귀시켜 부팅이 멈추지 않게 해요.

### PrefsStorage (일반 설정)

```dart
// lib/core/storage/prefs_storage.dart 개요
class PrefsStorage {
  late SharedPreferences _prefs;

  Future<void> init() async {
    _prefs = await SharedPreferences.getInstance();
  }

  String? getString(String key) => _prefs.getString(key);
  Future<bool> setString(String key, String value) => _prefs.setString(key, value);
  // ... 기타 타입
}
```

**용도**: 테마 설정 · 언어 · 온보딩 완료 플래그 · 리뷰 트리거 카운터. **암호화 안 됨** — 민감 정보 저장 금지.

### 설계 선택 포인트

**포인트 1 — `first_unlock_this_device` accessibility 의 의미**  
- `first_unlock`: 기기가 **최초 unlock 된 이후** 토큰 접근 가능. 재부팅 직후엔 아직 unlock 안 돼서 접근 불가. 하지만 사용자가 unlock 한 뒤엔 백그라운드에서도 접근 OK. FCM · workmanager 용 필수.
- `this_device`: iCloud Keychain 백업 대상에서 **제외**. 기기 A 의 토큰이 기기 B 로 복제되지 않음.

이 설정은 재부팅 후 첫 잠금 해제 여부와 기기 이전 제한을 함께 고려한 선택이에요. 앱의 백그라운드 실행과 기기 교체 정책에 맞는지는 별도로 확인해요.

**포인트 2 — `clearTokens` 의 try/finally 패턴**  
access token 삭제가 실패해도 refresh token 삭제는 시도해요. 둘 중 하나라도 남을 수 있으므로 저장소 오류를 성공으로 간주하지 않아요.

**포인트 3 — `saveTokens` 롤백 중 에러는 삼킴**  
저장이 실패하면 `clearTokens()` 로 정리를 시도해요. 정리도 실패하면 그 오류는 로그에 남기고, 호출자에게는 원래 저장 오류를 다시 던져요.

현재 구현은 부팅 시 반쪽 토큰 상태를 점검해요. 쓰기나 정리 작업의 실패, 프로세스 중단으로도 반쪽 상태가 생길 수 있어요. 두 키가 모두 존재하는지만 확인하므로 토큰 쌍의 세대 일치까지 검증하는 복구는 아니에요.

**포인트 5 — `hasTokens` 는 부작용 없음**  
`hasTokens` 는 두 키의 존재 여부를 조회해요. 한쪽 키만 있으면 false 를 반환하고, 정리는 별도 `repairIfPartial` 호출에서 수행해요.

## 이 선택이 가져온 것

### 긍정적 결과

- **OS 저장소 사용**: flutter_secure_storage 를 통해 토큰을 보관해요. 이 설정만으로 루팅·탈옥 환경에서 토큰 접근을 막는다고 보장하지 않아요.
- **반쪽 상태 정리**: 부팅할 때 한쪽 토큰만 남아 있으면 두 키를 정리해요. 저장소 정리 자체가 실패할 수 있으므로 모든 인증 실패를 없애는 보장으로 해석하지 않아요.
- **iCloud 복제 방지**: 기기 이전 시 토큰 따라가지 않음. 새 기기 = 새 로그인.
- **백그라운드 작업 가능**: `first_unlock` 으로 FCM · workmanager 에서 토큰 접근 가능.
- **민감도별 매체 분리**: SharedPreferences 에 테마 설정 저장 · SecureStorage 에 토큰 저장 — 용도 명확.
- **테스트 용이**: SecureStorage 를 `overrideWithValue(FakeSecureStorage())` 로 mock 해서 TokenStorage 단위 테스트.

### 부정적 결과

- **두 매체 관리 복잡**: 어떤 데이터를 어디에 넣을지 선택 피로. "유저 설정 중 민감한 건 뭐?" 판단.
- **Android 암호화가 라이브러리 손에 있음**: Android 쪽은 `flutter_secure_storage` 가 KeyStore 기반 cipher 로 알아서 처리해서 우리가 조정할 옵션이 없어요. 설정 부담은 0 이지만, 라이브러리 구현이 바뀌면 그대로 따라가고 우리 문서 · 감사 답변도 같이 갱신해야 해요.
- **iOS Keychain 동기화 이슈**: 앱 삭제 후 재설치 시 Keychain 이 남아있는 경우 (OS 버전별 동작 차이). "첫 실행 체크" 로 clearAll 필요 시 있음.
- **중단과 동시성의 한계**: 두 쓰기 사이에 프로세스가 끝나면 반쪽 상태가 남을 수 있어요. 정리 실패나 동시 호출도 원자적으로 격리하지 않아요. 부팅 복구는 한쪽 키만 남은 경우를 대상으로 해요.

## 교훈

<a id="교훈-1--원자성-은-db-의-acid-뿐-아니라-storage-에도"></a>

### 교훈 1 — "원자성" 은 DB 의 ACID 뿐 아니라 Storage 에도

두 토큰을 따로 쓰는 과정에서는 두 번째 쓰기가 실패할 수 있어요. 현재 구현은 실패하면 두 키의 삭제를 시도하고 원래 쓰기 오류를 호출자에게 전달해요. 정리도 실패하면 로그를 남겨요. 확인되지 않은 프로덕션 장애 기간을 구현 근거로 삼지는 않아요.

다중 쓰기를 다룰 때는 실패 시 어떤 키를 정리하고 어떤 오류를 전달할지 정해요. 프로세스 중단과 정리 실패가 가능하므로, 두 키 저장을 데이터베이스 트랜잭션과 같은 보장으로 설명하지 않아요.

<a id="교훈-2--first_unlock_this_device-가-정답"></a>

### 교훈 2 — `first_unlock_this_device` 가 정답

이 템플릿은 `first_unlock_this_device` 를 사용해 첫 잠금 해제 이후의 접근과 현재 기기 범위를 선택해요. 특정 FCM 수신이나 백그라운드 작업의 성공을 이 옵션 하나로 보장하지는 않아요. 저장소 접근 조건과 작업 실행 조건을 함께 확인해요.

iOS Keychain 의 접근 시점과 기기 이전 조건은 별개로 확인해요. 앱이 실제로 토큰을 읽는 시점에 맞춰 설정을 선택해요.

<a id="교훈-3--repairifpartial-같은-복구-함수-는-부팅에-한-번만"></a>

### 교훈 3 — `repairIfPartial` 같은 "복구 함수" 는 부팅에 한 번만

현재 `checkAuthStatus()` 는 인증 상태를 복구할 때 `repairIfPartial` 을 호출해요. 일반 조회와 정리를 분리하면 토큰을 읽는 코드에서 상태가 바뀌는 일을 줄일 수 있어요. 부팅 때 한 번 호출한다고 이후 모든 부분 상태가 해결되는 것은 아니에요.

**교훈**: "일관성 복구" 는 **상태가 변할 수 있는 경계** (부팅 · 로그인 · 로그아웃) 에서만. 조회마다 하면 책임이 흐려져요.

## 관련 사례 (Prior Art)

- [flutter_secure_storage 공식 문서](https://pub.dev/packages/flutter_secure_storage) — 본 ADR 의 기반 라이브러리
- [Apple Keychain Services Guide](https://developer.apple.com/documentation/security/keychain_services) — accessibility 옵션 상세
- [Android Keystore system](https://developer.android.com/privacy-and-security/keystore) — flutter_secure_storage 의 Android 구현이 기대는 하드웨어 지원 키 저장소
- [OWASP Mobile Top 10 — M5 Insufficient Cryptography](https://owasp.org/www-project-mobile-top-10/) — 토큰 저장 보안 지침
- [Database Transaction Patterns](https://en.wikipedia.org/wiki/Atomicity_(database_systems)) — 원자성 원리의 일반 개념

## Code References

**토큰 저장**
- [`lib/core/storage/secure_storage.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/core/storage/secure_storage.dart) — iOS Keychain 접근 조건과 저장소 옵션 설정
- [`lib/core/storage/token_storage.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/core/storage/token_storage.dart) — 두 토큰 저장 · 실패 정리 · 부분 상태 복구

**일반 설정**
- [`lib/core/storage/prefs_storage.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/core/storage/prefs_storage.dart) — SharedPreferences 래퍼

**부팅 복구 호출**
- [`lib/kits/auth_kit/auth_check_step.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/auth_kit/auth_check_step.dart) — 부팅 시 `checkAuthStatus()` 호출 + 실패 격리
- [`lib/kits/auth_kit/auth_service.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/auth_kit/auth_service.dart) — `repairIfPartial` → `hasTokens` → 로컬 JWT 파싱 → 필요 시 refresh

**테스트**
- [`test/core/storage/token_storage_test.dart`](https://github.com/storkspear/template-flutter/blob/main/test/core/storage/token_storage_test.dart) — 원자성 · 복구 시나리오

**관련 ADR**:
- [`ADR-010 · QueuedInterceptor 로 401 자동 갱신`](./adr-010-queued-interceptor.md) — refresh 성공 시 `saveTokens` 호출
- [`ADR-012 · 앱별 독립 유저`](./adr-012-per-app-user.md) — 앱별 Keychain 분리
- [`ADR-020 · 이중 난독화 + 보안 정책`](./adr-020-security-hardening.md) — 토큰 저장이 보안 방어선의 일부
- [`ADR-008 · 부팅 단계 추상화`](./adr-008-boot-step.md) — `AuthCheckStep` 에서 `repairIfPartial` 호출
