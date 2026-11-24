<a id="api-contract--백엔드-계약-요약"></a>

# API Contract — 백엔드 계약 요약

이 문서의 설명은 주제별 가이드에 통합했어요. [API 계약](../api-contract/README.md)부터 확인하고, 이전 절은 아래 링크로 찾을 수 있어요.

## 핵심 5가지

[통합한 설명 보기](../api-contract/README.md)

### 1. 응답 envelope: `{data, error}`

[통합한 설명 보기](../api-contract/response-schema.md)

<a id="2-에러-코드-도메인약어_번호-prefix"></a>

### 2. 에러 코드: `<도메인약어>_<번호>` prefix

[통합한 설명 보기](../api-contract/error-codes.md)

### 3. 페이지네이션: `PageResponse<T>`

[통합한 설명 보기](../api-contract/response-schema.md#pageresponset)

<a id="4-인증-jwt-bearer--appslug-검증"></a>

### 4. 인증: JWT Bearer + appSlug 검증

[통합한 설명 보기](../api-contract/auth-flow.md)

### 5. 검색: `SearchRequest` DSL

[통합한 설명 보기](../api-contract/search-request.md)

## API 호출 패턴

[통합한 설명 보기](../features/backend-api-kit.md)

## 짝 동기화 매트릭스

[통합한 설명 보기](../api-contract/README.md#쌍-운영-규칙)

## 자주 빠지는 함정

[통합한 설명 보기](../api-contract/response-schema.md#필드-네이밍)

## 관련 문서 (api-contract/ 디렉토리)

[통합한 설명 보기](../api-contract/README.md)

## 관련 ADR

[통합한 설명 보기](../api-contract/README.md)
