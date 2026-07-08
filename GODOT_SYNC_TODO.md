# Godot 포팅 대기 목록

지금부터는 별도 지시가 있기 전까지 **웹 버전(`src/`, PixiJS/TS)만 수정**하고,
Godot 버전(`godot/`)은 여기 기록해뒀다가 나중에 한 번에 몰아서 반영합니다.

마지막으로 두 버전이 완전히 동기화된 커밋: `5b01c71`
("Rebind 180 spin to A, fix soft-drop speed bug, add DAS/ARR/SDF/DCD settings")

## 대기 중인 변경사항

### 2026-07-08 (긴급 수정) 4-Wide 이스터에그가 일반 모드 벽 로직에 같이 딸려가던 버그 수정

바로 아래 항목("실제 four-tris대로 재구현")에서 `buildWalls()`/`afterLock()`의 벽
유지 로직을 새 방식(보드 전체 높이 항상 꽉 참)으로 바꿨는데, 이 로직이 `hardcore`
여부와 무관하게 공용으로 호출되고 있어서 **이스터에그(하드코어)의 벽까지 같이
"10줄 재적재"에서 "전체 높이 고정"으로 바뀌어버림**. 사용자가 "이스터에그가 바뀌었잖아,
방해줄 10줄 이런 것도 다 놔두라고"라고 지적해서 완전히 갈라놓음.

- 변경한 웹 파일:
  1. `src/game/FourWidePractice.ts` - 벽 생성/유지 로직을 모드별로 완전히 분리:
     - `buildNormalWalls()`/일반 모드 `afterLock()` 분기: 보드 전체 높이 고정(바로 아래
       항목의 새 로직).
     - `buildHardcoreWalls()`/`hardcoreWallHeight()`/하드코어 `afterLock()` 분기:
       `HARDCORE_WALL_HEIGHT=10`짜리 예전 재적재 로직(`Board.addPartialGarbage()`
       사용) 그대로 복원.
     - `dangerIndicatorEnabled=false`도 일반 모드에서만 끄고, 하드코어는 원래대로
       (벽이 10줄뿐이라 위험 표시가 정상적으로 필요한 시점에만 뜸) 그대로 둠.
  2. `src/game/Board.ts` - 삭제했던 `addPartialGarbage()`를 다시 복원(하드코어 전용으로
     계속 필요).
- 왜: 공용 로직으로 합쳤다가 사용자가 명시적으로 "이스터에그는 절대 건드리지 말라"고
  했던 걸 실수로 어김. 다시는 두 모드가 로직을 공유하지 않도록 완전히 독립된 메서드로
  갈라놓음.
- Godot 쪽 대응: 이식 시 일반/하드코어 벽 로직이 서로 다른 별개 함수라는 점을 반드시
  유지할 것 - 공용 헬퍼로 합치면 이번과 같은 회귀가 재발함.

### 2026-07-08 4-Wide 연습을 실제 four-tris 오픈소스대로 재구현 (일반 모드만)

사용자가 "인터넷에 4wide 관련 자료 없냐, 구현이 이상하다"고 강하게 피드백. 지금까지는
2차 자료(위키/블로그 요약)만 보고 추측해서 구현했는데, 실제 `four-tris`
(github.com/fiorescarlatto/four-tris, AutoIt3로 작성된 `Tetris.au3`)의 `GridSpawn4W()`
/`AddWide()`/`CheckLines()` 소스코드를 `gh` CLI로 직접 받아 확인하고 그대로 재현했다.
이스터에그(하드코어)는 "재밌으니까 그대로 둬라"는 요청대로 콤보 즉사 로직은 안 건드림.

실제 소스에서 확인한 사실:
1. **벽은 "10줄 재적재"가 아니라 보드 전체 높이가 항상 꽉 찬 고정 기둥.** 줄이
   지워져서 맨 위에 빈 줄이 생기면, 그 줄의 벽 부분만 즉시 다시 채워서 절대 무너지지
   않게 유지(`AddWide`). 예전 방식(10줄 목표 높이로만 재적재)은 우물 쌓기가 그보다
   높아지면 클리어가 아예 막혀버리는 구조적 결함이 있었음.
2. **시작 잔여물은 T-스핀 전용 노치가 아니라, 정해진 6가지 3블록 패턴 중 매 판마다
   무작위로 하나** (`Switch Random(0,5,1)`). 우물 왼쪽/오른쪽 3칸이 한 줄로 붙어있는
   형태 2가지 + ㄴ자 모서리 형태 4가지.

- 변경한 웹 파일:
  1. `src/game/FourWidePractice.ts` - 전면 재작성.
     - `buildWalls()`: `TOTAL_ROWS` 전체에 걸쳐 벽 열을 채움(기존엔 10줄만).
     - `RESIDUE_PATTERNS`: 원본 소스의 6가지 케이스를 좌표 그대로 옮김. 매치 시작/재시작
       때 그중 하나를 무작위로 선택(`buildStartingResidue`).
     - `afterLock()`의 벽 유지 로직을 "목표 높이와 비교해 부족한 만큼 삽입"에서
       "전체 높이를 훑어서 비어있는 벽 칸을 즉시 다시 채움"으로 교체 - 훨씬 단순하고
       원본과 동일한 효과.
     - 하드코어 모드의 콤보브레이크 즉사 로직(`this.hardcore` 분기)은 그대로 유지.
  2. `src/game/Board.ts` - 더는 안 쓰는 `addPartialGarbage()` 제거(예전 10줄-재적재
     방식 전용이었음).
  3. `src/game/GameEngine.ts` - `dangerIndicatorEnabled` 플래그 추가(기본 true, 기존
     솔로/PvP/듀오 동작 100% 그대로). 벽이 이제 항상 보드 전체 높이로 꽉 차있어서
     "스택 18줄 이상" 기준의 위험 경고(X 표시)가 상시 켜지는 부작용이 생겨서,
     `FourWidePractice`가 생성자에서 이 값을 `false`로 꺼서 막음.
- 왜: 대충 짐작으로 구현하지 말고 실제 소스를 확인해서 정확히 재현해달라는 요청.
- Godot 쪽 대응: 이식 시 `RESIDUE_PATTERNS` 6종 좌표와 "벽은 항상 전체 높이" 규칙,
  `dangerIndicatorEnabled` 끄는 것까지 같이 반영할 것.

### 2026-07-07 (재정정) 4-Wide 연습: T-스핀 잔여물은 일반 모드 것, 이스터에그는 빈 우물

바로 아래 항목에서 "잔여물을 hardcore 전용으로" 고쳤는데 사용자가 "반대야, 이스터에그가
우물이 빈 거야"라고 정정. 즉 `f69be0d`(원래 구버전, 즉사만 있고 잔여물은 없었음)를
그대로 이스터에그로 복원한 것이므로 **이스터에그=빈 우물+즉사**, **일반(기본)=3블록
잔여물+안 죽음**이 맞는 조합이었음.

- 변경한 웹 파일: `src/game/FourWidePractice.ts`
- 무엇을: `buildStartingResidue()` 호출 조건을 `if (this.hardcore)`에서
  `if (!this.hardcore)`로 뒤집음(생성자 + `restart()` 둘 다). 최종: 일반 모드 = 벽 +
  3블록 잔여물 + 안 죽음, 이스터에그 = 벽만(빈 우물) + 콤보브레이크 즉사.
- 왜: 사용자가 실제 확인 후 조합이 반대로 되어 있었다고 지적.
- Godot 쪽 대응: 이식 시 `!hardcore` 조건으로 반영할 것 (바로 위 항목 대신 이 항목이
  최종본).

### 2026-07-07 (추가 정정) 4-Wide 연습: 시작 잔여물을 하드코어(이스터에그) 전용으로 분리

바로 아래 항목에서 T-스핀 시작 잔여물을 두 모드(일반/이스터에그) 모두에 넣었는데,
사용자가 "이상한 방해칸 3칸이 남아있다"며 일반 모드에는 없어야 한다고 정정. 두 모드를
철저히 분리해달라는 요청.

- 변경한 웹 파일: `src/game/FourWidePractice.ts`
- 무엇을: `buildStartingResidue()` 호출(생성자 + `restart()` 양쪽)을
  `if (this.hardcore)`로 감쌈. 이제 **일반 모드는 우물이 완전히 빈 채로 시작**하고,
  **이스터에그(하드코어)만 3블록 T-스핀 잔여물을 포함**. 벽(양옆 10줄)은 두 모드
  공통.
- 왜: 사용자가 실제로 확인해보고 "일반 모드에는 저 방해칸이 없어야 한다"고 지적.
- Godot 쪽 대응: 이식 시 `buildStartingResidue()` 호출을 `hardcore` 조건부로 유지할 것.

### 2026-07-07 4-Wide 연습: 예전(콤보브레이크 즉사) 버전을 이스터에그로 복원

콤보브레이크 즉사를 없앤 뒤, 그 즉사 버전을 좋아하던 사람들이 많아서 따로 남겨달라는
요청. 완전히 새로 만들지 않고 git 히스토리(커밋 `f69be0d`)에 있던 원래 로직을 그대로
가져와 옵션으로 병합.

- 변경한 웹 파일:
  1. `src/game/FourWidePractice.ts` - 생성자에 `hardcore = false` 파라미터 추가.
     `true`면 `afterLock()`이 예전처럼 콤보가 끊기는 순간(`combo>=0` → `-1`)
     `engine.gameOver=true`로 즉시 끝냄. `false`(기본)면 콤보 카운터만 리셋되고
     계속 진행. 시작 시 T-스핀 잔여물 배치는 두 모드 다 동일하게 유지(별개 개선이라
     되돌리지 않음).
  2. `src/main.ts` - `#menu-4wide` 버튼을 **Shift+클릭**하면 `hardcore=true`로 진입하는
     이스터에그로 구현(`e.shiftKey` 확인). 일반 클릭은 기존과 동일하게 기본 모드.
- 왜: 사용자가 "이전 모드도 유지해달라는 요청이 많아서 이스터에그 느낌으로 남겨달라"고
  요청. 발견 방식(Shift+클릭 vs 콘솔 코드 vs 버튼 연타)을 물어봤고 Shift+클릭으로 확정,
  "git 있으니까 다시 만들지 말고 그걸로 하라"는 지시에 따라 이전 커밋의 로직을 그대로
  재사용.
- Godot 쪽 대응: 4-Wide 연습 모드를 포팅할 때 `hardcore` 플래그와 Shift+클릭 진입 방식도
  같이 반영.

### 2026-07-07 (추가 수정) 4-Wide 연습: 콤보브레이크 즉사 제거 + 시작 시 T-스핀 잔여물 추가

바로 아래 항목("4-Wide 연습 솔로 모드 추가")에서 구현한 초기 버전에 대해 사용자가
직접 플레이해보고 "이상하다, 버그도 많고. 콤보 끊겼다고 죽이는 건 별로"라고 피드백.

- 변경한 웹 파일: `src/game/FourWidePractice.ts`
- 무엇을:
  1. `afterLock()`에서 콤보가 끊기면(`combo>=0`이었다가 `-1`로) `engine.gameOver=true`로
     런을 강제 종료시키던 로직을 완전히 제거. 이제 콤보가 끊겨도 콤보 카운터만
     0으로 리셋되고 계속 플레이 가능 - **진짜 블록아웃(우물이 넘쳐서 스폰 자리가
     막힘) 때만 게임오버**. (초기 버전은 랜덤/서투른 입력으로도 거의 즉시
     게임오버가 떠서 "버그처럼" 느껴졌음 - 재현 스크립트로 확인.)
  2. `buildStartingResidue()` 추가 - 매치 시작(및 재시작) 시 우물 안에 T-스핀으로
     정확히 꽂아 넣을 수 있는 3블록 잔여물(왼쪽 오버행 1개 + 벽 바로 위 좌우 2개)을
     미리 깔아둠. 검색으로 확인: 실제 Four-tris 등 트레이너는 "spawns a center
     4-wide setup with three blocks of residue"로 시작함. `engine.detectSpin()`이
     실제로 "full"(정식 T-스핀, 미니 아님)로 판정하는 배치인지 스크립트로 직접
     검증하고 반영.
- 왜: 사용자가 실제 플레이해보고 "죽는 게 너무 쉽고 이상하다"는 취지로 피드백,
  AskUserQuestion으로 확인해서 "안 죽고 계속 진행"으로 확정. "가운데에 블록 3개
  놓여있음, 검색해봐"라는 요청으로 실제 트레이너의 시작 잔여물 컨셉을 검색 후 반영.
  (참고: "양옆 벽 대신 가운데가 올라온다"는 추가 신고는 재현 시도했으나 로직/렌더링
  모두 정상이었음 - 벽은 10줄로 고정 유지되고 오직 플레이어가 쌓는 우물만 자라는
  게 의도된 동작이라, 콤보브레이크 즉사 버그 때문에 못 보던 정상 동작을 착시로
  오해했을 가능성이 높음. 사용자가 다시 확인 후 여전히 문제라면 재보고 예정.)
- Godot 쪽 대응: 아래 "4-Wide 연습 솔로 모드 추가" 항목을 이식할 때 이 수정사항도
  같이 반영할 것(콤보브레이크로 안 죽음 + 시작 잔여물).

### 2026-07-07 "4-Wide 연습" 솔로 모드 추가 (신규 기능)

검색해서 확인한 결과 tetr.io에 공식 "4-wide" 게임 모드는 없고(4-wide는 원래 콤보용
스태킹 "기법"), 커뮤니티에서 이 기법을 반복 연습하기 위해 만든 트레이너(Four-tris,
DDRKirby의 4-Wide Trainer)가 있다. 그 컨셉을 솔로 연습 모드로 구현: 보드 양옆(왼쪽
3칸/오른쪽 3칸)에 가비지 벽을 쌓아 가운데 4칸 우물만 남기고, 그 우물에서만 계속 줄을
지워 콤보를 이어가야 한다. 콤보가 끊기면(줄 못 지운 락) 그 판은 "GAME OVER" 처리.
벽은 클리어로 줄어들 때마다 자동으로 다시 쌓여서 무한 반복 연습 가능.

- 변경한 웹 파일:
  1. `src/game/GameEngine.ts` - `GameEngineOptions`에 `colBounds?: [number, number]`
     추가. 기존 `colOffset`(2v2용, COLS폭 자동계산)과 달리 이동 가능 열 범위를 직접
     지정할 수 있음(4칸 우물처럼 COLS보다 좁은 구간을 막을 때 필요). `colOffset`은
     여전히 스폰 열 계산에만 쓰이고, `colBounds`가 있으면 그걸로 `colMin`/`colMax`를
     덮어씀. 기존 2v2 동작(colBounds 안 씀)은 완전히 그대로.
  2. `src/game/Board.ts` - `addPartialGarbage(cols: number[])` 추가. 기존
     `addGarbage`(구멍 하나만 남기고 나머지 꽉 채움)와 반대로, 지정한 열만 채우고
     나머지는 비운 줄을 맨 아래에 삽입(벽 재적재용).
  3. `src/game/FourWidePractice.ts`(신규) - 위 두 기능을 조합한 컨트롤러. `Board(COLS)`
     생성 후 양옆 3칸씩(`WALL_COLS`)에 10줄 높이 벽을 쌓고, `GameEngine`을
     `colBounds:[3,6]`(가운데 4칸)으로 제한해서 만듦. `engine.onBoardChanged` 훅에서
     매 락마다: (a) 콤보가 활성 상태(`combo>=0`)였다가 이번 락에서 못 지워
     `combo===-1`로 꺾이면 `engine.gameOver=true`로 런 종료, (b) 아니면 벽 높이를
     확인해서 목표(10줄) 밑으로 떨어진 만큼 `addPartialGarbage`로 재적재.
     `restart()`는 같은 `GameEngine` 인스턴스를 `reset()`으로 재사용하면서 벽만 다시
     쌓음(InputHandler가 들고 있는 engine 참조를 안 바꿔도 되게).
  4. `index.html`/`src/main.ts` - 메뉴에 "4-Wide 연습" 버튼 추가. 보드 폭이 솔로와
     똑같이 COLS(10)라서 **기존 `GameRenderer`/`InputHandler`를 그대로 재사용**
     (렌더러 변경 전혀 없음). `mode`에 `"fourwide"` 추가, R키 재시작은
     `fourWidePractice.restart()` 호출.
- 왜: 사용자가 "테트리오 4-wide 모드 검색하고 구현해(공격 기법 말고 게임모드)"라고
  요청. 검색으로 확인해보니 공식 모드가 아니라 커뮤니티 트레이너 개념이라, 그 실제
  동작 방식(벽+우물+콤보브레이크+자동리로드)을 그대로 재현.
- Godot 쪽 대응: `colBounds` 같은 열 범위 제한 컨셉과 `addPartialGarbage` 같은 부분
  가비지 삽입 컨셉을 GDScript 보드 클래스에도 추가하면 동일하게 이식 가능. 콤보브레이크
  감지/벽 리로드 로직(`FourWidePractice.ts`)은 통째로 옮기면 됨.

### 2026-07-07 클라우드플레어 터널(tetris.sada.ai.kr) 배포용 서버 주소 자동판별 + preview 허용 호스트

로컬 IP를 매번 확인해서 입력하는 게 번거롭다는 요청으로, `tetris.sada.ai.kr`를 클라우드플레어
터널로 배포. 터널은 `tetris.sada.ai.kr`의 `/ws` 경로는 로컬 WS 서버(8080)로, 나머지는
정적 사이트 서버(vite preview, 4173)로 라우팅하도록 구성(`~/.cloudflared/tetris.yml`,
Cloudflare 인프라 설정이라 이 저장소 파일은 아님 - 새로 세팅할 때 참고용으로만 기록).

- 변경한 웹 파일:
  1. `src/main.ts` - PvP/2v2 로비의 "서버 주소" 기본값을 `location.protocol`로 판별하도록
     변경. HTTP(로컬 개발)면 기존처럼 `ws://호스트:8080`, HTTPS(터널/배포)면
     `wss://호스트/ws`.
  2. `vite.config.ts` - `preview.allowedHosts`에 `tetris.sada.ai.kr` 추가. `vite preview`가
     기본적으로 DNS 리바인딩 방지로 알려지지 않은 Host 헤더를 403 차단하는데, 터널이
     원래 Host를 그대로 전달해서 막혔던 것.
- 배포 방식(이 파일들 외 로컬 환경 설정, Godot 포팅과 무관하지만 재현용으로 기록):
  `npx vite build --base=/ --outDir dist-tunnel` 로 루트 경로 기준 프로덕션 빌드 →
  `npx vite preview --base=/ --outDir dist-tunnel --port 4173`으로 정적 서빙 →
  `npm --prefix server run start`(또는 dev)로 WS 서버 → `cloudflared tunnel --config
  ~/.cloudflared/tetris.yml run`으로 터널 연결. 전부 로컬 PC에서 계속 켜져 있어야 함
  (서비스 등록은 안 함 - 기존 coin/api 터널도 같은 방식으로 수동 실행 중이라 통일).
- 왜: 다른 컴퓨터에서 참가할 때마다 로컬 LAN IP를 확인해서 입력해야 하는 게 귀찮다는
  피드백. 고정 도메인으로 배포하면 매번 같은 주소만 쓰면 됨.
- Godot 쪽 대응: 해당 없음(배포 인프라 이슈, 게임 로직과 무관).

### 2026-07-07 2v2 "합체 보드" 대전 모드 추가 (신규 기능)

기존 1v1 PvP(클라이언트 권위형 + 스냅샷 릴레이)와 별개로, 팀원 두 명이 폭 20칸짜리
보드 하나를 나눠 쓰는 2v2 모드를 새로 추가. 각자 자기 절반(10칸)에 자기 피스를
놓지만, 줄 삭제는 20칸 전체가 다 찼을 때만 일어난다. 두 팀(각 팀 = 2명 + 합체보드
1개)이 기존과 동일한 방식으로 가비지 공격을 주고받는다.

핵심 설계: 이 모드는 두 팀원의 보드 상태가 프레임 단위로 정확히 일치해야 해서(한
명의 락이 다른 사람의 스택 때문에 줄이 지워질 수 있음), 1v1의 "각자 독립 시뮬레이션"
방식 대신 **서버 권위형**(서버가 정답 보드를 들고 시뮬레이션, 클라이언트는 입력만
전송하고 상태를 그대로 렌더링)으로 구현. `src/game/GameEngine.ts`/`Board.ts`가
브라우저 API에 전혀 의존하지 않는 순수 로직이라, Node 서버가 `server/src/duoRoom.ts`
에서 상대 경로로 그대로 import해서 재사용(별도 서버용 엔진을 새로 만들지 않음).

- 변경한 웹 파일:
  1. `src/game/Board.ts` - 생성자에 `width` 파라미터 추가(기본 `COLS`). 내부 `COLS`
     하드코딩을 전부 `this.width`로 교체. 솔로/1v1(`new Board()`)은 동작 동일.
  2. `src/game/GameEngine.ts` - 생성자가 `{ board?: Board; colOffset?: number }`
     옵션을 받도록 확장. `board`를 주면 자기 Board를 새로 만들지 않고 공유하고,
     `colOffset`으로 `spawnCol`/`colMin`/`colMax`를 계산해서 `canPlace()`가 그
     범위 밖으로는 절대 못 나가게 막는다(진짜 벽처럼 취급되어 스핀 킥/immobile
     판정도 자동으로 올바르게 반영됨). `SPAWN_COL` 직접 참조하던 `spawnNext()`/
     `hold()`/`getSpawnDangerCells()`를 `this.spawnCol` 기준으로 변경. 두
     `GameEngine`이 같은 `Board`(width=20)를 공유하면 `clearLines()`가 전체 폭
     기준으로 판정되므로 "합쳐서 한 줄" 메커닉이 별도 조율 로직 없이 저절로 성립.
     콤보/B2B는 팀 공유가 아니라 플레이어 개인별로 유지(단순화).
  3. `src/game/InputHandler.ts` - 생성자 파라미터 타입을 `GameEngine`에서
     `GameControls` 인터페이스(`setInput`/`softDrop`/`rotate`/`rotate180`/
     `hardDrop`/`hold`/`gameOver`)로 일반화. `GameEngine`이 구조적으로 이미
     이 인터페이스를 만족해서 기존 호출부는 변경 없이 그대로 동작. 2v2에서는 로컬
     엔진 대신 서버로 입력을 전송하는 `DuoControlsAdapter`(src/duo/DuoSession.ts)가
     이 인터페이스를 구현해서 같은 키 입력 로직을 재사용.
  4. `src/render/GameRenderer.ts`, `src/render/DuoRenderer.ts`(신규) - 둘 다 루트
     `Container`를 `container` 필드로 노출해서, 모드 전환 시 `visible`을 꺼서 서로
     화면이 겹치지 않게 함(원래 GameRenderer가 항상 stage에 붙어있어서 2v2 화면과
     겹치는 버그가 있었음 - Playwright로 발견/수정).
  5. `src/render/OpponentBoardView.ts` - 생성자에 `width` 파라미터 추가(기본
     `COLS`). 2v2에서는 상대팀의 20칸 보드를 미리보기로 보여주기 위해 사용.
     `DuoRenderer`가 오른쪽 사이드 패널 자리에 직접 포함시켜서 소유(레이아웃 좌표계
     불일치로 왼쪽 스탯 패널과 겹치던 버그를 이렇게 고침).
  6. `src/net/DuoClient.ts`(신규) - 1v1의 `PvpClient`와 같은 패턴이지만, 보드/공격을
     "보내는" 게 아니라 **입력만 보내고 서버 상태를 받기만** 하는 얇은 클라이언트.
  7. `src/duo/DuoSession.ts`(신규) - `PvpSession`과 같은 역할의 오케스트레이션.
     로컬 `GameEngine`을 만들지 않고 서버 상태를 그대로 저장했다가 렌더러에 전달.
  8. `index.html`/`src/style.css`/`src/main.ts` - 메뉴에 "2v2 대전" 버튼과 새 로비
     화면(`#duo-lobby`, 4인 대기 카운트) 추가. `mode`에 `"duo"` 추가.
- 서버(`server/`, 웹과 별개 Node 프로젝트지만 같이 기록):
  1. `server/src/duoRoom.ts`(신규) - 방 코드 하나에 소켓 4개, **입장 순서로 팀
     배정**(1·2번째 = A팀, 3·4번째 = B팀). 4명이 모이면 공유 시드로 팀당
     `Board(width=20)` + `GameEngine` 2개씩 생성, `setInterval(16ms)` 틱 루프로
     매 프레임 시뮬레이션하고 팀별 상태를 소켓에 브로드캐스트. 각 엔진의
     `onAttackSent`를 상대팀의 "현재 대기 가비지가 더 적은 쪽" 엔진으로 라우팅.
     팀 내 두 엔진 모두 `gameOver`가 되면 그 팀 패배. 클라이언트의 DAS/ARR/SDF/DCD
     설정도 `duo:settings` 메시지로 받아서 해당 엔진에 적용(서버 권위형이라 클라
     설정을 서버가 알아야 함).
  2. `server/src/roomCode.ts`, `server/src/ws.ts`(신규) - 기존 `index.ts`에 있던
     방 코드 생성/`send` 헬퍼를 뽑아내서 1v1/2v2가 공유(중복 제거).
  3. `server/src/index.ts` - 메시지 타입이 `duo:`로 시작하면 `duoRoom.ts`로 위임하는
     분기만 추가. 기존 1v1 로직은 완전히 그대로 둠.
- 왜: "PvP에 색다른 맛"을 찾다가 사용자가 "2대2 테트리스 구현해줘"라고 요청.
  처음엔 팀 배틀(4개 독립 보드 + 공격 타겟팅)로 오해했는데, 사용자가 "팀끼리 그리드를
  붙여서 둘이 합쳐야 한 줄이 지워지는" 협동 보드 컨셉이라고 정정. 동기화 방식은
  서버 권위형/클라이언트 예측 두 옵션을 사용자에게 제시했고, 서버 권위형을 선택함
  (클라우드플레어 터널 배포 예정이라 입력 지연이 다소 있어도 정확성을 우선).
- Godot 쪽 대응: Godot은 아직 PvP 자체가 없으므로, 이 기능은 1v1 PvP를 먼저 포팅한
  뒤에 같이 고려. 핵심은 (a) Board를 폭 가변으로 만들고, (b) 한 보드를 두 플레이어
  컨트롤러가 열 범위 제한을 걸고 공유하게 하고, (c) 서버(GDScript로는 별도 서버가
  필요하므로 Godot용 별도 백엔드 설계가 필요함 - 이 부분은 웹처럼 기존 Node 로직을
  재사용할 수 없으니 Godot 포팅 시 처음부터 설계할 것)로 매치를 시뮬레이션하는 구조.

### 2026-07-07 실시간 플레이 스탯(PPS/APM) 추가

tetr.io처럼 그리드 왼쪽 패널에 실시간 PPS(초당 피스 배치)/APM(분당 공격 전송량)을
표시. 게임 시작부터 현재까지 누적 기준으로 계산(구간 롤링 평균 아님).

- 변경한 웹 파일: `src/game/GameEngine.ts`, `src/render/GameRenderer.ts`
- 무엇을:
  1. `GameEngine`에 `piecesPlaced`, `totalAttackSent`, `elapsedMs` 필드 추가.
     `update()`에서 매 프레임 `elapsedMs += deltaMs`, `lockPiece()`에서 피스가
     실제로 락될 때 `piecesPlaced++`, `applyScoring()`이 계산한 공격량을
     `totalAttackSent`에 누적.
  2. `getPPS()` = `piecesPlaced / (elapsedMs/1000)`, `getAPM()` =
     `totalAttackSent / (elapsedMs/60000)` 추가.
  3. `GameRenderer`가 왼쪽 Hold/스탯 패널(COMBO 텍스트 아래)에 PPS/APM 텍스트를
     추가로 그림.
- 왜: 사용자가 "apm이나 pps 같은 실시간 플레이 스탯을 그리드 왼쪽에 띄워달라"고 요청.
- Godot 쪽 대응: 동일한 누적 카운터(피스 락 횟수, 공격 전송 총량, 경과 시간)를
  게임 루프에 두고 UI 좌측 패널에 같은 공식으로 표시하면 됨.

### 2026-07-07 180도 스핀 연타 시 영원히 안 죽는 버그 수정 (Move Reset 로직 재작성)

제보: "180도 스핀 관련해서 계속 연타하면 살 수 있는 버그가 있다"는 걸 확인 후 재현·수정.

원인은 두 가지가 겹쳐 있었음:
1. 락 리셋 카운터(`lockResets`, 최대 15회)가 "바닥에 닿아있다가(grounded) 떨어졌다가
   다시 닿으면" 무조건 0으로 초기화됐음. 그런데 S/Z/T/J/L 피스는 회전 상태 0과 2의
   모양이 3x3 박스 안에서 서로 다른 행을 차지하도록 정의돼 있어서(SRS 표준 규격),
   180도 회전을 반복하면 같은 자리에서 "접지↔공중"을 오갈 수 있음. 이때마다
   `lockResets`가 0으로 리셋되니 사실상 무제한 리셋이 가능했음.
   → 검색으로 tetr.io/가이드라인의 "Extended Placement Lock Down(Move Reset)" 규칙을
   확인: 리셋 카운터는 "피스가 실제로 더 깊은(새로운) 줄로 내려갔을 때만" 초기화돼야
   함. `lowestRow`(현재 피스가 스폰 이후 도달한 가장 깊은 행)를 추적해서, 정말로 그
   값을 갱신할 때만(=진짜로 더 내려갔을 때만) `lockResets`와 `lockTimer`를 초기화하도록
   변경.
2. 위 수정 후에도, 리셋 횟수 15회를 다 쓰고 나서 락딜레이 타이머(`lockTimer`)가 계속
   500ms까지 못 쌓이는 문제가 남아있었음. 원인: 피스가 "공중에 뜬" 프레임마다
   `onSuccessfulMove()`가 `lockTimer`를 무조건 0으로 지워버려서, 접지→공중→접지가
   반복되는 한 프레임(16ms)치 이상 절대 못 쌓였음. 공중에 뜬 동안은 `update()`가
   애초에 `lockTimer`를 증가시키지 않으므로(멈춰있을 뿐), 굳이 0으로 지울 필요가
   없었음. 이 무조건 초기화를 제거해서, 리셋 한도 소진 후에는 접지 상태로 돌아올
   때마다 값이 이어서 쌓이다가 결국 500ms를 채우고 락되도록 수정.
- 변경한 웹 파일: `src/game/GameEngine.ts`
- 무엇을:
  1. `lowestRow` 필드 추가 (스폰/홀드 스왑 시 스폰 행으로 초기화).
  2. `onSuccessfulMove()`, 중력에 의한 자연 낙하 루프, SDF 최댓값(41) 즉시낙하 분기
     세 곳 모두에서 "`active.row > lowestRow`일 때만" `lowestRow` 갱신 + `lockResets`/
     `lockTimer` 초기화하도록 통일.
  3. `onSuccessfulMove()`의 "공중에 뜨면 무조건 lockTimer=0" 분기 제거 - 리셋 한도
     이내에서 접지 상태가 될 때만 리셋하고, 그 외(공중/한도 소진)에는 타이머를
     건드리지 않아 자연히 흐르게 둠.
- 왜: 사용자 제보. 실제 스크립트로 재현 확인(500번 연속 180 회전 + 프레임 진행 시
  전혀 락되지 않음) → 수정 후 7종 피스 전부 결국 락되는 것을 확인.
- Godot 쪽 대응: 락 리셋(Move Reset) 로직을 이식할 때 반드시 "새로운 최저 행 도달
  시에만 리셋" 규칙 + "공중에 뜬 동안은 타이머를 지우지 말고 멈추기만" 규칙 둘 다
  같이 가져갈 것. 한쪽만 적용하면 여전히 무한 생존 가능.

### 2026-07-07 (추가 정정) Lock Out 즉시체크 마저 제거 + X표시는 "스택 높이 18줄" 기준으로 변경

바로 아래 항목("Block Out/Clutch Clear 단순화...")에서 Lock Out 즉시 게임오버를
제거했다고 기록했지만 실제로는 `lockPiece()`에 체크가 하나 남아있었음. 이번에 마저
제거해서 **"다음 스폰 위치가 막힘(Block Out)"이 유일한 사망 조건**이 되도록 완성.

또한 X표시 트리거 조건을 재조정: "스폰 모양이 실제로 겹치는지"가 아니라, 일반
테트리스 모드 관례대로 **스택 높이가 18줄(`VISIBLE_ROWS - 2`) 이상 쌓였을 때부터**
표시하도록 변경 (표시 내용은 그대로 - 다음 피스의 스폰 모양 전체).

- 변경한 웹 파일: `src/game/GameEngine.ts`
- 무엇을:
  1. `lockPiece()`에 남아있던 `cells.every(row => row < BUFFER_ROWS)` 즉시 Lock Out
     체크 제거. 이제 게임오버는 오직 `spawnNext()`의 Block Out 체크(`triggerGameOver`
     한 곳)에서만 발생.
  2. `getSpawnDangerCells()`를 "다음 피스 스폰 모양이 보드와 충돌하는지" 대신
     "보드 전체에서 가장 위에 있는 채워진 줄 기준 스택 높이(`TOTAL_ROWS -
     topmostFilledRow`)가 `VISIBLE_ROWS - 2`(=18) 이상인지"로 판정하도록 변경.
     조건을 만족하면 다음 피스의 스폰 모양 전체(막힌 칸/빈 칸 무관, 이전 항목과
     동일)를 반환.
- 왜: 사용자가 "테트리스에서 죽는 로직은 다음 피스가 가려질 때, 이것 하나뿐"이라고
  재확인 → 코드에 Lock Out 체크가 남아있는 걸 발견해서 제거. 이어서 "X표시는 막혔을
  때만이 아니라 일반 모드에서는 18줄 이상 쌓였을 때부터 뜬다"고 정정.
- Godot 쪽 대응: 아래 두 항목(Block Out/Clutch Clear 단순화, 죽는 조건 3종)을 이식할
  때 이 항목이 최종본. Lock Out/Garbage Out 즉시체크는 만들지 말고, X표시는 충돌
  여부가 아니라 스택 높이(18줄) 기준으로 구현할 것.

### 2026-07-07 (커밋 4dd138b) Block Out/Clutch Clear 단순화 + X표시 로직 정정 — 아래 두 항목 정정본

사용자가 직접 확인하고 지적해서 아래 "죽는 조건 3종" / "콤보·B2B·Clutch Clear" 항목의
일부 내용이 이걸로 **대체**됨. Godot 포팅 시 이 항목을 기준으로 반영할 것.

- 변경한 웹 파일: `src/game/GameEngine.ts`
- 무엇을:
  1. **Clutch Clear/Block Out 단순화**: `spawnNext()`가 스폰 자리가 막혔을 때 버퍼
     위쪽으로 자리를 "검색"하던 로직을 완전히 제거. 이제 `SPAWN_ROW`/`SPAWN_COL`
     고정 위치만 확인하고, 막혀 있으면 즉시 `triggerGameOver()`. 이유: 줄을 지우면
     `clearLines()`가 이미 위쪽 줄들을 아래로 당겨놔서 스폰 자리가 "자연스럽게"
     비게 되므로, 별도 검색 로직 자체가 불필요했음(오히려 버그 - 줄을 안 지워도
     거의 안 죽는 상태였음).
  2. **Lock Out / Garbage Out 즉시 게임오버 제거**: 사용자 지적대로, tetr.io는
     이 두 상황을 별도로 즉시 체크하지 않고, 결국 다음 피스 스폰 시 Block Out으로
     자연스럽게 걸린다고 판단. `lockPiece()`의 Lock Out 즉시체크와
     `resolveGarbage()`의 Garbage Out 즉시체크(overflow → triggerGameOver)를 제거.
     `Board.addGarbage()`는 여전히 overflow 여부를 반환하지만 지금은 안 씀(정보성).
  3. **`getSpawnDangerCells()` 로직 반전**: "겹치는(이미 막힌) 칸만" 반환하던 것을,
     "스폰 모양 중 하나라도 막혀있으면 그 모양 전체(막힌 칸 + 빈 칸 모두)"를
     반환하도록 변경. 사용자가 스크린샷/실제 플레이로 여러 차례 확인: X는 이미
     막힌 칸 위에도, 아직 비어있는 칸 위에도 뜨며, "여기가 다음에 막히면 죽는
     스폰 영역 전체"를 보여주는 것이 맞음.
- 왜: 사용자가 "block out은 X표시랑 같은 로직인데, 줄 안 지워도 안 죽는 거 보니
  버그"라고 정확히 지적. 이어서 "tetr.io의 죽는 기준은 Block Out 하나뿐인 것 같다"는
  가설을 제시, X표시도 "막힌 칸/빈 칸 구분 없이 스폰 모양 전체"라고 확인해줌.
- Godot 쪽 대응: 아래 두 항목("죽는 조건 3종", "콤보/B2B/Clutch Clear")을 GDScript로
  이식할 때 그 항목들에 적힌 옛 방식(검색형 Clutch Clear, Lock/Garbage Out 즉시체크,
  겹치는 칸만 X표시)이 아니라 **이 항목의 방식**을 기준으로 구현할 것.

### 2026-07-07 (추가 수정) 버퍼 미리보기 영역에서 피스/X표시 렌더링 버그 2건 수정

- 변경한 웹 파일: `src/render/GameRenderer.ts`
- 무엇을: 방금 추가한 버퍼 미리보기(vanish zone peek) 기능에서 발견된 버그 2개 수정.
  1. 고스트/현재 피스가 버퍼 구간(`row < BUFFER_ROWS`)에 있을 때 아예 안 그려지고
     있었음 (기존엔 `vr >= 0`일 때만 그렸음) - `drawAtRow()` 헬퍼를 추가해서 보이는
     영역/버퍼 미리보기 영역 중 알맞은 Graphics에 그리도록 통일.
  2. 스폰 위험 X표시가 고스트/현재 피스보다 먼저 그려져서, 피스가 그 칸 위에 겹치면
     X가 가려져 버렸음 - X표시를 피스 렌더링 이후로 옮겨서 항상 위에 보이게 함.
- 왜: 사용자가 실제로 플레이해보다가 "버퍼에서 피스가 가려지는데 맞아?"와
  "X표시도 안 보이는 거 같음"을 지적, 스크린샷/디버그로 재현·확인 후 수정.
- Godot 쪽 대응: Godot에는 아직 버퍼 미리보기 자체가 없어서 위 이식 시 처음부터
  이 순서(락 셀 → 피스 → X표시)로 만들면 됨.

### 2026-07-07 죽는 조건 3종(Block/Lock/Garbage Out) + 스폰 위험 X표시

- 변경한 웹 파일: `src/game/Board.ts`, `src/game/GameEngine.ts`, `src/render/GameRenderer.ts`
- 무엇을: 검색해서 확인한 tetr.io의 게임오버 조건 3가지를 전부 구현.
  - **Block Out**(기존에 구현돼있던 것): 스폰 자리가 막힘 - Clutch Clear로 완화됨.
  - **Lock Out**(신규): `lockPiece()`에서 방금 락된 피스의 모든 셀이 버퍼(`row < BUFFER_ROWS`,
    화면 밖 vanish zone) 안에 있으면 게임오버.
  - **Garbage Out**(신규): `Board.addGarbage()`가 밀려나면서 사라지는 줄에 채워진 셀이
    있었는지(`overflow`)를 반환하도록 바꾸고, `GameEngine.resolveGarbage()`에서 그 경우
    게임오버 처리. (기존엔 밀려난 블록을 그냥 조용히 삭제해버리는 버그였음)
  - `triggerGameOver()` 헬퍼로 세 조건의 게임오버 처리(및 `onGameOver` 콜백 호출)를 통일.
  - **스폰 위험 X표시**: `GameEngine.getSpawnDangerCells()` 추가 - 다음 피스가 기본 스폰
    위치에 놓일 때 실제로 겹치는 칸들을 반환. `GameRenderer`가 보드 위에 버퍼 3줄을 살짝
    보여주는 영역을 추가하고, 그 겹치는 칸에 빨간 X를 그림 (tetr.io 스크린샷으로 확인 -
    피스 종류에 따라 X 모양/개수가 매번 다르게 나오는 것까지 실제로 재현·확인함).
- 왜: 사용자가 "죽는 기준을 검색해봐"라고 요청, 이어서 tetr.io 스크린샷을 보여주며
  스폰 위험 X표시 기능도 요청함. 이 X표시 기능의 정확한 1차 출처(공식 문서)는 검색으로
  못 찾았고, "다음 피스 스폰 겹침"이라는 해석으로 구현한 뒤 사용자가 실제 게임에서
  여러 번 확인하고 맞다고 확인해줌.
- Godot 쪽 대응: `godot/scripts/GameEngine.gd`의 `_spawn_next()`/`_lock_piece()`에는
  Lock Out, Garbage Out, Clutch Clear, 스폰 위험 X표시가 전부 없음. 위 로직 전부 이식
  필요. Godot 렌더러(`BoardView.gd`)에도 버퍼 미리보기 영역 추가 필요.

### 2026-07-07 tetr.io 실제 콤보/B2B/퍼펙트클리어/Clutch Clear 메커니즘 반영

- 변경한 웹 파일: `src/game/GameEngine.ts`
- 무엇을: tetrio.wiki.gg/wiki/Mechanics를 자세히 확인해서 기존에 대충 구현했던 부분을
  실제 tetr.io 공식/수치로 교체함.
  - **콤보 배율**: `getAttackLines()`를 없애고 `baseAttackFor()`(기본 물량표만) +
    `comboScaledAttack()`(콤보 배율)로 분리. base>0이면
    `floor(base*(1+0.25*combo))`, base===0인 클리어(싱글 등)가 콤보로 이어지면
    2콤보(combo>=2)부터 `floor(ln(1+1.25*combo))`로 대체. 반올림은 기본값인
    내림(DOWN) 사용 (RNG 모드는 구현 안 함).
  - **B2B**: `backToBack: boolean` 외에 `private b2bCount: number`(스트릭 단계) 추가.
    스트릭이 이어지는 매 공격마다 여전히 +1(Charging). B2B가 4 이상 쌓인 상태에서
    스트릭이 끊기면(어려운 클리어가 아닌 클리어 발생) 그 시점의 `b2bCount` 값만큼
    Surge를 한꺼번에 공격에 더하고 `b2bCount`를 0으로 리셋 (3구간 분할 방출은
    생략 - 연출 디테일이라 판단해서 단순화).
  - **퍼펙트클리어(올클리어)**: 클리어 종류와 무관하게 `b2bCount += 2` (기존엔 B2B에
    영향 안 줬음). 즉시 공격 보너스 +10은 유지(Jstris 계열 관례 수치, tetr.io 확정
    수치는 못 찾음 - 근사치로 유지).
  - **Clutch Clear**: `spawnNext()`가 스폰 위치가 막혀 있으면 곧바로 게임오버시키는
    대신, 버퍼 위쪽(row 0 방향)으로 한 칸씩 올려보며 놓을 자리를 찾고, 끝까지 못
    찾을 때만 진짜 게임오버 처리하도록 수정.
- 왜: 사용자가 "위키 mechanics 페이지의 combo multiplier, B2B, B2B charging,
  B2B chaining, clutch clear를 잘 확인하라"고 명시적으로 요청.
- Godot 쪽 대응: `godot/scripts/GameEngine.gd`의 `_apply_scoring()`/`_spawn_next()`가
  웹의 예전(단순화된) 버전과 동일하므로, 위 내용을 전부 GDScript로도 반영해야 함.

### 2026-07-07 (커밋 bbf3ff7) 피스가 턱에서 미끄러진 뒤 허공에서 락되는 버그 수정

- 변경한 웹 파일: `src/game/GameEngine.ts` (`onSuccessfulMove()`)
- 무엇을: 이동/회전이 성공한 직후 `isGrounded`를 다시 계산하지 않던 문제를 고침.
  기존엔 `isGrounded`가 true였던 이전 값에 그대로 머물러서, 킥으로 위로 튕기거나
  (I피스 킥, T-스핀 피니시 등) 턱에서 옆으로 미끄러져 허공으로 이동해도 락 타이머가
  계속 쌓여 다음 중력 판정이 오기 전에 허공에서 그대로 고정돼버렸음. 이제
  이동/회전 직후 실제로 바닥에 닿아있는지(`!canPlace(row+1)`) 매번 재계산해서,
  (a) 계속 바닥→바닥이면 기존처럼 락 리셋 소비, (b) 새로 바닥에 닿았으면 타이머/리셋
  카운트 새로 시작, (c) 더 이상 바닥이 아니면 `isGrounded=false`로 되돌려서 계속 낙하.
- 왜: 사용자가 "미노가 공중에 뜨는 문제"를 보고함. tetrio.wiki.gg/wiki/Mechanics로
  락딜레이 규칙(500ms, 이동/회전 시 리셋, 최대 15회)을 재확인했고 기존 수치(500ms,
  MAX_LOCK_RESETS=15)는 이미 정확했음 — 빠졌던 건 "재착지 여부 재계산" 로직뿐.
- Godot 쪽 대응: `godot/scripts/GameEngine.gd`의 `_on_successful_move()`가 웹의
  기존(버그 있던) 버전과 동일한 구조이므로 **Godot에도 같은 버그가 있음**. 위와 동일하게
  고쳐야 함.

### 2026-07-07 (커밋 2b5696c) 저장된 DAS/ARR/SDF/DCD 설정이 실제 게임에 적용 안 되던 버그 수정

- 변경한 웹 파일: `src/main.ts` (`setupSettingsPanel()`)
- 무엇을: 설정창을 열 때 저장된 값을 입력칸에 표시(`populateInputs`)만 하고 실제
  엔진에는 적용(`applySettings`)하지 않던 문제. `populateInputs(loadSettings())` 바로
  다음 줄에 `getEngine()?.applySettings(loadSettings())`를 추가해서, 새 엔진이 생성될
  때(싱글플레이/새 PvP 매치 시작 시) 저장된 설정이 바로 반영되도록 함.
- 왜: PvP 지원을 위해 `main.ts`를 리팩터(엔진을 고정 참조 대신 `getEngine()` 콜백으로
  받도록 변경)하면서 이 한 줄이 빠졌음.
- Godot 쪽 대응: Godot의 `SettingsPanel.gd`/`Main.gd`는 이 문제가 없음 (구조가 달라서
  해당 안 됨 — 확인 차 참고만).

### 2026-07-06 ~ 07-07 PvP 대전 시스템 (1:1, WebSocket) 추가 + All-Mini+ 스핀 판정

- 변경/신규 웹 파일:
  - `server/` (신규, Godot에는 해당 없음 — Godot이 PvP를 지원하려면 같은 서버에 붙는
    별도 GDScript WebSocket 클라이언트가 필요함)
  - `src/net/PvpClient.ts` (신규) — WebSocket 래퍼
  - `src/pvp/PvpSession.ts` (신규) — GameEngine ↔ PvpClient ↔ UI 배선
  - `src/game/Bag.ts` — `SevenBag`에 시드 가능 PRNG(mulberry32) 추가, 생성자가 `seed?`를 받음
  - `src/game/Board.ts` — `Cell` 타입에 `"GARBAGE"` 추가, `addGarbage(lines, holeCol)` 추가
  - `src/game/GameEngine.ts`:
    - 생성자/`reset()`이 `seed?: number`를 받아 `SevenBag`에 전달 (PvP 양쪽에 동일 시드로
      같은 피스 순서 보장)
    - `garbageQueue`, `queueGarbage()`, `resolveGarbage()`(카운터링: 내 공격으로 먼저
      상쇄, 이번 락에서 줄 못 지웠을 때만 남은 만큼 실제 삽입), `onAttackSent`,
      `onBoardChanged` 콜백 추가
    - `getAttackLines()` — PvP 가비지 물량표 (Single=0, Double=1, Triple=2, Tetris=4,
      스핀더블=4, 스핀트리플=6, 스핀/스핀싱글/미니=0, B2B=+1, 퍼펙트클리어=+10). 콤보
      보너스는 아직 미포함(검증 후 추가 예정)
    - **T-스핀 판정을 tetr.io의 All-Mini+ 방식으로 일반화**: `detectTSpin()` →
      `detectSpin()`으로 이름 변경 및 로직 확장. T피스는 기존 3코너 룰(기존 로직 그대로,
      회귀 없음 확인됨) 그대로 full/mini 판정하되 3코너 조건 미달 시 immobile 체크로
      mini 폴백. **T 이외 모든 피스(I,O,S,Z,J,L)도 immobile(회전 후 위로 이동 불가 =
      "오버행")이면 mini 스핀 인정** (`isImmobile()` 신규 추가). Full 스핀은 T피스만 가능.
    - `ClearType`의 `"tspin*"` 계열 타입명을 `"spin*"`으로 전부 변경(피스 무관 이름으로
      일반화), `ClearEvent`에 `spinPiece: PieceType | null` 필드 추가 (어떤 피스가 스핀을
      일으켰는지 기록 → UI에서 "T-SPIN", "S-SPIN MINI"처럼 동적으로 표시)
  - `src/game/constants.ts` — `GARBAGE_COLOR` 추가
  - `src/render/cellDraw.ts` (신규, 리팩터) — `GameRenderer.ts`에 있던 `drawCell`/색상
    조회 로직을 분리해서 `OpponentBoardView`와 공유
  - `src/render/OpponentBoardView.ts` (신규) — 상대 보드 스냅샷만 그리는 미니뷰
  - `src/render/GameRenderer.ts` — `cellDraw.ts` 재사용으로 리팩터, 가비지 대기량 표시하는
    주황 미터 추가, 클리어 라벨을 `spinPiece` 기반 동적 문자열로 변경
  - `src/main.ts`, `index.html`, `src/style.css` — 메뉴/PvP 로비/승패 화면 추가 (HTML
    오버레이 패턴, `#settings-panel`과 동일한 방식)
  - `vite.config.ts` (신규) — `server.host: true` (로컬 네트워크 접속용, Godot과 무관)
- 왜: 사용자가 tetr.io 스타일 1:1 실시간 대전을 요청. All-Mini+ 판정 일반화는 사용자가
  "tetr.io는 현재 all mini+ 시스템을 쓰니 참고하라"고 명시적으로 요청해서 검색 후 반영함.
- Godot 쪽 대응:
  - `godot/scripts/GameEngine.gd`의 `_detect_t_spin()`을 위와 동일하게 `_detect_spin()`으로
    일반화 + `_is_immobile()` 추가 필요
  - Godot에서 PvP를 지원하려면 같은 `server/`에 붙는 WebSocket 클라이언트를 GDScript로
    새로 작성해야 함 (Godot 4는 `WebSocketPeer` 내장 클래스 사용 가능 — 웹 버전의
    `PvpClient.ts`/`PvpSession.ts`와 같은 메시지 프로토콜을 그대로 재사용하면 됨)
  - `SevenBag.gd`에 시드 가능 PRNG 추가, `Board.gd`에 `add_garbage()` 추가 필요

## 기록 형식 (새 항목 추가 시)

```
### [웹 커밋 해시 or 날짜] 한 줄 요약

- 변경한 웹 파일: src/game/xxx.ts
- 무엇을: (구체적으로 - 함수명, 상수값, 로직 변화)
- 왜:
- Godot 쪽 대응 파일/함수: godot/scripts/xxx.gd 의 ___ (알고 있다면)
```

## 참고: 웹 ↔ Godot 파일 대응표

| 역할 | 웹 (TS) | Godot (GDScript) |
|---|---|---|
| 상수/타이밍 | src/game/constants.ts | godot/scripts/GameConstants.gd |
| 테트로미노/킥테이블 | src/game/pieces.ts | godot/scripts/Pieces.gd |
| 보드/라인클리어 | src/game/Board.ts | godot/scripts/Board.gd |
| 7-bag | src/game/Bag.ts | godot/scripts/SevenBag.gd |
| 핵심 게임 로직 | src/game/GameEngine.ts | godot/scripts/GameEngine.gd |
| 설정(DAS/ARR/SDF/DCD) | src/game/Settings.ts | godot/scripts/Settings.gd |
| 입력 처리 | src/game/InputHandler.ts | godot/scripts/Main.gd (_key_down/_key_up) |
| 렌더링 | src/render/GameRenderer.ts | godot/scripts/BoardView.gd, MiniPieceView.gd |
| 설정 UI | index.html #settings-panel + main.ts | godot/scripts/SettingsPanel.gd |
| PvP 네트워킹 | src/net/PvpClient.ts | (없음, WebSocketPeer로 신규 작성 필요) |
| PvP 세션 배선 | src/pvp/PvpSession.ts | (없음, 신규 작성 필요) |
| 셀 드로잉 공용 함수 | src/render/cellDraw.ts | (Godot은 BoardView.gd/MiniPieceView.gd에 이미 각자 구현돼있음) |
| 상대 보드 미리보기 | src/render/OpponentBoardView.ts | (없음, 신규 작성 필요) |
