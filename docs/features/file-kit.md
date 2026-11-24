<a id="file_kit"></a>

# file_kit

`FileService`는 업로드 티켓을 받은 뒤 파일을 스토리지에 직접 올리고, 다운로드 URL을 조회해요. 화면과 라우트는 제공하지 않으며 `fileServiceProvider`로 사용해요. 파일 선택 UI, 업로드 취소·진행률 표시, 게시물에 첨부하는 흐름은 파생 앱에서 구성해요.

---

## 개요

먼저 `POST /files/uploads` 로 티켓을 받고, 티켓의 URL 에 presigned POST multipart 업로드를 수행한 뒤 `GET /files/{key}` 로 다운로드 정보를 조회해요. 스토리지는 서명된 policy 의 크기·Content-Type 조건을 검사해요. 이 검사는 선언된 Content-Type 조건이며 파일 내용 자체의 형식이나 안전성을 검사한다는 뜻은 아니에요.

스토리지 업로드는 앱 API prefix 와 응답 봉투를 사용하지 않는 외부 호스트 요청이에요. 따라서 AuthInterceptor 가 없는 별도 Dio 로 보내며 앱의 Authorization 헤더를 붙이지 않아요. 첨부 식별자는 티켓의 `attachmentKey`, 조회 경로의 `{key}`, 게시물의 `attachmentKeys` 에 같은 값을 사용해요.

> BackendApiKit 은 공통 API 전송을 맡고 FileKit 은 티켓 발급과 스토리지 업로드 흐름을 맡아요. 파일 선택 화면과 게시물 첨부 UI 는 파생 앱의 features 에서 구성해요.

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

의존이 빠지면 `configure_app.dart --audit` 가 CI 에서 차단해요:

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

<a id="업로드--게시물-첨부"></a>

### 업로드 → 게시물 첨부

```dart
class ComposeViewModel extends Notifier<ComposeState> {
  @override
  ComposeState build() => const ComposeState();

  Ref get _ref => ref;

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
// 타입/용량 위반은 **티켓 발급 단계**에서만 나와요 (서버가 검증).
try {
  final ticket = await file.requestUpload(
    filename: name,
    contentType: mime,
    sizeBytes: bytes.length,
  );
  // 스토리지 업로드는 우리 엔벨로프 밖 — ApiException.unknown 으로 올라와요.
  try {
    await file.uploadBytes(ticket: ticket, bytes: bytes);
  } on ApiException catch (_) {
    // '업로드에 실패했어요'
  }
} on ApiException catch (e) {
  final msg = switch (e.code) {
    ErrorCode.contentTypeNotAllowed => '지원하지 않는 형식이에요',
    ErrorCode.fileSizeExceeded => '파일이 너무 커요',
    _ => '업로드를 시작하지 못했어요',
  };
  // ...
}
```

`uploadBytes` 의 스토리지 실패는 우리 `ApiResponse` 엔벨로프 밖이라 `ApiException.unknown` 으로 올라와요 — `ATC_002`/`ATC_003` 으로는 분기되지 않아요.

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
