# PC Bareun - 작업 진행 상태

## Phase 1: 프로젝트 기반 구축
- [x] Tauri v2 + React + TS + Vite 프로젝트 스캐폴딩
- [x] Tailwind CSS v4 설정 (@tailwindcss/vite 플러그인)
- [x] Pretendard 폰트 설정 (CDN)
- [x] 다크/라이트 테마 시스템 (Zustand + .dark 클래스)
- [x] MainLayout (사이드바 + 헤더 + 콘텐츠 영역)
- [x] React Router 라우팅 설정 (17개 페이지 스텁)
- [x] PROGRESS.md, ARCHITECTURE.md 생성
- [x] 기본 Rust 구조 (lib.rs, commands/, utils/error.rs)
- [x] 첫 빌드 테스트 (`npm run tauri dev`) ✅ 411 crates 63초 컴파일, 앱 창 정상

## Phase 2: 대시보드 + 핵심 시스템 도구
- [x] 대시보드 페이지 (CPU/RAM/디스크 게이지, 시스템 개요) ✅ GaugeChart + Card 컴포넌트
- [x] 서비스 관리 (PowerShell + DataTable UI) ✅ 검색/필터/시작/중지/재시작/시작유형 변경
- [x] 프로그램 삭제 (레지스트리 열거 + 제거 실행) ✅ 검색/정렬/제거 UI
- [x] 개인정보 삭제 (브라우저 캐시/쿠키 스캔 + 정리) ✅ 5단계 UI + 그룹별 체크박스

## Phase 3: 하드웨어 모니터링
- [x] CPU/GPU 온도 (실시간 폴링 + 게이지 UI) ✅ WMI/nvidia-smi + 게이지 + LineChart 이력
- [x] 하드디스크 상태점검 + 사용시간 (SMART 데이터) ✅ Get-PhysicalDisk + SMART 카드 UI
- [x] 블루스크린 분석 (미니덤프 파싱) ✅ 이벤트 로그 + BugCheck 매핑 타임라인

## Phase 4: 디스크 / 파일 도구
- [x] 파일 강제삭제 ✅ Rust/PowerShell 3단계 폴백 + 경로 입력 UI
- [x] 디스크 공간 시각화 (트리맵) ✅ Recharts 트리맵 + 로컬 드라이브 스캔
- [x] 중복 파일 헌터 (blake3 해싱) ✅ blake3 해싱 + 원본 1개 남기기 자동 선택

## Phase 5: 고급 기능
- [x] 작업 스케줄러 관리 ✅ Task Scheduler COM + 활성화/비활성화/즉시실행
- [x] 종료 타이머 ✅ shutdown/restart/sleep 예약 UI
- [x] DNS 변조 체크 ✅ DNS 안전성 검증 + 자동 복구
- [x] 찌꺼기 완전삭제 언인스톨러 ✅ 잔여 파일/레지스트리 스캔 + 삭제
- [x] 소프트웨어 일괄 업데이트 ✅ winget 연동 + 개별 업데이트 UI
- [x] 우클릭 메뉴 관리자 ✅ LegacyDisable 토글 + 위치필터 + 삭제

## Phase 6: 마무리 및 배포
- [x] 설정 페이지 (테마, 정보) ✅ 라이트/다크/시스템 테마 + 앱 정보 + 링크
- [x] NSIS 인스톨러 설정 (한국어) ✅ Korean/English 언어 선택 + startMenu 폴더
- [x] GitHub Actions CI/CD ✅ ci.yml (PR 체크) + release.yml (태그 빌드+릴리스)
- [x] 자동 업데이트 (tauri-plugin-updater) ✅ Rust 플러그인 + npm 패키지 설치

## 현재 작업
Phase 6 완료 ✅ - 전체 프로젝트 완료!

## 알려진 이슈
- ~~Lucide React의 `Dns` 아이콘~~ → `Globe`로 교체 완료
- `cargo` PATH 이슈: Git Bash에서 직접 실행 시 PATH 추가 필요
