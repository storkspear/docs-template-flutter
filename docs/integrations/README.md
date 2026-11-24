# 통합 가이드 (Integrations)

Sentry, PostHog, FCM, AdMob, Play Store 같은 외부 서비스를 연결하는 절차를 모았어요. 사용할 서비스를 정한 뒤 키 발급, 앱 설정, 동작 확인 순서로 따라가요.

> 외부 서비스 설정은 이 폴더에서, Kit 의 사용법과 의존성은 [`Features`](../features/README.md) 에서 확인해요.

---

## 가이드 목록

| 가이드 | 다루는 외부 서비스 | 관련 Kit |
|---|---|---|
| [`sentry.md`](./sentry.md) | Sentry — 크래시 / 에러 추적 | `observability_kit` |
| [`posthog.md`](./posthog.md) | PostHog — 사용자 행동 분석 | `observability_kit` |
| [`fcm.md`](./fcm.md) | Firebase Cloud Messaging — 푸시 알림 | `notifications_kit` + `backend_api_kit` |
| [`google-apple-auth.md`](./google-apple-auth.md) | Google Cloud + Apple Developer — 소셜 로그인 키 발급 | `auth_kit` |
| [`kakao-naver-auth.md`](./kakao-naver-auth.md) | Kakao + Naver Developers — 한국 시장 소셜 로그인 | `auth_kit` |
| [`analytics.md`](./analytics.md) | 분석 도구 선택 비교 | `observability_kit` |
| [`Android 배포`](../infra/android-deployment.md) | Play Console 설정과 GitHub Actions 배포 절차 | 인프라 |
| [`보안`](../infra/security.md) | 난독화 · 인증서 핀닝 · 토큰 저장 · 개인정보 점검 | 인프라 · 여러 Kit |

---

## 인접 문서

- 빌드/CI 파이프라인 전체 — [`docs/infra/ci-cd.md`](../infra/ci-cd.md)
- Android 출시 상세 — [`docs/infra/android-deployment.md`](../infra/android-deployment.md)
- iOS 출시 상세 — [`docs/infra/ios-deployment.md`](../infra/ios-deployment.md)
- Secrets 관리 — [`docs/infra/secrets-management.md`](../infra/secrets-management.md)

서비스별 설정은 `integrations/` 에, 공통 빌드·배포·보안 절차는 `infra/` 에 둬요. 같은 절차가 필요하면 정본 문서로 연결해요.