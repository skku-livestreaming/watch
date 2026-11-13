# 라이브 스트리밍 실험 웹설문

CloudResearch Connect → 설문(동의·사전) → 셀 균등 배정 → 조건별 설명문 → 자극물(투표 T1) → 설문(재투표 T2·사후) → 디브리핑 → CloudResearch 완료

이 폴더(`survey/`)는 자극물 저장소(`skku-livestreaming/watch`) 안에 있습니다. 설문과 자극물을 같은 사이트에 배포하며, 설문이 자극물을 iframe으로 띄웁니다.

## 파일

| 파일 | 역할 | 고칠 일 |
|---|---|---|
| `index.html` | 설문 엔진 (화면, 흐름, 저장, 자극물 연결) | 거의 없음 |
| `config.js` | 셀, 주제, 동의서, 설명문, 문항, 이동 주소 | **문항이 바뀌면 여기만** |
| `apps-script/Code.gs` | 균등 배정 + 응답 저장 (Google 시트) | 없음 |
| `apps-script/Behavior.gs` | Supabase 행동 요약 동기화 | 스크립트 속성 설정 |

## 흐름

```
CloudResearch 링크  https://skku-livestreaming.github.io/watch/survey/?participantId=…&assignmentId=…&projectId=…
  ① 동의서 (체크해야 Next 활성화)
  ② 사전 문항 (지금은 없음. 선정 기준 탈락도 없음)
  ③ 셀 배정 (서버에서 인원이 가장 적은 셀)
  ④ 조건별 설명문 (ai / human / mixed), 항목당 15초·총 45초 뒤 입장 버튼 활성화
  ⑤ 자극물을 설문 화면 안에 띄움  …/watch/?c=셀코드&panel_id=참가자ID
       투표 + 확신도(T1)는 자극물이 자체 DB(Supabase)에 저장
       [Finish participation] → 설문이 감지해 자극물을 닫고 ⑥으로
  ⑥ 본조사 시작 안내 → 재투표 + 확신도(T2), 사후 문항 ( 그다음 「라이브 스트리밍 설문지」 PDF 순서: Part 1 → 조작점검 → Part 2 → Part 3)
  ⑦ 디브리핑 + 데이터 사용 동의/철회
  ⑧ CloudResearch 완료 주소로 이동
```

- 새로고침하거나 창을 닫았다 다시 와도 같은 ID면 이어서 진행하고, 셀도 바뀌지 않아요.
- 방송 도중 새로고침하면 "Return to the stream" 버튼이 나오고, 다시 들어간 횟수가 `stim_reenter`에 남아요.

## 자극물 연결 방식

설문 페이지 위에 자극물을 화면 가득 띄우고(iframe), 자극물의 종료 화면이 뜨는지 지켜봐요.

- **종료 감지**: 자극물의 `#done` 화면이 켜지면 설문이 회색 "Saving your responses…" 화면으로 덮고, 자극물이 로그를 다 보낸 신호(`data-save-state="saved"`, 이전 버전의 `#returnLink` 표시)나 자극물이 다른 주소로 넘어가는 순간을 기다렸다가 사후 문항으로 넘어가요. 6초(`STIM_FLUSH_WAIT_MS`) 후에도 저장 미완료면 재시도 버튼을 보여 주고, 참가자는 저장 확인 뒤에만 사후 문항으로 넘어갑니다.
- **T1 읽기**(`READ_T1: true`): 자극물의 투표 상태(`PS`), 조건 코드(`cond.code`), 세션 ID(`Sink.id()`)를 **읽기만** 해서 설문 데이터에 같이 저장해요.
- **ID 유출 차단**: `RETURN_URL = null`로 외부 패널 복귀를 해제하고, 설문의 `frame-src` 보안 규칙도 유지합니다.
- **조건**: 종료 감지와 T1 읽기는 설문과 자극물이 같은 사이트(`skku-livestreaming.github.io`)에 있을 때만 동작해요. 실제 실험은 `watch` 저장소의 `survey/` 폴더에 올려야 해요.
- **미리보기 배포**: 저장소 전체를 함께 배포하거나 로컬 HTTP 서버에서 `/survey/`로 여세요. 설문 폴더만 별도 사이트에 올리는 경우에는 `STIMULUS_URL`과 CSP를 함께 설정해야 하며, 다른 출처의 자극물에서는 T1 읽기와 자동 종료 감지가 동작하지 않습니다.
- 자극물 담당자가 `#done`, `#doneTitle`, `#returnLink`, `PS`, `cond`, `Sink.id()` 이름이나 구조를 바꾸면 종료 감지·T1 읽기도 다시 맞춰야 해요.
- 참가자 배포는 같은 출처의 iframe 방식을 사용합니다. 다른 연결 방식은 별도 검증이 필요합니다.

## 개인 깃허브에 올려 미리보기 (실험 전)

1. GitHub에서 **New repository** → 이름(예: `livestream-survey`), **Public** → Create
2. **Add file → Upload files** → 이 폴더의 `index.html`, `config.js`, `README.md`, `apps-script` 폴더를 끌어다 놓고 Commit
3. **Settings → Pages** → Source: **Deploy from a branch**, Branch: **main / (root)** → Save
4. 1~2분 뒤 `https://내아이디.github.io/livestream-survey/?admin=1` (또는 `?debug=1`)로 열기
5. 문항을 고치면 저장소에서 `config.js`를 열어 연필(Edit) 아이콘으로 수정 → Commit. 1분쯤 뒤 반영돼요.

`API_URL`이 비어 있거나 참가자 모집이 닫혀 있으면 일반 참가자는 진행할 수 없습니다. 연구자 미리보기는 `?admin=1` 또는 `?debug=1`을 사용하며 응답을 저장하지 않습니다. 공개 저장소라 주소를 아는 사람은 누구나 볼 수 있어요.

실제 저장 경로까지 확인하려면 [연구자 저장 테스트](STORAGE.md#모집-전-연구자-저장-테스트)의 `?pilot=1&participantId=TEST_...` 링크를 사용합니다. 모집은 닫아 둔 채 테스트 응답을 저장하며, Connect 완료·지급 신호는 보내지 않습니다. 실제 참가자 링크와 구분하세요.

## 설치

### 1. Google 시트 + Apps Script

1. 새 Google 시트를 만들어요 (연구실 계정 권장).
2. 메뉴 **확장 프로그램 → Apps Script** → 기본 코드를 지우고 `apps-script/Code.gs` 내용을 붙여 넣고 저장.
3. **배포 → 새 배포 → 유형: 웹 앱**
   - 실행 계정: **나**
   - 액세스 권한: **모든 사용자**
4. 권한 승인 후 나오는 웹 앱 주소(`https://script.google.com/macros/s/…/exec`)를 `config.js`의 `API_URL`에 넣어요.
5. Code.gs를 고친 뒤에는 **배포 관리 → 수정 → 새 버전**으로 다시 배포해야 반영돼요 (주소는 그대로).

시트 탭 3개(`assignments`, `responses`, `log`)는 첫 응답이 들어올 때 자동으로 생겨요.

### 2. 올리기

이 저장소의 `main`에 합쳐지면 GitHub Pages로 `https://skku-livestreaming.github.io/watch/survey/`에 열려요.

### 3. CloudResearch Connect

- **Survey link**: `https://skku-livestreaming.github.io/watch/survey/` (Connect가 `participantId` 등을 뒤에 붙여 줘요)
- **Completion**: Connect의 완료 리다이렉트 주소 → `config.js`의 `REDIRECTS.complete`. 완료 코드를 쓰려면 `complete`를 비우고 `COMPLETION_CODE`에 넣어요.
- 탈락용 주소가 따로 있으면 `REDIRECTS`의 나머지 칸에 넣어요. 비워 두면 안내 문구만 보여요.

## 점검 모드

| 주소 | 동작 |
|---|---|
| `…/survey/?admin=1` | **관리자 모드.** 화면 아래 막대에서 아무 화면으로나 바로 이동(‹ › 로 앞뒤), 조건(9개 셀) 전환, 대기 시간 실제/3초 선택, Replay. **응답을 저장하지 않아요**(시트로 아무것도 안 보냄). 방송은 자극물의 연구자 미리보기로 열려서 자극물 DB에도 남지 않아요 |
| `…/survey/?debug=1` | `TEST_` ID 자동 생성, 대기 시간 3초, 오른쪽 아래 상태 패널 |
| `…/survey/?debug=1&cell=MIXED_50` | 특정 셀로 배정 |
| 패널의 `skip stream` | 방송을 끝까지 보지 않고 사후 문항으로 |
| 패널의 `reset` | 처음부터 다시 |
| `STIMULUS_EXTRA: { preview: '1' }` | 자극물의 연구자 미리보기(구간 이동 버튼, 기록 안 함). **참가자용으로는 절대 켜지 말 것** |

- `PARTICIPANT_OPEN`은 현재 false입니다. API·완료 주소·동의서 정보를 채운 후 파일럿을 거쳐 true로 바꿉니다. 연구자 미리보기에서는 서버 없이 화면을 확인할 수 있습니다.
- 점검·관리자 모드에서는 방송이 자극물의 연구자 미리보기(`preview=1`)로 열려요. 구간 이동 버튼이 있고 자극물 DB에 기록되지 않아요.
- 관리자·debug 미리보기는 설문 시트와 자극물 DB에 전송하지 않아요.
- 점검 중 실제 자극물을 보면 자극물 DB에도 `TEST_…` ID로 기록되니, 분석 전에 걸러 주세요.

## 문항 바꾸기

`config.js`의 `PAGES.pre`(자극물 전)와 `PAGES.post`(자극물 후)에 페이지를 추가·삭제하면 돼요. 지금 들어 있는 문항은 형식 예시예요.

```js
{
  id: 'need_cognition',            // 페이지 이름 (체류 시간 열: t_need_cognition)
  title: 'About you',
  showIf: ctx => ctx.group !== 'human',   // 선택: 조건별로 보이기
  blocks: [
    { type: 'likert', id: 'nfc', required: true, randomize: true,
      text: 'How much do you agree with each statement?',
      points: 7, labels: { 1: 'Strongly disagree', 7: 'Strongly agree' },
      items: [
        { id: '1', text: '…' },
        { id: '2', text: '…' },
        { id: 'att', text: 'Please select "6" for this statement.', attention: { correct: '6' } }
      ] }
  ]
}
```

| type | 용도 | 저장되는 열 |
|---|---|---|
| `likert` | 척도 표 (문항 = 행, 점수 = 열). 항목이 1개이고 문구가 없으면 단일 척도 | `id_항목id` (단일이면 `id`) |
| `single` | 하나 선택 | `id`, 기타 입력 시 `id_other` |
| `multi` | 여러 개 선택 | `id_값` = 1/0, `id` = 고른 값 목록 |
| `number` | 숫자. 키보드로만 입력(화살표 버튼·마우스 휠 없음), 숫자 외 글자는 자동으로 지움, min/max 검사 | `id` |
| `textarea` | 주관식 (기본 선택 응답) | `id` |
| `select` | 드롭다운 | `id` |
| `html` | 안내문 | 없음 |

- 척도 `labels`에 점수마다 라벨을 넣으면(`{1:'Very poor', 2:'Poor', …}`) 표 머리에 모두 표시돼요.
- `randomize: true`면 항목 순서를 섞고 실제 순서를 `id__order` 열에 남겨요.
- `screen: { allowed: ['yes'] }` → 다른 답이면 선정 기준 탈락으로 종료.
- `attention: { correct: '2' }` → 틀린 횟수가 `attention_fails`에 쌓이고, `ATTENTION.action`이 `'end'`면 `maxFails`에서 종료.
- 문구 안에 `{{topic_q}}`, `{{topic_A}}`, `{{topic_B}}`를 쓰면 주제 문구가 들어가요.
- 문구 안에 `{{viewers}}`를 쓰면 조건별 시청자 표현(`VIEWER_WORDS`, 예: AI 조건 = the AI viewers)이 들어가요.
- 문구에 `<span class="alert">…</span>`를 쓰면 빨간 굵은 글씨로 강조돼요.
- 사후 첫 페이지(`dv_revote`)는 종속변수라 맨 앞에 두는 게 좋아요. 조작점검을 먼저 물으면 답에 영향을 줄 수 있어요.
- 화면 디자인: 데스크톱 전용(`BLOCK_MOBILE: true`). 문항마다 흰 카드 한 장, 선택지는 넓은 카드형, 척도는 1~N 같은 너비 버튼. 모든 선택지가 같은 모양·너비이고 기본 선택이 없으며, 색은 응답자가 고른 칸에만 들어가요.
- 미응답이 있으면 맨 위에 오류 요약(누르면 해당 문항으로 이동)과 문항별 이유 문구가 나와요. 문구는 `TEXT.msg`에서 바꿔요.
- 강조색은 `index.html` 맨 위 CSS의 `--accent` 한 곳만 바꾸면 돼요.
- 방송 입장 전 안내(`INTRO`)는 항목 3개가 `INTRO_MIN_SECONDS`를 3등분한 간격으로 하나씩 나타나요. 조건별로 다른 것은 `INTRO.groups`의 `headline`(강조 단어는 `<span class="hl">`), `sub`, `aiRows`뿐이에요.

## 균등 배정 규칙

- 배정 시점에 9개 셀 중 **인원이 가장 적은 셀**로 넣고, 동률이면 그중 무작위.
- 인원으로 세는 것: 완료(`complete`), 방송을 마친 사람(`returned`), 마지막 상태 갱신 후 `in_progress_minutes`(기본 60분) 안에 있는 진행 중인 사람.
- 세지 않는 것: 점검 기록, 철회, 탈락, 60분이 지나도 방송을 마치지 않은 사람 (자리를 다음 사람에게 넘김).
- Supabase 설정의 `cell_quota`를 정하면 모든 셀이 차는 순간 "모집 마감" 화면이 나와요.
- 동의 후에 배정하므로 동의하지 않고 나간 사람은 셀을 차지하지 않아요.
- 현황은 Apps Script 편집기에서 `showCounts` 함수를 실행하면 볼 수 있어요.

## 데이터

| 시트 | 내용 |
|---|---|
| `responses` | **참가자당 1행.** 문항이 추가되면 열이 오른쪽에 자동으로 생겨요 |
| `assignments` | 배정 기록 (pid, cell, 상태, 배정 시각) |
| `log` | 페이지마다 보낸 원본 기록 (백업) |

`responses`의 주요 열:

| 열 | 뜻 |
|---|---|
| `pid` | CloudResearch participantId (= 자극물의 panel_id) |
| `status` | consented → assigned → stimulus → returned → complete / withdrawn / screened / attention_fail |
| `cell`, `group`, `cong`, `stim_code` | 배정 조건 |
| `is_test` | 점검 기록이면 1 |
| `consent`, `consent_at` | 동의 여부·시각 |
| `t1_vote`, `t1_conf` | 자극물 투표(A/B)와 확신도. 확신도까지 제출된 경우만 |
| `t1_submitted` | 투표 제출 여부 (0이면 일치도 조작이 성립하지 않음 → 분석 제외 후보) |
| `t1_first_choice`, `t1_clicks`, `t1_unsubmitted_choice` | 처음 고른 답, 선택 클릭 수, 제출하지 못한 선택 |
| `t1_read` | 자극물에서 T1을 읽었는지 |
| `t2_vote`, `t2_conf` | 사후 재투표(A/B)와 확신도 |
| `stim_session_id` | 자극물 DB(Supabase)의 세션 ID → 자극물 데이터와 정확히 합칠 때 사용 |
| `stim_code_seen` | 자극물이 실제로 받은 조건 코드 (`stim_code`와 같아야 정상) |
| `stim_end` | complete(정상 종료) / video_failed / navigated / debug_skip / fallback_button |
| `stim_start_at`, `stim_return_at`, `stim_reenter` | 방송 입장·종료 시각, 재입장 횟수 |
| `stim_embed_blind` | 1이면 자극물 화면을 읽지 못한 환경 (설치 위치 문제) |
| `attention_fails` | 주의 점검 오답 수 |
| `t_페이지id`, `t_intro` | 페이지 체류 시간(초) |
| `total_min` | 동의부터 디브리핑까지 걸린 시간(분) |
| `withdraw` | yes면 응답 열이 자동으로 지워져 있음 |
| `assignmentid`, `projectid`, `user_agent`, `viewport`, `is_mobile` | 참고용 |

T1(`t1_vote`)과 T2(`t2_vote`)가 같은 A/B 코드라서 한 시트에서 바로 변경 여부를 계산할 수 있어요. 채팅 작성·시청 행동 등 자세한 로그는 자극물 DB에 있고, `stim_session_id`(또는 `pid`)로 합치면 돼요.

### 분석 제외 기준 (예시, 계획서 문구와 맞출 것)

`is_test = 1` / `status ≠ complete` / `t1_submitted ≠ 1` / `stim_code_seen ≠ stim_code` / `attention_fails` 기준 초과 / `stim_reenter ≥ 1`

## 철회 처리

디브리핑에서 철회를 고르면 `responses`의 응답 열과 `log`의 해당 ID 기록이 자동으로 지워지고, 지급 확인에 필요한 ID·상태·조건만 남아요. **자극물 DB의 기록은 자동으로 지워지지 않으니**, `status = withdrawn`인 ID 목록을 자극물 담당자에게 넘겨 삭제를 요청해야 해요.

## 자극물 연결 수정 반영

- 참가자 채팅 닉네임은 ID 대신 `You`로 표시합니다.
- `RETURN_URL = null`로 예전 엠브레인 복귀 주소를 비활성화했습니다.
- 자극물은 설문과 같은 사이트의 상위 경로에서 열고, 설문에서 이미 안내했으므로 자극물의 별도 안내는 건너뜁니다.
- 종료 후 `data-save-state`를 확인해 로그 전송 완료 또는 최대 대기 시간 뒤 사후 문항으로 돌아갑니다.
- PR #6의 혼합 조건 안내 문구를 반영해 반반 비율은 말하지 않습니다.
- 실제 저장 연결은 아직 설정하지 않았습니다. [시트 설치·행동 지표 동기화·500명 검토](STORAGE.md)를 따르세요.

## IRB와 맞출 것

- 동의서·디브리핑의 `[ ]` 자리(소요 시간, 보상, IRB 번호, 연락처, 거짓이었던 정보의 구체적 내용) 채우기
- 온라인 체크박스 동의 방식, 비동의 시 창을 닫으면 된다는 안내를 동의서·계획서에 명시
- 수집 정보에 CloudResearch ID, 응답 시각, 브라우저 정보(user agent, 화면 크기)가 포함됨 → 의뢰서·동의서 개인정보 항목과 일치시키기
- 주의 점검 처리(`ATTENTION.action`)를 계획서 문구와 같게
- 선정 기준 문항은 지금 설문에 없음(스크린아웃 없음). 계획서와 맞출 것
- 참가자에게 보이는 전체 흐름은 `?debug=1`로 화면을 캡처해 제출 자료로 쓸 수 있어요

추가된 `apps-script/Behavior.gs`는 원본 Supabase 이벤트의 행동 요약을 `behavior` 시트로 가져옵니다. 설문 철회 시 이 시트의 해당 ID도 삭제하며 다시 가져오지 않습니다. Supabase 원본 삭제는 별도입니다.

참가자 배포 차단·연구자 모드 격리·저장 실패 재시도·중복 탭·입력 초안 복구의 검증 범위는 [STORAGE.md](STORAGE.md)에 정리했습니다.

자동 배정은 Supabase `assign_condition` 함수가 담당합니다. 실제 정원과 진행 중 자리 유지 시간은 DB `study_assignment_settings`에서 설정합니다. 조건 정의와 서버·설문 설정은 함께 맞춥니다. [자동 배정 규칙·설치·검증](ASSIGNMENT.md).
