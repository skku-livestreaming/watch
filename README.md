# 라이브 스트리밍 자극물

AI 시청자 연구용 실험 자극물. 현재 버전은 **영어 UI·영어 채팅, 투표 1개(맨손의 성인 남성 100명 vs. 고릴라 1마리)**입니다. 정적 파일 하나로 동작하므로 GitHub Pages에 그대로 올라갑니다.
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

[supabase_setup.sql](supabase_setup.sql) 전체를 Supabase 대시보드 → SQL Editor에 붙여넣고 실행합니다.
아래는 핵심만 옮긴 것이며, 참가자 코드를 세션 행에 채우는 `set_pid` 함수는 파일에만 있습니다.

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

주소 끝에 `&debug=1`을 붙여 자극물을 한 번 돌리고 방송이 끝난 뒤 나타나는 `Finish participation`를 누른 뒤, 종료 화면에
`서버로 전송했습니다. session_id: ...` 가 뜨면 연결된 것입니다.
참가자 화면(`debug` 없음)에는 "Your responses have been saved"만 뜨고 로그 상자·다시 시작 버튼은 숨겨집니다.
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
       s.condition->>'label' as label, (s.condition->>'ratio')::int as ratio,  -- 100 = AI, 50 = 혼합, 0 = 사람
       (s.condition->>'viewers')::int as viewers,
       e.data->>'dwell_sec' as dwell, e.data->>'subscribed' as subscribed
from sessions s
join events e on e.session_id = s.id and e.type = 'leave';

-- 이벤트 전체 (SQL Editor 결과창에서 CSV 다운로드)
select s.pid, e.t, e.type, e.data from events e join sessions s on s.id = e.session_id
order by s.pid, e.t;
```

### 2-6. 용량

이벤트 1건이 대략 0.3KB입니다. 참가자 1명이 수백~2천 건이면 한 명당 0.1~0.6MB,
450명이면 **최대 270MB 수준**입니다. 무료 티어(500MB)에 들어갑니다.
다만 무료 프로젝트는 한동안 쓰지 않으면 일시정지되고 자동 백업이 없으므로, 수집 기간에는 Pro로 올려 두는 편이 안전합니다.
채팅 본문은 로그에 남기지 않으므로(참가자가 드래그한 글만 `text_select`로 남음)
밀도가 높은 조건에서도 이벤트 수가 채팅량에 비례해 늘지 않습니다.

---

## 3. 조건 지정

Study 2 전용입니다. 참가자는 링크를 타고 **바로 방송으로 들어갑니다** — 방 목록이나 선택 단계가 없습니다.
조건은 **코드**로 넘깁니다. 주소에 `cong=half`처럼 쓰면 참가자가 보고 조작을 알아챕니다.

```
https://skku-livestreaming.github.io/watch/?c=m2
```

참가자 ID는 **안내 페이지에서 직접 받습니다**. 링크에 넣지 않습니다.
고유 코드나 이메일 주소 둘 다 받습니다 — `@`가 들어 있으면 이메일 형식을 검사하고, 아니면 코드로 봅니다.

| 코드 | 의견 일치도 | 채팅 정체성 |
|---|---|---|
| `q7` | 전부 일치 | AI |
| `m2` | 절반 | AI |
| `z5` | 전부 불일치 | AI |
| `b9` | 전부 일치 | 사람 |
| `k3` | 절반 | 사람 |
| `r6` | 전부 불일치 | 사람 |
| `v3` | 전부 일치 | AI+사람 반반 |
| `t8` | 절반 | AI+사람 반반 |
| `f1` | 전부 불일치 | AI+사람 반반 |

3(일치도) × 3(정체성) = 9조건입니다. 내부 값은 AI = `label=mixed, ratio=100`, 혼합 = `label=mixed, ratio=50`, 사람 = `label=human, ratio=0`입니다.

혼합 조건의 표시는 AI 조건과 같습니다 — AI 화자의 줄마다 아이콘, 사용자 카드, 종료 화면 카드의 "AI 시청자" 표시.
비율 숫자는 화면에 띄우지 않고, "반반 섞여 있다"는 안내는 설문 화면에서 말로 합니다.
정체성은 화자 단위로 붙습니다(같은 닉네임은 끝까지 AI이거나 끝까지 사람).
AI 화자는 전체 채팅 발화량과 단일 투표의 입장 발화량이 목표 비율에 가까워지도록 배정합니다.
절반 일치 조건은 AI 줄과 사람 줄을 각각 번갈아 내보내 정체성마다 일치·불일치 개수 차이가 최대 1개가 되도록 합니다.
구체적인 노출 수는 영상과 시드에 따라 달라지므로 이전 영상의 고정 개수를 재사용하지 않습니다.

같은 의견은 사람이, 반대 의견은 AI가 하는 식으로 쏠리면 일치도 효과와 정체성 효과를 나눌 수 없기 때문입니다.
실제 노출은 `leave.polls[].shown_by_identity`에, 배정 결과는 `ai_allocation.stance_ai`에 남습니다.
대사 반응(`CUES`)과 마무리 인사는 입장이 없는 줄이라 화자 명단에서 무작위로 뽑습니다.
단, 이모지가 들어간 줄은 사람처럼 따뜻하게 읽히는 신호가 될 수 있으므로 혼합 조건에서는 AI와 사람이 번갈아 말하게 합니다(`pickSpeaker`).
실제 노출은 `leave.emoji_shown_by_identity`에 남습니다.

입력값은 공백 제거·소문자 변환 후 세션 행의 `pid`에 들어갑니다. 설문 응답과 묶는 열쇠입니다.
**이메일을 받는 경우 개인식별정보이므로 IRB 동의서에 수집 사실과 보관 기간을 넣어야 합니다.**
고유 코드만 받으면 그 부담이 없습니다.

### 엠브레인 패널 연동

엠브레인 패널은 링크 뒤에 패널 ID를 붙여 들어오고, 끝나면 엠브레인으로 상태값을 붙여 돌려보냅니다.

```
들어올 때  https://skku-livestreaming.github.io/watch/?c=m2&panel_id=[ID]
나갈 때    http://survey.panel.co.kr/2019/XXXX/m5.asp?panel_id=[ID]&status=001
```

- `panel_id`가 있으면 안내 페이지의 코드 입력란이 숨겨지고, 그 값이 **대소문자 그대로** `pid`가 됩니다(엠브레인에 돌려줄 값과 같아야 매칭됨).
  영문·숫자·`-`·`_` 64자 이하만 받고, 어긋나면 없는 것으로 보고 코드 입력을 받습니다(리다이렉트 없음).
- 돌려보낼 주소와 상태 코드는 `index.html`의 `RETURN_URL`·`RETURN_STATUS`에 있습니다. 실제 조사 링크를 받으면 이 두 줄만 바꿉니다.
  상태값은 주소나 입력에서 받지 않고 코드에 고정된 값만 씁니다.

상태값 기준 — **참가자의 행동(투표·채팅·탭 가림)으로는 가르지 않습니다.** 측정값으로 탈락시키면 조건별 표본이 달라지므로
이런 경우는 완료로 보내고 분석 단계에서 사전에 정한 기준으로 제외합니다. 애매하면 완료로 보냅니다.

| 상황 | 상태 |
|---|---|
| 방송 종료 후 [참여 종료하기] 클릭 | 완료 (`001`) |
| 영상 파일을 3번 연속 불러오지 못해 "참여를 종료합니다" 클릭 | 아웃 (`RETURN_STATUS.out`. **null이면 버튼이 뜨지 않고 아웃을 보내지 않음**) |
| 창을 닫음 · 중간 이탈 | 보내지 않음 (엠브레인에 미완료로 남음) |
| `panel_id` 없음 · 형식 오류 | 보내지 않음 |

종료 버튼을 누르면 로그 전송(`leave`, `redirect` 이벤트 포함)을 기다렸다가 최대 4초(`RETURN_WAIT_MS`) 뒤 이동합니다.
전송이 늦어도 이동은 합니다 — 못 보낸 묶음은 재시도 큐에 남습니다. 자동 이동이 막히면 종료 화면에 수동 링크가 뜹니다.
`&debug=1`이면 이동하지 않고 만들어진 주소만 보여 줍니다.

새로고침하면 같은 `panel_id`로 세션이 하나 더 생깁니다. 분석에는 `leave.via = 'end_button'`인 세션을 쓰고, 여럿이면 처음 것을 씁니다.
조사가 끝나면 엠브레인의 완료자 목록과 이 기준의 세션 목록을 대조합니다.

점검할 때는 개별 파라미터로 덮어쓸 수 있습니다. **참가자 링크에는 쓰지 마세요.**

| 파라미터 | 값 | 설명 |
|---|---|---|
| `cong` | `all` \| `half` \| `none` | 의견 일치도. 참가자 투표 기준 |
| `label` | `human` \| `mixed` | 전원 사람, 또는 AI가 있는 조건(비율은 `ratio`) |
| `ratio` | 0–100 | AI 비율. `label=mixed`일 때만. 100 = 전부 AI, 50 = 혼합 |
| `viewers` | 정수 | 표시 시청자 수 (기본 1,243) |
| `intro` | `on` \| `off` | 안내 페이지 |
| `input` | `on` \| `off` | 참가자 채팅 입력 허용 |
| `seed` | 정수 | 닉네임·배정 seed |
| `theme` | `light` \| `dark` | 전 조건 동일하게 고정해 쓸 것 |

### 흐름과 시각

현재 `stream.mp4`는 약 **266.68초(4분 27초)**의 영어 방송입니다. 여행·음식·관광·동물원 이야기를 한 뒤 한 번의 투표를 진행합니다.
영상은 0초부터 재생하며, 안내 후 약 1.8초의 입장 버퍼링이 있습니다. 방송 경과 시간은 `03:31:26 live`부터 표시하는 모의 설정입니다.
모든 투표 시점은 원본 영상 시각(초)이며 `currentTime`을 따라갑니다. 버퍼링 중에는 채팅과 투표도 멈춥니다.

| 영상 시각 | 동작 |
|---|---|
| 0–123초 | 영어 여행·동물원 잡담과 대사 반응. 투표 질문·선호는 미리 노출하지 않음 |
| 123초 | 질문과 투표 방식 안내 시작 (`poll_announced`) |
| 약 144–162초 | 답 선택 뒤 확신도를 1–7로 고르는 방법을 스트리머가 설명 |
| 169.1초 | 채팅 잠금 |
| 181.05초 | 투표 카드 표시: **Who would win in a fight: one gorilla or 100 unarmed men?** |
| 199.84초 | “ten more seconds”에 맞춰 남은 시간 표시 시작 |
| 210.7초 | “that is it”에 맞춰 마감 |
| 216.2초 | “what you guys picked” 직후 결과 표시 및 채팅 재개 |
| 250.5초 | 결과 카드를 유지한 채 마무리 인사 시작. 입장 발화 대신 종료 인사 출력 |
| 약 266.68초 | 영상 종료와 함께 결과 카드 내림, 추천·Subscribe·Finish participation 표시 |

영상에서는 투표 질문을 소리 내어 읽지 않습니다. 질문과 선택지(One gorilla / 100 unarmed men)는 카드가 제시합니다.
시청자 입장 발화는 어느 쪽을 골랐는지만 말하며, 한쪽을 설득하는 이유를 붙이지 않습니다.

**투표 제출:** 선택지와 확신도(1 = Not at all sure, 7 = Completely sure)가 모두 있어야 제출됩니다.
확신도는 선으로 연결된 원 7개로 표시하며, 맨 왼쪽에 1, 맨 오른쪽에 7만 작게 표시합니다.
Submit vote 전에는 답과 확신도를 바꿀 수 있고, 답을 바꾸면 확신도는 다시 선택해야 합니다.
마감 시 두 값이 모두 있으면 자동 제출하고, 확신도가 없는 선택은 `vote_incomplete`와 `poll_missed`로 기록합니다.
자유서술 이유 입력란과 `why` 파라미터는 제거했습니다. 투표를 일찍 제출해도 채팅은 결과 공개 시점에 같이 열립니다.

`leave.polls[]`에는 투표 **1개**만 들어갑니다. `vote`와 `confidence`는 요약용 사본이고 `vote2`는 생성하지 않습니다.
완료된 투표는 `vote` 이벤트의 `confidence` 및 `vote_confidence.value`에 1–7 값이 저장됩니다.
세션 조건의 `stimulus_version = 2026-11-en-single-poll-contextual-chat`와 `language = en`으로 이전 버전과 구분할 수 있습니다.

결과 카드는 216.2초부터 영상 종료까지 약 **50.5초** 유지합니다(`POLLS[].hide = null`).
영상 종료 시 `poll_result_hidden`을 기록하고 결과 카드를 내려 종료 버튼을 가리지 않게 합니다.

결과 표 수는 기존 일치도 조작을 따릅니다. 투표 완료자 기준 `all`은 내 선택 전원, `none`은 내 선택 1명,
`half`는 50:50입니다. 미투표자는 반반 근처로 표시합니다. 실제 표 수는 `poll_result_shown`에 기록됩니다.
참가자에게는 막대 길이만 보여주고 득표수·퍼센트·총 투표수는 표시하지 않습니다. 채팅 공지에도 결과 수치를 쓰지 않습니다.
결과 자체도 사회적 신호이므로 분석 계획에 함께 명시해야 합니다.

방송 중 Subscribe와 종료 후 Subscribe·추천 클릭은 기존처럼 기록합니다. 추천 클릭은 페이지 밖으로 이동하지 않습니다.
백로그는 `before_join: true`이며 일치도 분석에서 제외합니다. 채팅 작성은 선택입니다.

## 4. 기록되는 행동

| 이벤트 | 의미 |
|---|---|
| `session_start`, `intro_shown`, `intro_done`, `participant_id`, `watch_start` | 조건·참가자 식별·진입 |
| `density`, `ai_allocation`, `stance_slots` | 밀도·정체성·입장 배정 |
| `poll_announced`, `poll_shown`, `chat_locked` | 예고·투표 표시·채팅 잠금 |
| `vote_click`, `option_hover` | 선택 변경 및 선택지 체류 |
| `confidence_click` | 확신도 선택과 변경 |
| `vote_confidence`, `vote` | 확신도와 함께 확정된 응답. `auto`로 마감 자동 제출 구분 |
| `vote_incomplete`, `poll_missed`, `poll_closed` | 미완성·미참여·마감 |
| `poll_result_shown`, `poll_result_hidden`, `chat_unlocked` | 결과와 채팅 노출 시점 |
| `user_comment`, `chat_scroll`, `user_card_open`, `user_card_close`, `text_select` | 채팅 작성·탐색·사용자 카드·텍스트 선택 |
| `reaction`, `subscribe`, `next_video_click`, `theme_toggle` | 반응·구독·추천·테마 변경 |
| `seek_attempt`, `rate_attempt`, `pause_attempt` | 영상 제어 시도 |
| `outro_started`, `stream_ended`, `video_error`, `visibility`, `page_hide` | 종료·재생·탭 상태 |
| `leave`, `redirect` | 투표 1개와 확신도·노출·종료 행동 요약 및 패널 복귀 |

`supabase_monitor.sql`의 `participant_results`에 `confidence1`과 `stimulus_version`을 추가했습니다.
새 뷰 정의를 Supabase SQL Editor에서 실행해야 이 열이 표시됩니다. 기존 `reason1`, `vote2` 등은 과거 세션 조회를 위해 남겼으며,
현재 자극물은 해당 이벤트를 생성하지 않습니다. 기존 테이블은 JSONB 이벤트 구조라 변경할 필요가 없습니다.

### 노출 기준 2종 — 섞어 쓰지 말 것

`leave.shown_*`은 **피드에 붙었다**는 사실이지 본 것이 아닙니다. 스크롤이 위에 가 있으면 화면 밖에 쌓이고,
밀도가 높으면 읽기 전에 밀려 올라가고, 탭을 가린 동안에도 쌓입니다.
그래서 종료 요약에 두 기준을 나란히 둡니다.

| 기준 | 필드 | 뜻 |
|---|---|---|
| 렌더 | `shown_congruent` / `shown_incongruent` / `shown_congruence_ratio` | 피드에 붙은 개수 |
| 화면 체류 | `seen_congruent` / `seen_incongruent` / `seen_congruence_ratio` | 채팅창 안에 1초 이상 떠 있던 개수 |
| | `visible_ms_congruent` / `visible_ms_incongruent` | 입장별 누적 화면 체류 시간(ms) |
| | `lines_total` / `lines_seen` / `lines_offscreen` | 피드에 들어온 전체 줄 / 1초 이상 본 줄 / 한 번도 안 뜬 줄 |

**두 기준의 차이 자체가 보고할 값입니다.** 이전 영상의 파일럿 예시 — 같은 조건에서

| 시청 방식 | 미노출 | 일치율 (렌더 → 체류) |
|---|---|---|
| 그냥 보기 | 0건 | 43.3% → 43.3% |
| 위로 올려놓고 방치 | 31건 | 43.3% → **66.7%** |
| 탭 가림 | 31건 | 43.3% → **66.7%** |

조건 효과는 설정값으로 묶되, 처치강도에는 체류 기준을 쓰십시오.

`shown_*`과 `lines_*`은 **세는 대상이 다릅니다.** `shown_*`은 타임라인 발화만,
`lines_*`은 백로그·예고 반응·참가자 본인 글까지 포함한 모든 줄입니다. 두 수를 직접 빼지 마십시오.

한계 — **화면에 있었다 ≠ 읽었다.** 시선 추적 없이는 그 이상 불가. 논문에는 "읽은 메시지"가 아니라
"화면 노출 시간"으로 기술하십시오.

분석에 쓸 때 주의할 점은 `claude/behavior-measures-flow.md`와
`claude/behavioral-measures-refs.md`에 정리돼 있습니다.
특히 **카드를 연 것을 '정보를 찾아본 행동'으로 읽지 말 것** — 호버는 비용이 0이라 그 해석이 성립하지 않습니다(Kang et al. 2009). 클릭은 비용이 있어 로그에서 구분해 둡니다.

---

## 5. 수정할 곳

- `POLLS`: 질문·선택지·한 개 투표의 고정 시점과 결과 뒤 입장 발화. 양쪽 문장은 같은 개수와 말투로 맞추며 이유를 붙이지 않습니다.
- `SCRIPT`: 입장 전 백로그의 영어 잡담. 방송 중 댓글과 분리해 입장 시 피드를 채우느라 이후 대본이 소진되지 않도록 합니다.
- `CHAT_PHASES`: 영상의 여행·박물관·동물원·새·마무리·투표 안내 구간에 맞춘 댓글. 각 구간에서 한 문장은 한 번만 쓰고, 준비한 문장이 소진되면 다음 구간까지 쉽니다. 밀도 모델의 도착 시각을 따르되 빈자리를 무작위 웃음으로 채우지 않습니다.
- `CUES`: 새 영상의 대사 반응. `t`는 원본 영상 시각이며 실제 출력은 기본 2.5초 뒤입니다. 현재 영상에는 스트리머가 대놓고 웃는 장면이 없으므로 `lolll`·`lmao` 같은 단독 웃음은 넣지 않습니다. 새 영상에서 웃는 대사가 있으면 이곳에만 배치하며, 철자가 달라도 같은 웃음 반응으로 중복을 검사합니다. 잠금 중인 줄은 버립니다. 투표 결과 뒤의 일반 댓글은 `POLLS[].neutral`에서 고릅니다.
- 이모지: `CUES`와 `REACT_OUTRO`에만 둡니다. 음식 🤤(18초), 첫 동물원 😮와 이모지만 있는 😮(54·56초), 새 🐦(80초), 마무리 신호 ❤️(99초),
  마무리하려는 순간 😭와 이모지만 있는 😭😭(104·105.5초), “one more thing” 👀(119.5초), 확신도 설명 👍(145초), 채팅 잠금 직전 👋(165초),
  결과 공개 👀(217초), 투표를 더 하자는 반응 🙏(247초). 작별 인사는 20개 중 10개에 이모지(❤️ 👋 😴 🌙 💤 😊)가 붙습니다.
  기본 조건(시청자 1,243명, seed 7)에서 방송 중 채팅 약 165줄 가운데 16줄(약 10%)이며, AI·사람 혼합 조건에서는 8:8로 나뉩니다.
  입장 발화·결과 뒤 일반 댓글·주제별 댓글은 화자가 타임라인에서 정해져 정체성 균형을 맞출 수 없으므로 이모지를 쓰지 않습니다.
  투표 주제를 미리 드러내거나 한쪽 편을 들 수 있는 이모지(🦍 🐒 💪 🔥 💀), 결과가 나온 뒤 입장 발화 사이에서 특정 선택이나 결과를 응원하는 것처럼 읽힐 수 있는 이모지(🙌 등),
  예전 Windows에서 빈 네모로 보이는 최신 이모지(🫶 🫡 🥹 등)는 쓰지 않습니다. 이모지 비율은 편집상 판단이며 실제 채팅의 빈도 추정치가 아닙니다.
- `REACT_OUTRO`: 마무리 인사. `OUTRO_AT`부터 입장 발화가 멈추고 이 인사들이 나옵니다.
- `NICK_*`, `makeNick`: 합성 영어 닉네임. AI·사람 모두 같은 풀에서 뽑고 정체성만 배지로 표시합니다. 실측 플랫폼 분포로 주장하지 않습니다.
- `END_VIDEOS`: 종료 화면의 영어 추천 제목·조회수·게시 시점.
- `SPAN`, `OUTRO_AT`, `END_AT`, `VIDEO_TRIM`: 영상 길이·마무리·종료·시작 위치. 새 영상을 넣으면 `POLLS`·`CUES`와 함께 갱신합니다.

현재 영상은 웹 재생용 H.264/AAC, 1920×1080이며 빠른 재생 시작을 위해 MP4 메타데이터를 파일 앞쪽에 두었습니다.
원래 제공된 HEVC 파일은 `.local-backups/stream-original-20261107-hevc.mp4`에 보관했습니다(배포·Git 추적 제외).

## 6. 검증

```powershell
python -m pip install playwright
python -m playwright install chromium
python tests/check_stimulus.py
```

설치된 Chrome을 쓰려면 `CHROME_PATH` 환경 변수에 실행 파일 절대 경로를 지정할 수 있습니다.
테스트는 로컬 임시 서버를 열고 외부 요청을 차단하므로 실제 Supabase에 테스트 데이터를 보내지 않습니다.
9개 실험 조건 × 양쪽 선택, 확신도 누락·답 변경·마감 자동 제출, 투표 1개만 기록되는지,
일치도별 결과·채팅, 320–1440px 레이아웃과 영어 문구를 확인합니다. 영상 재생은 별도로 브라우저에서 확인해야 합니다.

화면에 있었다는 기록은 실제로 읽었다는 의미가 아닙니다. 로그 해석 시 위의 노출 기준을 구분하십시오.
패널 복귀 URL의 `XXXX`는 기존 자리표시자입니다. 실제 조사를 시작하기 전에 조사 플랫폼 주소를 설정해야 합니다.
