# file_kit

**앱 파일 업로드(presigned POST policy) + presigned GET 조회** 도메인 서비스. 라우트/화면 없는 순수 서비스 kit — `fileServiceProvider` 하나를 노출해요. 백엔드 연동 파일 첨부 기능이 필요할 때 활성화.

---

## 개요

- **3단계 흐름**: 티켓 발급(`POST /files/uploads`) → presigned POST 업로드(`uploadUrl` raw multipart) → 조회(`GET /files/{key}`)
- **presigned POST policy**: 서버가 content-length-range·Content-Type 을 서명(policy)에 바인딩 — 티켓 선언값을 넘는 업로드를 스토리지가 거부 (presigned PUT 과 달리 실제 크기·타입 강제)
- **별도 Dio 로 스토리지 직송**: presigned 업로드는 `ApiClient` 계약(`/api/apps/{slug}` prefix + `ApiResponse{data,error}` 엔벨로프 + Auth 인터셉터) **밖의 외부 호스트** 라, 인터셉터 없는 별도 Dio 로 전송 (Authorization 헤더 미부착 — 서명 불일치·자격 누출 방지)
- 단일 식별자 `storageKey`(UUID): 업로드 응답 `attachmentKey` = GET `{key}` = 게시물 `attachmentKeys[]`

> **왜 backend_api_kit 확장이 아니라 신규 kit?** backend_api_kit 은 순수 transport(Dio+인터셉터 3종, 도메인 무지)이고, 도메인 플로우는 전용 kit(auth·payment)로 분리하는 구조예요. presigned 업로드는 절대 URL 로 스토리지에 직접 쏘는 raw HTTP — `ApiClient` 계약 밖이라 별도 kit 분리가 자연스러워요.

---

## 활성화

```yaml
# app_kits.yaml
kits:
  backend_api_kit: {}
  file_kit: {}          # requires backend_api_kit
```

```dart
// lib/main.dart
await AppKits.install([
  BackendApiKit(),
  AuthKit(...),
  FileKit(),
]);
```

의존이 빠지면 `configure_app.dart --audit` 가 CI 에서 차단:

```text
✗ file_kit requires backend_api_kit, which is not enabled
```

---

## 제공 기능

| 항목 | 설명 |
|------|------|
| `FileKit` | `AppKit` 구현 — `requires: [BackendApiKit]`. 라우트/부트스텝/override 없음 |
| `fileServiceProvider` | `FileService` 조회 (top-level provider — `apiClientProvider` watch) |
| `FileService` | `requestUpload` · `uploadBytes` · `getDownloadUrl` |
| `FileUploadResponse` | 티켓 응답 값 객체 (`attachmentKey`·`uploadUrl`·`formFields`·`previewUrl`·`expiresAt`) |
| `FileDownloadResponse` | 조회 응답 값 객체 (`downloadUrl`·`expiresAt`·`contentType`·`sizeBytes`·`originalFilename`) |

---

## 핵심 API

```dart
// 1) 티켓 발급 — 파일 선택 직후. 화이트리스트·상한은 서버가 검증(ATC_002/003).
Future<FileUploadResponse> requestUpload({
  required String filename,
  required String contentType,
  required int sizeBytes,
});

// 2) presigned POST 업로드 — formFields 폼 파트 먼저 + 마지막 file 파트. 2xx 확인.
Future<void> uploadBytes({
  required FileUploadResponse ticket,
  required Uint8List bytes,
  String filename = 'file',
});

// 3) presigned GET 조회 — 본인 소유 또는 공개 게시물 첨부만. 그 외 ATC_001(404).
Future<FileDownloadResponse> getDownloadUrl(String key);
```

---

## 일반 사용 예

### 업로드 → 게시물 첨부

```dart
class ComposeViewModel extends StateNotifier<ComposeState> {
  ComposeViewModel(this._ref) : super(const ComposeState());
  final Ref _ref;

  Future<String> attach(Uint8List bytes, String name, String mime) async {
    final file = _ref.read(fileServiceProvider);
    final ticket = await file.requestUpload(
      filename: name,
      contentType: mime,
      sizeBytes: bytes.length,
    );
    await file.uploadBytes(ticket: ticket, bytes: bytes);
    return ticket.attachmentKey; // 게시물 작성 attachmentKeys 로 전달
  }
}
```

게시물 작성 body(`PostWriteRequest`)의 `attachmentKeys: List<String>`(≤10)에 `attachmentKey` 들을 넣어 보내면 서버가 연관을 확정해요. 서버가 **업로더 본인 검증**을 하므로 타인이 선업로드한 키는 `ATC_004` 로 거부돼요. (게시물 작성 화면 자체는 파생 레포 `features/` 영역 — 템플릿은 업로드/조회 서비스까지.)

### 조회

```dart
final dl = await ref.read(fileServiceProvider).getDownloadUrl(key);
Image.network(dl.downloadUrl); // ~10분 만료 presigned GET
```

### 에러 분기

```dart
try {
  await file.uploadBytes(ticket: ticket, bytes: bytes);
} on ApiException catch (e) {
  final msg = switch (e.code) {
    ErrorCode.contentTypeNotAllowed => '지원하지 않는 형식이에요',
    ErrorCode.fileSizeExceeded => '파일이 너무 커요',
    _ => '업로드에 실패했어요',
  };
  // ...
}
```

---

## 파생 레포 체크리스트

- [ ] `backend_api_kit` 활성 (`requires` 자동 검증)
- [ ] 백엔드 `app.uploads.*` 정책 확인 — 허용 content-type · `max-size-bytes`(기본 10MiB)
- [ ] 파일 **선택** 플러그인은 파생 레포가 선택 (예: `image_picker`) — file_kit 은 바이트를 받는 계층
- [ ] 게시물 첨부 UI(`attachmentKeys` 조립)는 `features/` 에서 구현

---

## Code References

- [`lib/kits/file_kit/file_service.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/file_kit/file_service.dart) — 서비스 + 응답 값 객체
- [`lib/kits/file_kit/file_kit.dart`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/file_kit/file_kit.dart) — AppKit + `fileServiceProvider`
- [`lib/kits/file_kit/README.md`](https://github.com/storkspear/template-flutter/blob/main/lib/kits/file_kit/README.md) — kit 상세
- [`docs/api-contract/file-api.md`](../api-contract/file-api.md) — 백엔드 계약 (wire shape·에러코드)

---

## 관련 문서

- [`api-contract/file-api.md`](../api-contract/file-api.md) — 파일 API 계약
- [`backend-api-kit.md`](./backend-api-kit.md) — `ApiClient` (티켓 발급/조회 transport)
- [`ADR-009 · 백엔드 계약`](../philosophy/adr-009-backend-contract.md)
