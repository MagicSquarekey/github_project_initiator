# github_project_initiator

<details>
<summary>🌐 Languages · 30</summary>

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · **한국어** · [Español](README.es.md) · [Português](README.pt.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Italiano](README.it.md) · [Русский](README.ru.md) · [العربية](README.ar.md) · [हिन्दी](README.hi.md) · [বাংলা](README.bn.md) · [اردو](README.ur.md) · [فارسی](README.fa.md) · [Türkçe](README.tr.md) · [Tiếng Việt](README.vi.md) · [ไทย](README.th.md) · [Bahasa Indonesia](README.id.md) · [Bahasa Melayu](README.ms.md) · [Nederlands](README.nl.md) · [Polski](README.pl.md) · [Українська](README.uk.md) · [Svenska](README.sv.md) · [Čeština](README.cs.md) · [Română](README.ro.md) · [Ελληνικά](README.el.md) · [Magyar](README.hu.md) · [עברית](README.he.md)

</details>

> 모든 GitHub 프로젝트를 한곳에서 관리하는 로컬 런처 — 상태 확인, 시작/중지, 원클릭 업데이트.

의존성이 없는 Node.js 서비스와 단일 페이지 대시보드. 머신의 프로젝트를 모니터링하고 시작·중지·업데이트하며, 프로젝트 자체는 절대 수정하지 않습니다.

## 빠른 시작

```bash
node src/index.js
```

열기: http://127.0.0.1:8780

Node.js 20+ 필요. Windows 완전 지원, Linux/macOS는 내장 플랫폼 계층 사용.

## 기능

- **한눈에 보는 상태** — 실행 상태, 포트, PID, 가동 시간을 3초마다 갱신.
- **시작 / 중지 / 재시작** — 각 프로젝트의 기존 시작 스크립트를 그대로 사용.
- **원클릭 업데이트** — 커밋되지 않은 변경을 자동 stash 후 업데이트하고 복원. 실패 시 롤백.
- **어떤 스택이든** — Next.js, FastAPI, Go 바이너리, Godot, pygame, pip 서비스를 한 표에.
- **중/영 이중 언어 + 라이트/다크** — 헤더에서 전환, 설정은 로컬 저장.
- **런처 전용** — 관리 대상에서 git init, 파일 쓰기, 구조 변경을 하지 않습니다.

## 관리 대상

| 프로젝트 | 스택 | 포트 | 업데이트 |
|---|---|---|
| LibreTV | Next.js 15 | 8090 | 포크 동기화 |
| githubPopularProjects | Next.js 15 | 3000 | git pull |
| AutoTestHub | FastAPI + Vue | 8686 / 5173 | git pull |
| qoder2api-hub | Python | 8790 | 수동 |
| wb2api-panel | Go | 7863 | 수동 |
| REA | TypeScript / CLI | — | 수동 |
| 2048 | pygame | — | git pull |
| Grimoire-Echoes | Godot 4 | — | git pull |
| OpenViking | Python | 1933 | 수동 |

## 보안 및 격리

- 127.0.0.1에서만 수신, 인증 없음(단일 사용자 로컬 도구).
- 로컬 설정과 로그는 git에서 제외되며, 이식 가능한 예시만 공개됩니다.
- 관리 대상에 쓰지 않습니다. 쓰기는 사용자가 명시적으로 실행한 업데이트뿐입니다.

## 문서

- [설계 및 아키텍처(중국어)](../design.md)
- [상세 설명(중국어)](../README.full.zh-CN.md)
- `npm test` — 111개 테스트: 파싱, 설정 검증, git 흐름, 대시보드 렌더링
