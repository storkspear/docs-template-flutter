# docs-template-flutter

[`template-flutter`](https://github.com/storkspear/template-flutter) 의 `docs/` 를 웹에서 읽을 수 있게 만든 정적 사이트입니다. 이 레포에는 `docs/` 복사본이 들어 있고, SPA (index.html + assets/*) 가 브라우저에서 마크다운을 불러와 렌더링합니다.

## 사이트 주소

**<https://storkspear.github.io/docs-template-flutter/>**

이 문서 레포는 공개되어 있어 위 주소로 누구나 볼 수 있습니다. 원본 레포 `template-flutter` 는 비공개라서, 이 문서에 있는 원본 레포 링크는 접근 권한이 있는 사람만 열 수 있습니다.

사이드바 네비게이션과 Mermaid 다이어그램, 내부 링크의 SPA 라우팅을 지원하고, 문서 아래쪽 footer 카드에서는 책 목차와 관련 문서를 나눠서 보여 줍니다.

## 구조

```
.
├── index.html            # SPA 진입점
├── blog_server.py        # 로컬 확인용 서버 (포트 8878)
├── assets/
│   ├── app.js            # 마크다운 로드 / 렌더 / 사이드바 / 링크 인터셉트
│   ├── style.css
│   └── diagrams.js       # 커스텀 다이어그램 렌더링
└── docs/
    ├── manifest.json     # 사이드바 그룹 · 문서 순서 정의
    ├── README.md         # 책 목차 (사이드바 진입점)
    └── **/*.md           # template-flutter 에서 복사된 문서
```

## 로컬에서 실행

```bash
python3 blog_server.py
# 또는
python3 -m http.server 8878
# http://localhost:8878 접속
```

`file://` 로 직접 열면 CORS 정책 때문에 `fetch('docs/...')` 요청이 실패하므로, 반드시 로컬 서버를 띄워서 확인합니다.

## 문서를 수정하는 순서

1. `template-flutter/docs/` 에서 먼저 수정하고 main 에 push 합니다.
2. 원본 레포의 `.github/workflows/sync-docs.yml` 이 `scripts/docs/sync-docs.sh` 로 `docs/` 를 이 레포에 복사하고, 풀 리퀘스트를 만들어 바로 squash 머지합니다. 워크플로가 동작하지 않을 때만 원본 레포에서 같은 스크립트를 직접 실행합니다.
3. 새 파일을 추가했거나 문서 순서를 바꿨다면 이 레포의 `docs/manifest.json` 을 직접 수정합니다. 이 파일은 복사 대상에서 빠집니다.
4. main 에 머지되면 `.github/workflows/deploy.yml` 이 GitHub Pages 에 배포합니다.

## 자동 배포

main 에 push 하면 `.github/workflows/deploy.yml` 이 자동으로 배포합니다. 따로 빌드하는 단계 없이 레포 루트의 정적 파일을 업로드합니다.

## 참고

- 원본 레포: [`template-flutter`](https://github.com/storkspear/template-flutter)
- 다른 템플릿 문서 사이트: [`docs-template-spring`](https://storkspear.github.io/docs-template-spring/)
