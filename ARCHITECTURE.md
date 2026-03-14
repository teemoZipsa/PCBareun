# PC Bareun - 아키텍처 문서

## 기술 스택
- **프레임워크:** Tauri v2 (Rust + React)
- **프론트엔드:** React 19 + TypeScript + Vite 7
- **스타일:** Tailwind CSS v4 (`@tailwindcss/vite` 플러그인, `@theme` 디렉티브)
- **상태관리:** Zustand (persist middleware 사용)
- **라우팅:** React Router v7
- **차트:** Recharts
- **아이콘:** Lucide React
- **폰트:** Pretendard (CDN)

## 프로젝트 구조

```
src/
├── main.tsx                    # React 엔트리 포인트
├── App.tsx                     # 라우터 (17개 라우트)
├── styles/globals.css          # Tailwind + 테마 변수
├── components/
│   ├── layout/
│   │   ├── MainLayout.tsx      # Sidebar + Header + Outlet
│   │   ├── Sidebar.tsx         # 사이드바 네비게이션
│   │   └── Header.tsx          # 페이지 타이틀 + 테마 토글
│   └── common/                 # 재사용 컴포넌트 (TODO)
├── pages/                      # 17개 기능별 페이지
├── hooks/                      # 커스텀 훅 (TODO)
├── lib/                        # 유틸리티 (TODO)
└── store/
    └── themeStore.ts           # 다크/라이트 테마 상태

src-tauri/
├── tauri.conf.json             # Tauri 설정 (1200x800, identifier: com.pcbareun.app)
├── Cargo.toml                  # Rust 의존성
└── src/
    ├── main.rs                 # Windows 엔트리
    ├── lib.rs                  # Tauri Builder + 커맨드 등록
    ├── commands/
    │   ├── mod.rs
    │   └── dashboard.rs        # get_system_overview (sysinfo)
    └── utils/
        ├── mod.rs
        └── error.rs            # AppError (thiserror)
```

## 핵심 패턴

### 테마 시스템
- Zustand `themeStore`에서 `isDark` 상태 관리
- `MainLayout`에서 `document.documentElement`에 `.dark` 클래스 토글
- CSS 변수 기반: `--color-*` 변수가 `.dark` 클래스에 따라 변경
- `localStorage`에 persist (`pcbareun-theme` 키)

### Tauri 커맨드 호출 패턴
```typescript
import { invoke } from "@tauri-apps/api/core";
const data = await invoke<SystemOverview>("get_system_overview");
```

### Rust 2-레이어 아키텍처
- `commands/` - Tauri 커맨드 핸들러 (직렬화/역직렬화)
- 향후 `modules/` - 순수 비즈니스 로직 (필요 시 추가)

### 경로 별칭
- TypeScript: `@/*` → `./src/*` (tsconfig.json)
- Vite: `@` → `./src` (vite.config.ts)

## Rust 의존성
| 크레이트 | 버전 | 용도 |
|----------|------|------|
| tauri | 2.10.3 | 프레임워크 |
| sysinfo | 0.35 | CPU/RAM/디스크/프로세스 |
| thiserror | 2 | 에러 타입 |
| tokio | 1 (full) | 비동기 런타임 |
| serde/serde_json | 1.0 | 직렬화 |
