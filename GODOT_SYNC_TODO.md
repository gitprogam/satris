# Godot 포팅 대기 목록

지금부터는 별도 지시가 있기 전까지 **웹 버전(`src/`, PixiJS/TS)만 수정**하고,
Godot 버전(`godot/`)은 여기 기록해뒀다가 나중에 한 번에 몰아서 반영합니다.

마지막으로 두 버전이 완전히 동기화된 커밋: `5b01c71`
("Rebind 180 spin to A, fix soft-drop speed bug, add DAS/ARR/SDF/DCD settings")

## 대기 중인 변경사항

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
