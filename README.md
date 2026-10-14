# 라이브 스트리밍 자극물

AI 시청자 연구용 실험 자극물. 정적 파일 하나로 동작하므로 GitHub Pages에 그대로 올라갑니다.
행동 로그는 Supabase로 들어갑니다.

---

## 1. 배포

1. 새 레포를 만들고 이 폴더의 파일을 전부 올립니다.
2. Settings → Pages → Source를 `Deploy from a branch`, 브랜치 `main` / 폴더 `/ (root)`로 지정.
3. 1~2분 뒤 `https://<계정>.github.io/<레포>/` 로 열립니다.

로컬 확인은 폴더에서 `python3 -m http.server 8000` 후 `localhost:8000`.

---

## 2. 로그 서버 (Supabase)

`index.html` 상단의 두 줄만 채우면 됩니다.

```js
const SUPABASE_URL = 'https://xxxxxxxx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOi...';   // anon public key
```

### 2-1. 준비

[supabase.com](https://supabase.com)에서 무료 계정을 만들고 프로젝트를 하나 생성합니다.
Project Settings → API에서 **Project URL**과 **anon public** 키를 복사합니다.

anon 키는 공개되는 값입니다. 자극물이 브라우저에서 돌아가므로 참가자가 소스를 보면 보입니다.
아래 RLS 설정이 그 전제에서 안전을 담보합니다 — 쓰기만 되고 읽기는 막힙니다.

### 2-2. 테이블 생성

Supabase 대시보드 → SQL Editor에 그대로 붙여넣고 실행합니다.

```sql
-- 세션 1건 = 참가자 1명의 자극물 1회 실행
create table sessions (
  id          uuid primary key,
  pid         text,
  condition   jsonb,
  started_at  timestamptz default now(),
  user_agent  text,
  screen_w    int,  screen_h    int,
  viewport_w  int,  viewport_h  int,
  tz          text
);

-- 이벤트 1건 = 행동 1개
create table events (
  id          bigserial primary key,
  session_id  uuid references sessions(id),
  t           numeric,      -- 세션 시작 기준 경과 초
  type        text,
  data        jsonb,
  created_at  timestamptz default now()
);

create index on events (session_id);
create index on events (type);

-- 참가자는 쓰기만 가능하고 읽기는 불가
alter table sessions enable row level security;
alter table events   enable row level security;

create policy "anon insert sessions" on sessions
  for insert to anon with check (true);
create policy "anon insert events" on events
  for insert to anon with check (true);
```

`select` 정책을 만들지 않았으므로 anon 키로는 조회가 안 됩니다.
분석은 대시보드에 로그인해서 하거나 service_role 키로 합니다. **service_role 키는 자극물에 넣으면 안 됩니다.**

### 2-3. 확인

자극물을 한 번 돌리고 `방송 나가기`를 누른 뒤, 종료 화면에
`서버로 전송했습니다. session_id: ...` 가 뜨면 연결된 것입니다.
Supabase → Table Editor → events 에서 행을 확인합니다.

### 2-4. 전송 방식

- 이벤트를 모아 **5초마다** 한 번에 보냅니다. 건당 요청을 보내면 300명 × 수천 건이 전부 개별 요청이 됩니다.
- 탭을 가리거나 창을 닫을 때 `keepalive`로 남은 것을 밀어 넣습니다.
- 전송이 실패하면 브라우저에 쌓아두고 다음 기회에 다시 보냅니다. 중간에 와이파이가 끊겨도 유실되지 않습니다.
- `SUPABASE_URL`이 비어 있으면 전송을 건너뛰고 로컬에만 쌓입니다. 종료 화면의 `JSON 내려받기`로 받을 수 있습니다.

### 2-5. 내보내기

```sql
-- 세션별 요약
select s.pid, s.condition->>'study' as study, s.condition->>'cong' as cong,
       s.condition->>'label' as label, (s.condition->>'viewers')::int as viewers,
       e.data->>'dwell_sec' as dwell, e.data->>'subscribed' as subscribed
from sessions s
join events e on e.session_id = s.id and e.type = 'leave';

-- 이벤트 전체 (SQL Editor 결과창에서 CSV 다운로드)
select s.pid, e.t, e.type, e.data from events e join sessions s on s.id = e.session_id
order by s.pid, e.t;
```

### 2-6. 용량

이벤트 1건이 대략 0.3KB입니다. 참가자 1명이 수백~2천 건이면 한 명당 0.1~0.6MB,
330명이면 **최대 200MB 수준**입니다. 무료 티어(500MB)에 들어갑니다.
밀도가 높은 조건(9,238명)을 많이 돌릴 계획이면 `comment_shown` 이벤트에서
`text` 필드를 빼는 것만으로 절반 이하로 떨어집니다.

---

## 3. 조건 지정

URL 파라미터로 조건을 넘깁니다. 설문 플랫폼에서 참가자별 링크를 만들 때 사용합니다.

```
index.html?pid=P017&study=1&label=mixed&ratio=30&viewers=1243&seed=7
index.html?pid=P017&study=2&scen=B&cong=half&label=mixed&ratio=100&pollwin=40
```

| 파라미터 | 값 | 설명 |
|---|---|---|
| `pid` | 문자열 | 참가자 ID. 설문 응답과 묶는 열쇠입니다. |
| `study` | `1` \| `2` | 1 = 진입/시청, 2 = 투표/일치도 |
| `src` | `script` \| `live` | 댓글 방식. 고정 스크립트 또는 실시간 생성 |
| `label` | `human` \| `mixed` | 전원 사람 또는 사람+AI |
| `ratio` | 0–100 | AI 비율. `label=mixed`일 때만 적용 |
| `viewers` | 정수 | 표시 시청자 수. 프리셋 27 / 243 / 1,243 / 3,180 |
| `input` | `on` \| `off` | 참가자 채팅 입력 허용 |
| `seed` | 정수 | AI 배정·닉네임 seed |
| `cong` | `all` \| `half` \| `none` | study 2 의견 일치도. 참가자 투표 기준 |
| `scen` | `A` \| `B` | study 2 시나리오. A 트롤리(도덕) / B 고릴라(사실 추정) |
| `pollwin` | 0–90 | 투표 제한 시간(초). 0이면 제한 없음 |
| `why` | `on` \| `off` | 선택 이유 노출 및 작성 |
| `intro` | `on` \| `off` | 안내 페이지 표시 |
| `theme` | `light` \| `dark` | 전 조건 동일하게 고정해 쓸 것 |

잘못된 값은 기본값으로 대체됩니다.

상단 실험자 패널은 조건을 눈으로 바꿔보기 위한 것입니다.
**실제 수집에서는 숨겨야 합니다** — `<div id="lab">` 블록에 `style="display:none"`을 주면 됩니다.

---

## 4. 기록되는 행동

| 이벤트 | 담기는 것 |
|---|---|
| `session_start` | 조건 전체, 브라우저·화면 정보 |
| `intro_shown` / `intro_done` | 안내 페이지 노출과 통과 시각 |
| `card_hover` | 카드별 체류시간, 재방문 횟수, **커서가 움직인 시간**(`active_ms`) |
| `enter_click` | 어느 방송에 들어갔는지, 들어가기까지 걸린 시간 |
| `density` / `ai_allocation` | 적용된 밀도와 실제 AI 배정 결과 |
| `comment_shown` | 노출된 모든 채팅 — 시각, 작성자, AI 여부, 입장 |
| `chat_scroll` | 위로 올린 횟수, 최대 깊이, 맨 위 도달 여부 |
| `poll_shown` / `vote` / `vote_reason` | 투표 노출·선택·소요 시간·이유 텍스트 |
| `chat_unlocked` | 채팅 해제 시각 (예정 시각과 실제 시각) |
| `user_comment` | 참가자가 쓴 채팅 전문, 작성 시각 |
| `reaction` | 좋아요·싫어요 클릭과 취소 |
| `subscribe` | 구독·구독 취소와 시각 |
| `visibility` / `page_hide` | 탭을 가리거나 떠난 시각 |
| `leave` | 체류시간, 노출 메시지 수, 실제 AI 비율, 스크롤 요약, 호버 요약 |

분석에 쓸 때 주의할 점은 `claude/behavior-measures-flow.md`와
`claude/behavioral-measures-refs.md`에 정리돼 있습니다.
특히 **호버 총 시간(`total_ms`)을 주의로 읽지 말 것** — `active_ms`를 씁니다.

---

## 5. 수정할 곳

- **채팅 스크립트** — `const SCRIPT = [...]`. 영상이 확정되면 그 영상에 맞춰 다시 씁니다.
- **영상** — 현재 SVG 플레이스홀더입니다. `.player` 안의 `.scene`을 `<video>`로 교체.
- **딜레마** — `SCENARIOS.A`(트롤리), `SCENARIOS.B`(고릴라). 이유 풀은 각 24개입니다.
- **닉네임 풀** — `NICK_ROMAN`, `NICK_WORD`, `NICK_FAN`, `NICK_EN`, `NICK_AI`.
- **다른 방송 카드** — `FILLERS` 배열.

---

## 6. 알려진 한계

- `src=live`는 서버가 없어 모의 동작입니다. 실제 생성은 프록시가 붙어야 합니다.
- 영상이 플레이스홀더입니다. 실제 클립으로 바꾸면 `SPAN`(180초)과 `POLL_AT`(20초)도 맞춰야 합니다.
- 시청 화면에서 AI 비율 표시를 뺐습니다. 조작 인지는 안내 페이지·카드·채팅 줄별 AI 아이콘이 받칩니다. 조작 점검 문항에서 확인이 필요합니다.
