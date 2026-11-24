# API Contract

이 폴더는 `template-flutter`와 짝 백엔드 [`template-spring`](https://github.com/storkspear/template-spring)이 함께 사용하는 API 계약을 정리해요. Flutter는 서버 응답을 직접 파싱하고, 필요한 서버 에러 코드와 클라이언트 자체 오류 코드를 상수로 관리해요. 서버의 모든 기능이나 타입을 그대로 복제하는 구조는 아니에요.

응답을 별도 Mapper 계층 없이 직접 파싱하는 이유는 [ADR-009](../philosophy/adr-009-backend-contract.md)에 정리돼 있어요.

---

## 문서 구성

### 공통 계약

| 파일 | 내용 |
|------|------|
| [`response-schema.md`](./response-schema.md) | `{data, error}` 래퍼 · `PageResponse<T>` |
| [`search-request.md`](./search-request.md) | 검색 요청 DSL · 연산자 목록 |
| [`error-codes.md`](./error-codes.md) | 클라이언트가 사용하는 오류 코드와 동기화 기준 |

### 도메인별 계약

| 파일 | 내용 |
|------|------|
| [`auth-flow.md`](./auth-flow.md) | 로그인 · 토큰 갱신 · 2FA TOTP · 소셜 인증 시퀀스 |
| [`user-profile.md`](./user-profile.md) | `/api/apps/{slug}/users/me` GET / PATCH + 활동 ping(POST, app-scoped `/users/me/activity`) |
| [`devices.md`](./devices.md) | 푸시 대상 기기 등록 / 해제 (FCM 토큰) |
| [`file-api.md`](./file-api.md) | 파일 업로드(presigned POST policy) / 조회(presigned GET) + 게시물 첨부 |
| [`notification-settings.md`](./notification-settings.md) | kind 별 push / email 채널 toggle (짝 백엔드 ADR-031) |

---

## 쌍 운영 규칙

### 서버 변경 시

1. 백엔드의 `ApiResponse.java` · `ErrorInfo` 구현 enum (`CommonError.java` / `AuthError.java` 등) 수정 → `tools/verify/gen-snapshot.sh` 재실행·커밋 (안 하면 backend CI 가 staleness 로 FAIL)
2. Flutter가 사용하는 필드나 코드에 영향이 있으면 파싱 코드와 테스트도 함께 수정해요.
3. 두 레포에 같은 커밋 메시지로 PR을 만들고 관련 변경을 연결해요.
4. `flutter test` 의 계약 크로스체크(`test/contract/contract_test.dart`, 클라 참조 ⊆ 스냅샷)가 어긋남을 잡아요. 스냅샷 복사본 갱신은 `contract-sync.yml` 이 매일 auto-PR 로도 수행해요 (자동 머지 없음)

### 프론트 변경 시

- 프론트 단독으로 계약을 바꾸지 **마세요**. 백엔드에 먼저 요청해요.
- DTO 필드 추가 · 삭제는 반드시 백엔드가 리드해요.

---

## 계약 변경 시 확인 포인트

- [ ] 양쪽 레포의 스키마 파일 수정 확인
- [ ] 기존 클라이언트 앱 호환 (하위 호환 필드 추가 우선)
- [ ] 통합 테스트 갱신
- [ ] 문서 업데이트 (이 폴더)

---

## 짝 동기화 매트릭스

계약을 바꿀 때 아래 대응 파일에서 클라이언트가 실제 사용하는 부분의 영향을 확인해요. 서버에 필드나 코드가 추가됐다고 Flutter가 모든 정의를 복제해야 하는 것은 아니에요. 기존 앱 호환성과 계약 스냅샷 검증을 함께 확인하고, 위의 PR 작업 규칙을 따라요.

| Flutter | Spring | 확인할 변경 |
|---|---|---|
| `lib/kits/backend_api_kit/api_response.dart` | `common-web/.../ApiResponse.java`, `pagination/PageResponse.java` | 응답 필드와 빈 응답 처리 |
| `lib/kits/backend_api_kit/error_code.dart` | `common-web/.../exception/CommonError.java`, `core-auth-api/.../exception/AuthError.java` | 사용 중인 코드의 의미·HTTP 상태·fallback |
| `lib/kits/backend_api_kit/api_endpoints.dart` | `common-web/.../ApiEndpoints.java` | 경로와 경로 인자 |
| `lib/kits/auth_kit/auth_service.dart` | `core-auth-impl/.../controller/AuthController.java` | 인증 요청·응답과 토큰 처리 |

## 관련 문서

- [`ADR-009 · 백엔드 응답 1:1 계약`](../philosophy/adr-009-backend-contract.md)
- [`ADR-012 · 앱별 독립 유저 + JWT appSlug`](../philosophy/adr-012-per-app-user.md)
- [짝 백엔드: template-spring](https://github.com/storkspear/template-spring)
