# 📱 flutter-mobile-template — 시작하기

이 문서는 `flutter-mobile-template`을 처음 접하는 개발자가 **어디서 시작해서 어떻게 흘러가는지**를 순서대로 안내합니다.

이 템플릿은 **솔로 인디 개발자가 여러 Flutter 앱을 빠른 주기로 출시**하기 위한 공통 뼈대입니다. 새 앱 아이디어가 떠오르면 10분 안에 scaffold하고, 도메인 코드만 작성해 출시하는 것이 목표입니다.

> 막히면 [짐로그 튜토리얼](tutorials/build-gymlog.md)을 먼저 훑어보세요. 처음부터 끝까지 따라갈 수 있는 12단계 walkthrough가 있습니다.

---

## 0. 이 템플릿이 뭐야? (5분)

`flutter-mobile-template`은 **`spring-backend-template`의 프론트엔드 짝**입니다.

```
spring-backend-template  ←→  flutter-mobile-template
(인증, 유저, 푸시, API)       (네트워크, 인증 UI, 테마, 캐시)
```

두 템플릿이 같은 API 계약을 공유합니다. 백엔드 `ApiResponse<T>` ↔ Flutter `ApiResponse<T>`가 1:1 대응합니다.

핵심 설계 철학이 궁금하다면 → [Philosophy](integrations/philosophy.md)

---

## 1. 어떻게 쓰나? — Use this template (10분)

이 레포를 직접 개발하지 않습니다. **GitHub "Use this template"으로 파생 레포를 만든 뒤 그곳에서 개발합니다.**

```
flutter-mobile-template (이 레포, 건드리지 않음)
        ↓ Use this template
my-app (실제 앱 개발 레포)
```

1. GitHub에서 `Use this template` → `Create a new repository`
2. 파생 레포 이름: 앱 이름으로 설정 (예: `sumtally`, `richandyoung`)
3. 클론 후 `AppConfig`에서 `appSlug`, `appName`, `baseUrl` 설정
4. `AppPalette`에서 `seed` 색상 1개 교체 → 앱 전체 색감 변경

---

## 2. 구조 파악 — Kit 패턴 (15분)

이 템플릿의 핵심 개념은 **Kit**입니다.

```
lib/kits/
├── auth_kit/           # 로그인/회원가입 UI + 서비스
├── backend_api_kit/    # HTTP 클라이언트 + 인터셉터
├── observability_kit/  # Sentry + PostHog (Debug 구현 기본)
├── notifications_kit/  # FCM (Debug 구현 기본)
├── local_db_kit/       # SQLite 마이그레이션
├── nav_shell_kit/      # 하단 탭 네비게이션
└── ...
```

각 Kit은 **추상 인터페이스 + Debug 기본 구현**으로 제공됩니다. 파생 레포에서 실제 서비스(Sentry, PostHog, FCM)로 교체합니다.

Kit 패턴 상세 → [Kits 컨벤션](conventions/kits.md)

---

## 3. 첫 화면 만들기 — Feature 추가 (30분)

Kit 구조 위에 도메인 Feature를 추가합니다.

```
lib/features/{domain}/
├── {domain}_screen.dart       # ConsumerWidget — UI만
├── {domain}_view_model.dart   # StateNotifier — 로직만
└── models/                    # 도메인 모델
```

MVVM 규칙:
- Screen에 비즈니스 로직 작성 금지
- ViewModel에 `BuildContext`, `Widget` 코드 작성 금지
- ViewModel은 `autoDispose`로 선언 — 화면 이탈 시 자동 정리

실제 예시 → [짐로그 앱 만들기 튜토리얼](tutorials/build-gymlog.md) **§4 ~ §7**

---

## 4. 외부 서비스 연동 — Integrations (1시간)

파생 레포에서 실제 서비스로 교체합니다.

| 서비스 | 가이드 |
|--------|--------|
| Sentry (크래시 리포팅) | [sentry.md](integrations/sentry.md) |
| PostHog (사용자 분석) | [posthog.md](integrations/posthog.md) |
| FCM (푸시 알림) | [fcm.md](integrations/fcm.md) |
| Android 배포 | [deployment-android.md](integrations/deployment-android.md) |
| 보안 설정 | [security.md](integrations/security.md) |

연동 없이 개발 중에는 Debug 구현이 자동으로 동작합니다. 아무것도 터지지 않고 로그만 출력됩니다.

---

## 5. 공통 코드 전파 — cherry-pick

템플릿에 새 Kit이나 버그 수정이 생겼을 때 파생 레포로 가져옵니다.

```bash
git remote add template https://github.com/storkspear/flutter-mobile-template.git
git fetch template
git cherry-pick <commit-hash>
```

자동 전파 없음. 각 앱이 자기 속도로 이행합니다.

---

## 참조 문서

| 궁금한 것 | 문서 |
|-----------|------|
| 왜 이렇게 설계했나? | [Philosophy](integrations/philosophy.md) |
| Kit 패턴 상세 | [Kits](conventions/kits.md) |
| 아키텍처 / 폴더 구조 | [Architecture](conventions/architecture.md) |
| API 계약 규칙 | [API Contract](conventions/api-contract.md) |
| 로딩 UX 패턴 | [Loading UX](conventions/loading.md) |
| 네이밍 규칙 | [Naming](conventions/naming.md) |
| 12단계 실전 walkthrough | [짐로그 앱 만들기](tutorials/build-gymlog.md) |
