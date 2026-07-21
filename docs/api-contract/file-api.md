# File API

앱 유저가 파일(이미지)을 **presigned POST policy** 로 스토리지에 직접 업로드하고, 본인 소유 또는 공개 게시물 첨부를 **presigned GET** 으로 조회하는 계약. 짝 백엔드의 [`FileController`](https://github.com/storkspear/template-spring/blob/main/core/core-attachment-impl/src/main/java/com/factory/core/attachment/impl/controller/FileController.java) 와 1:1 결합.

Flutter 측 호출은 [`lib/kits/file_kit/file_service.dart`](../../lib/kits/file_kit/file_service.dart) 의 `FileService` 가 담당해요. kit 사용법은 [`features/file-kit.md`](../features/file-kit.md).

> **왜 presigned POST policy 인가?** presigned PUT 은 스토리지가 실제 크기·타입을 강제하지 못해요(URL 만 있으면 임의 바이트 업로드 가능). POST policy 는 서버가 **content-length-range·Content-Type 을 서명(policy)에 바인딩**해서, 티켓에 선언한 크기·타입을 넘는 업로드를 스토리지가 거부해요 (임의 크기 업로드로 스토리지 소진·타입 위장 stored-XSS 우회 차단).

---

## 엔드포인트

| Method | Path | 인증 | Response |
|---|---|---|---|
| POST | `/api/apps/{appSlug}/files/uploads` | 필수 | `ApiResponse<FileUploadResponse>` |
| GET | `/api/apps/{appSlug}/files/{key}` | 필수 | `ApiResponse<FileDownloadResponse>` |

> `/api/apps/{appSlug}` prefix 는 `ApiClient.post` / `ApiClient.get` 이 자동 적용해요 (상대 경로 `ApiEndpoints.fileUploads` · `fileByKey(key)`). **실제 바이트 업로드**(`uploadUrl` POST)는 외부 스토리지 절대 URL 이라 prefix 대상이 아니에요.

앱 계약의 단일 식별자는 **`storageKey`(UUID, 비추측)** 예요 — admin(`attachmentId`, 내부 id 노출)과 달라요. 업로드 응답의 `attachmentKey` = GET `{key}` = 게시물 `attachmentKeys[]` 가 모두 같은 값이에요.

---

## 1. 업로드 티켓 발급 (POST `/files/uploads`)

파일 선택 직후 호출해서 **presigned POST policy** 를 받아요.

### Request

```http
POST /api/apps/{appSlug}/files/uploads
Authorization: Bearer <access_token>
Content-Type: application/json
```

```json
{
  "filename": "photo.png",
  "contentType": "image/png",
  "sizeBytes": 204800
}
```

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `filename` | string | ✅ | 원본 파일명 (≤255) — 콘솔·다운로드 메타로 보존 |
| `contentType` | string | ✅ | MIME 타입 (≤100). 서버 화이트리스트 **정확 매치** (기본 `image/jpeg,image/png,image/webp,image/gif,image/heic`). 위반 시 `ATC_002` |
| `sizeBytes` | number | ✅ | 파일 크기 (>0). 정책 상한(기본 10MiB) 초과 시 `ATC_003` |

> 짝 백엔드 `FileUploadRequest` record 3필드 그대로예요 — 계약 변경 시 이 record 가 진실의 출처.

### Response

```json
{
  "data": {
    "attachmentKey": "9f1c8b2e-7a44-4c1e-9d3a-1b2c3d4e5f60",
    "uploadUrl": "https://<storage-host>/template-uploads",
    "formFields": {
      "key": "9f1c8b2e-7a44-4c1e-9d3a-1b2c3d4e5f60",
      "Content-Type": "image/png",
      "policy": "eyJleHBpcmF0aW9uIjoi...",
      "x-amz-algorithm": "AWS4-HMAC-SHA256",
      "x-amz-credential": "AKIA.../20260722/ap-southeast-2/s3/aws4_request",
      "x-amz-date": "20260722T011900Z",
      "x-amz-signature": "3a7bd3e2360a..."
    },
    "previewUrl": "https://<storage-host>/template-uploads/9f1c...?X-Amz-Signature=...",
    "expiresAt": "2026-07-22T01:29:00Z"
  },
  "error": null
}
```

| 필드 | 타입 | 설명 |
|---|---|---|
| `attachmentKey` | string | storageKey(UUID). 업로드 성공 후 게시물 `attachmentKeys[]` 로 연관 확정 |
| `uploadUrl` | string | presigned POST 대상 절대 URL (multipart POST) |
| `formFields` | object(string→string) | 폼 필수 필드(`key`·`Content-Type`·`policy`·`x-amz-*` 서명) — **그대로** 전송 |
| `previewUrl` | string | 업로드 직후 미리보기용 presigned GET URL (~10분) |
| `expiresAt` | string(ISO-8601) | `uploadUrl`(policy) 만료 시각 |

> 짝 백엔드 `FileUploadResponse` record 5필드 그대로예요.

---

## 2. presigned POST 업로드 (`uploadUrl` 로 multipart POST)

**우리 `ApiClient` 계약 밖의 raw multipart** 예요 — 대상이 외부 스토리지 호스트라 Authorization 헤더를 붙이면 안 되고(서명 불일치), 응답도 우리 `{data, error}` 엔벨로프가 아니에요. `FileService` 는 **인터셉터 없는 별도 Dio** 로 전송해요.

```http
POST <uploadUrl>
Content-Type: multipart/form-data; boundary=...
```

멀티파트 순서 규약 (S3 호환 presigned POST):

1. `formFields` 의 모든 항목을 **폼 파트로 먼저** (순서 무관: `key`·`Content-Type`·`policy`·`x-amz-*`).
2. **마지막에** `file` 파트로 바이너리.

`file` 파트가 반드시 끝에 와야 스토리지가 policy 를 정상 검증해요. 성공 응답은 스토리지 정책에 따라 `204 No Content` 또는 `201 Created` — `FileService.uploadBytes` 는 **2xx 여부만** 확인해요. content-length-range·Content-Type 이 서명에 바인딩돼 있어, 티켓 선언값을 넘거나 다른 타입이면 스토리지가 `403` 으로 거부해요.

---

## 3. 다운로드 URL 조회 (GET `/files/{key}`)

### Request

```http
GET /api/apps/{appSlug}/files/{key}
Authorization: Bearer <access_token>
```

`{key}` 는 업로드로 받은 `attachmentKey`.

### 인가

`status==ACTIVE` **그리고** (`업로더 본인` **또는** `공개(ACTIVE) 게시물에 연관 확정된 첨부`) 일 때만 발급해요. 불충족·검역·삭제는 **전부 `ATC_001`(404, 존재 은닉)**.

### Response

```json
{
  "data": {
    "downloadUrl": "https://<storage-host>/template-uploads/9f1c...?X-Amz-Signature=...",
    "expiresAt": "2026-07-22T01:29:00Z",
    "contentType": "image/png",
    "sizeBytes": 204800,
    "originalFilename": "photo.png"
  },
  "error": null
}
```

| 필드 | 타입 | 설명 |
|---|---|---|
| `downloadUrl` | string | presigned GET URL (~10분). `content-disposition=attachment` 이 서명에 포함(top-level 네비게이션 stored-XSS 방어심화 — `<img>` 임베드엔 영향 없음) |
| `expiresAt` | string(ISO-8601) | `downloadUrl` 만료 시각 |
| `contentType` | string | 저장 시 기록된 MIME |
| `sizeBytes` | number | 파일 크기 |
| `originalFilename` | string | 업로드 시 `filename` |

> 짝 백엔드 `FileDownloadResponse` record 5필드 그대로예요.

---

## 4. 게시물 첨부 연관 (`PostWriteRequest.attachmentKeys`)

게시물 작성 body 의 `attachmentKeys: List<String>`(선택, **≤10**) 로 업로드한 파일을 연관 확정해요. 서버가 **업로더 본인 검증**(`uploaded_by == authorUserId`)을 하므로 타인이 선업로드한 키를 가로챌 수 없어요. 위반 시 `ATC_004`.

> 게시물 작성 흐름 자체는 파생 레포 `features/` 영역이에요 — 템플릿은 `file_kit` 서비스(업로드/조회)까지만 제공하고, `attachmentKeys` 조립 예시는 [`features/file-kit.md`](../features/file-kit.md) 에 있어요.

---

## 에러 코드

| Code | HTTP | 상황 |
|---|---|---|
| `ATC_001` | 404 | 파일 미존재·비ACTIVE·소유/공개 불충족 (조회, 존재 은닉 공용) |
| `ATC_002` | 422 | content-type 화이트리스트 위반 (티켓 발급) |
| `ATC_003` | 413 | `sizeBytes` 정책 상한 초과 (티켓 발급) |
| `ATC_004` | 422 | `attachmentKeys` 연관 검증 위반 (게시물 작성) |

전체 매핑은 [`error-codes.md`](./error-codes.md#첨부파일-도메인--atc_-attachmenterror).

---

## 클라이언트 호출 패턴

```dart
final file = ref.read(fileServiceProvider);

// 1) 티켓 발급 → 2) presigned POST 업로드 → 3) attachmentKey 반환
final ticket = await file.requestUpload(
  filename: 'photo.png',
  contentType: 'image/png',
  sizeBytes: bytes.length,
);
await file.uploadBytes(ticket: ticket, bytes: bytes);
// ticket.attachmentKey 를 게시물 작성 attachmentKeys 로 전달 (features/ 영역)

// 조회 (본인 소유 또는 공개 게시물 첨부)
final dl = await file.getDownloadUrl(ticket.attachmentKey);
// dl.downloadUrl 로 이미지 로드
```

---

## 계약 변경 시

- 화이트리스트 content-type · size 상한은 **서버 정책**(`app.uploads.*`)이라 클라 변경 불필요 — 서버가 `ATC_002`/`ATC_003` 로 강제.
- `attachmentKeys` 상한(10)·필드 추가는 백엔드 리드 + 스냅샷(`PostWriteRequest`) 재생성 후 `refresh-spec.sh` 동기화.

---

## 관련 문서

- [`features/file-kit.md`](../features/file-kit.md) — file_kit 사용법·파생 레포 체크리스트
- [`error-codes.md`](./error-codes.md) — `ATC_*` 매핑
- [`response-schema.md`](./response-schema.md) — `ApiResponse<T>` 래퍼
- [짝 백엔드 `FileController`](https://github.com/storkspear/template-spring/blob/main/core/core-attachment-impl/src/main/java/com/factory/core/attachment/impl/controller/FileController.java)
