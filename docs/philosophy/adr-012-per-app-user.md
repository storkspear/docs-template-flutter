<a id="per_app_user"></a>

# Per_App_User

**Status**: Accepted. 현재 유효. 2026-04-24 기준 JWT 에 `appSlug` 클레임 포함. 짝이 되는 [`template-spring`](https://github.com/storkspear/template-spring) 의 `AppSlugVerificationFilter` 와 일대일 대응.

## 결론부터

같은 이메일이라도 앱마다 별도 계정으로 다뤄요. 앱 API의 `/api/apps/{appSlug}` 경로와 JWT의 `appSlug`를 서버가 비교하며, 불일치하면 403 (`CMN_005`)을 반환해요. Flutter의 일반 API 호출은 `AppConfig.appSlug`로 접두사를 붙여요. 로컬 JWT 파싱은 로그인 상태를 복원하는 용도이며 서버의 서명·권한 검증을 대신하지 않아요.

## 왜 이런 고민이 시작됐나?

솔로 인디 개발자가 여러 앱을 찍어낼 때 가장 흔한 디자인 결정이 **통합 계정 vs 앱별 계정**.

**통합 계정** — 모든 앱이 하나의 유저 테이블 공유. 유저가 한 번 가입하면 다른 앱도 같은 계정으로 로그인.

**앱별 계정** — 각 앱이 자기 유저 테이블 소유. 같은 이메일이라도 앱마다 다른 계정.

Google · Apple 은 통합을 지향해요 (Google 계정 하나로 Gmail · Drive · YouTube). 하지만 솔로 인디의 맥락에선 얘기가 달라요. 힘들이 부딪혀요.

**힘 A — 데이터 격리 · 프라이버시**  
사용자가 "타이머 앱" 을 썼다고 "가계부 앱" 에서도 자기 계정이 있다는 걸 알리면 불편 · 프라이버시 이슈. 앱마다 독립된 사용자 경험이 대부분 기대됨.

**힘 B — 각 앱의 독립 운영 가능성**  
앱 A 가 망해도 앱 B 는 영향 없어야 해요. 유저 테이블이 공유되면 "앱 A 서비스 종료 시 유저 계정 어떻게?" 같은 정책이 복잡해져요.

**힘 C — 데이터 조회 경로 명확성**  
앱 A 의 API 가 "앱 B 유저 데이터" 를 실수로 반환하면 심각한 보안 사고. 경로 수준에서 원천 차단되는 구조가 필요.

**힘 D — 코드 복잡도 최소화**  
백엔드가 "이 요청은 앱 A 소속인가 B 인가?" 를 매 요청 판단해야 하면 컨트롤러 · 서비스마다 분기 코드. DRY 위반.

이 결정이 답해야 했던 물음이에요.

> **앱 간 데이터 격리를 런타임 검증으로 강제하되, 개발자는 분기 코드 없이 자연스럽게 작성할 수 있는 구조** 는?

## 고민했던 대안들

<a id="option-1--통합-계정--앱별-권한"></a>

### Option 1 — 통합 계정 + 앱별 권한

하나의 `users` 테이블 + `user_apps` 연결 테이블로 "이 유저가 어떤 앱에 가입됐나" 기록. 모든 API 가 `currentUser.id` 로 조회.

- **장점**: 유저 측 UX 는 단일 계정. SSO 자연.
- **단점 1**: **공급자 역할** 의 Google / Apple 을 흉내 내는 것. 인디 앱엔 과한 모델.
- **단점 2**: 백엔드 코드에 "이 유저가 이 앱에 권한 있나?" 체크 매번. 한 군데라도 빼먹으면 데이터 유출.
- **단점 3**: 앱 A 종료 시 해당 유저가 A 에만 가입했으면 어떻게? 테이블 삭제 정책 복잡.
- **탈락 이유**: 힘 A (격리) 와 힘 D (복잡도) 정면 위반.

<a id="option-2--앱별-독립-db"></a>

### Option 2 — 앱별 독립 DB

각 앱이 자기 Firebase 프로젝트 + 자기 백엔드 인스턴스 + 자기 DB. 물리적 격리.

- **장점**: 완전 격리. 보안 · 운영 리스크 최소.
- **단점 1**: **서버 N 개, Firebase 프로젝트 N 개** — 솔로가 10개 앱 감당 불가.
- **단점 2**: 공통 인프라 (결제 · 알림 · 소셜 로그인 설정) 을 앱마다 따로 구성.
- **탈락 이유**: 프롤로그 제약 1 (운영 가능성) 심각 위반.

<a id="option-3--하나의-백엔드--앱별-스키마-분리--jwt-appslug--채택"></a>

### Option 3 — 하나의 백엔드 + 앱별 스키마 분리 + JWT `appSlug` ★ (채택)

백엔드는 **하나의 Spring 인스턴스** (프롤로그 · [`template-spring ADR-001`](https://github.com/storkspear/template-spring/blob/main/docs/philosophy/adr-001-modular-monolith.md) 참조). 하지만 데이터 격리는 **DB 스키마 분리** + **JWT `appSlug` 클레임 검증** 으로.

- **힘 A 만족**: 각 앱의 유저 테이블이 독립 스키마. `app_a.users` / `app_b.users` 구분.
- **힘 B 만족**: 앱별 스키마라 운영 독립. 앱 A schema drop 해도 앱 B 영향 없음.
- **힘 C 만족**: JWT 의 `appSlug` 와 URL 경로가 불일치하면 403 (`CMN_005`). 경로 자체에 `appSlug` 가 박혀 있어 실수 방지.
- **힘 D 만족**: Spring 의 필터가 중앙에서 검증. 개별 컨트롤러 · 서비스는 신경 안 씀.

## 결정

### 백엔드 구조 (template-spring 참조)

- **URL 규약**: 모든 인증 요청이 `/api/apps/{appSlug}/...` 경로. 예: `/api/apps/habit-tracker/auth/email/signin` · `/api/apps/habit-tracker/users/me`
- **JWT 클레임**: `{ sub: userId, appSlug: "habit-tracker", exp: ..., iat: ... }`
- **필터**: `AppSlugVerificationFilter` 가 URL 의 `{appSlug}` 와 JWT 의 `appSlug` 불일치 시 **403 (`CMN_005`) 응답**
- **DB**: schema 분리로 `habit_tracker.users` · `expense_diary.users` 독립

### 프론트 측 책임

**1) AppConfig 에 `appSlug` 선언**

```dart
// lib/core/config/app_config.dart 발췌
class AppConfig {
  final String appSlug;
  // ...
  AppConfig.init({
    required this.appSlug,       // 'habit-tracker' 같은 slug
    required this.baseUrl,       // 'https://api.example.com'
    // ...
  });
}
```

앱 부팅 시 단 한 번 설정:

```dart
// lib/main.dart 발췌
AppConfig.init(
  appSlug: 'template',           // 파생 레포에서 자기 slug 로 교체
  baseUrl: 'http://localhost:8081',
  // ...
);
```

**2) API 경로 자동 prefix**

`ApiClient` 의 `get` / `post` 메서드가 `path` 를 받을 때 **`/api/apps/{appSlug}` 를 자동 prefix**:

```dart
// 개발자가 쓰는 API
await api.get<User>('/users/me', fromData: User.fromJson);

// 실제 HTTP 요청 URL
// {baseUrl}/api/apps/{appSlug}/users/me
// = http://localhost:8081/api/apps/template/users/me
```

개발자는 앱 slug 를 매번 쓸 필요 없음. AppConfig 에서 자동으로 주입.

**3) 로그인 시 JWT 수신**

로그인 응답의 access token에는 서버가 발급한 `appSlug`가 들어 있어요. Flutter는 JWT payload를 디코딩해 `CurrentUser`를 구성해요. 서명과 앱별 접근 권한을 확인하는 책임은 서버에 있어요.

**4) 자동 검증**

매 요청마다:
- 프론트: 경로에 `appSlug` 자동 prefix
- 서버: JWT 의 `appSlug` 와 경로 `{appSlug}` 비교 → 불일치 시 403 (`CMN_005`)

### 다른 앱 토큰으로 접근 시도 시 시나리오

파생 레포 A 에서 만든 JWT 를 복사해 파생 레포 B 의 앱에 주입해도, 경로는 `/api/apps/{B의 appSlug}/...` 이고 JWT 는 `appSlug: A` 라 불일치 → 403 (`CMN_005`). **런타임에서 막힘**.

### 설계 선택 포인트

**포인트 1 — `appSlug` 는 URL 경로와 JWT 클레임 모두에 있음**  
둘 다 있어야 검증이 가능. URL 만 있고 JWT 에 없으면 **변조 가능**, JWT 만 있고 URL 에 없으면 **라우팅 · 로깅 혼란**. 양쪽 확정이 계약.

**포인트 2 — 프론트는 slug 관리 없음**  
ApiClient 가 자동 prefix. ViewModel · Service · Repository 모두 slug 를 신경 안 씀. 이 덕분에 **파생 레포 생성 시 `appSlug` 만 바꾸면 전체 API 가 올바른 경로로**.

**포인트 3 — 이메일 중복 허용**  
"앱 A 에서 email@x.com 가입, 앱 B 에서 또 email@x.com 가입" 이 OK. 각 앱의 스키마가 독립이라 DB 제약도 독립.

**포인트 4 — 소셜 로그인도 앱별**  
Google Sign-In · Apple Sign-In 도 앱별 **Client ID** 필요. 같은 Google 계정으로 앱 A 가입 시와 앱 B 가입 시 서로 다른 내부 user_id 발급. 연결 없음.

**포인트 5 — `appSlug` 는 변경 불가**  
앱 출시 후 slug 변경은 DB 스키마 rename + JWT 발급 이력 등 대형 작업. 초기 결정이 지속됨을 전제.

## 이 선택이 가져온 것

### 긍정적 결과

백엔드는 보호된 앱 경로와 토큰의 appSlug 가 일치하는지 검증해요. 클라이언트는 공통 prefix 로 앱 경로를 구성하고, 계정은 앱 단위로 구분해요. 이 검증은 필요한 경계 중 하나이며 모든 데이터 유출이나 운영 변경의 영향을 없애는 보장은 아니에요. 새 앱에는 slug 외에 서버·플랫폼·소셜 설정도 필요해요.

### 부정적 결과

기본적으로 앱 간 통합 로그인을 제공하지 않아요. 소셜 플랫폼 설정과 계정 운영을 앱 단위로 관리해야 하고, slug 를 바꾸면 URL·JWT·데이터 배치에 미치는 영향을 확인해야 해요. Apple Service ID 는 현재 iOS identity token 흐름의 필수 값이 아니에요.

## 교훈

<a id="교훈-1-격리는-경로에-박혀야-안전"></a>
<a id="교훈-1--격리는-경로에-박혀야-안전"></a>

### 교훈 1 — 서버에서 경로와 토큰의 앱을 대조해요

앱 경로와 검증된 JWT 의 appSlug 를 대조해 다른 앱의 토큰을 잘못 사용하는 요청을 거절해요. 경로 문자열을 붙이는 것만으로 보안 검증이 되는 것은 아니며, 서버가 실제 검증을 수행해야 해요.

<a id="교훈-2-통합-계정-을-거부하는-용기"></a>
<a id="교훈-2--통합-계정-을-거부하는-용기"></a>

### 교훈 2 — 앱별 독립 계정을 선택한 이유를 유지해요

현재 앱별 독립 계정은 앱의 운영과 변경을 따로 관리하기 위한 선택이에요. 통합 계정이 필요한 제품도 있으므로 업계 표준을 거부하는 것이 정답이라고 일반화하지 않아요. 여기서는 기존 독립 계정 모델을 유지해요.

<a id="교훈-3-프론트는-slug-인지-안-해야"></a>
<a id="교훈-3--프론트는-slug-인지-안-해야"></a>

### 교훈 3 — 반복되는 앱 경로 구성을 ApiClient에 모아요

ApiClient 가 공통 API prefix 를 붙이므로 일반 화면은 `/users/me` 같은 앱 내부 경로를 사용해요. 반복되는 경로 구성을 한곳에 모은 것이며, 클라이언트 전체에서 appSlug 가 사라진다는 뜻은 아니에요. AppConfig 와 필요한 계약에는 slug 가 남아 있어요.

## 관련 사례 (Prior Art)

- [`template-spring ADR-012 · 앱별 독립 유저 모델`](https://github.com/storkspear/template-spring/blob/main/docs/philosophy/adr-012-per-app-user-model.md) — 짝이 되는 백엔드의 동일 결정. 스키마 · 필터 구현 상세
- [`template-spring ADR-005 · DB 스키마 격리`](https://github.com/storkspear/template-spring/blob/main/docs/philosophy/adr-005-db-schema-isolation.md) — 앱별 schema 분리의 5중 방어선
- [`template-spring ADR-013 · 앱별 인증 엔드포인트`](https://github.com/storkspear/template-spring/blob/main/docs/philosophy/adr-013-per-app-auth-endpoints.md) — `/api/apps/{slug}/auth/*` URL 설계
- [RFC 7519 JWT](https://datatracker.ietf.org/doc/html/rfc7519) — JWT 클레임 표준
- [Multi-tenant SaaS 아키텍처 패턴 (Microsoft)](https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/overview) — 일반 multi-tenancy 개론. 본 ADR 의 확장 맥락

## Code References

**프론트 측**
- [`lib/core/config/app_config.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/core/config/app_config.dart) — `appSlug` 선언 지점
- [`lib/kits/backend_api_kit/api_client.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/backend_api_kit/api_client.dart) — 경로에 `/api/apps/{slug}/` 자동 prefix 로직
- [`lib/kits/auth_kit/auth_service.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/auth_kit/auth_service.dart) — JWT 수신 → TokenStorage 저장

**짝이 되는 백엔드**
- [`common/common-security/.../AppSlugVerificationFilter.java`](https://github.com/storkspear/template-spring/blob/main/common/common-security/src/main/java/com/factory/common/security/AppSlugVerificationFilter.java) — URL ↔ JWT 검증
- [`common/common-security/.../JwtService.java`](https://github.com/storkspear/template-spring/blob/main/common/common-security/src/main/java/com/factory/common/security/jwt/JwtService.java) — `appSlug` 클레임 발급/검증

- [`ADR-010 · QueuedInterceptor 로 401 자동 갱신`](./adr-010-queued-interceptor.md) — 인증 토큰 갱신 흐름. 앱 불일치의 403은 이 갱신 경로와 달라요.
- [`ADR-013 · 토큰 저장 원자성`](./adr-013-token-atomic-storage.md) — 토큰 저장과 복구의 범위
- [`ADR-019 · 솔로 친화적 운영`](./adr-019-solo-friendly.md) — 운영 제약을 판단하는 기준