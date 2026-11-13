/* ═══════════════════════════════════════════════════════════════
   설문 설정 파일 — 문항이 바뀌면 이 파일만 고치면 됩니다.
   참가자에게 보이는 글은 영어, 주석은 한국어입니다.
   ═══════════════════════════════════════════════════════════════ */
window.SURVEY_CONFIG = {

  /* ── 1. 기본 설정 ─────────────────────────────────────────── */
  STUDY_ID: 'livestream-ai-chat-2026',     // 바꾸면 브라우저에 저장된 진행 상태가 초기화됩니다

  // Apps Script 웹 앱 주소(…/exec). 비워 두면 저장 없이 화면만 점검하는 모드로 돌아갑니다.
  API_URL: '',
  // 실제 저장·완료 주소와 연구 안내를 채우고 파일럿을 확인한 뒤 true로 변경합니다.
  PARTICIPANT_OPEN: false,
  ASSET_VERSION: '2026-11-13-participant-v1',

  // 자극물 주소. 끝에 ?c=셀코드&panel_id=참가자ID 가 자동으로 붙습니다.
  // 현재 설문과 같은 사이트의 상위 폴더에서 방송을 띄웁니다. 로컬 확인도 같은 경로를 사용합니다.
  // 주소를 바꾸면 index.html 맨 위 frame-src 줄의 주소도 같이 바꿀 것
  STIMULUS_URL: new URL('../', window.location.href).href.split('?')[0],
  // 자극물에 추가로 넘길 값. 예: 자극물 자체 안내 화면을 끄려면 { intro: 'off' }
  STIMULUS_EXTRA: {intro: 'off'},

  /* 자극물을 설문 페이지 안에 띄우는 방식(true).
     참가자가 [Finish participation]을 누르면 설문이 감지해 사후 문항으로 넘어갑니다.
     설문과 자극물이 같은 사이트에 있어야 종료 감지와 T1 읽기가 동작합니다.
     false면 자극물로 이동하고, 자극물의 복귀 주소(RETURN_URL)로 돌아오는 방식입니다. */
  STIMULUS_EMBED: true,
  // 자극물의 투표 결과(T1 선택·확신도)와 자극물 세션 ID를 읽어 설문 데이터에 함께 저장(읽기만 함)
  READ_T1: true,
  // 종료 화면이 뜬 뒤 자극물이 로그를 다 보낼 때까지 기다리는 최대 시간(ms)
  STIM_FLUSH_WAIT_MS: 6000,

  // CloudResearch Connect가 주소 뒤에 붙여 주는 값의 이름
  ID_PARAM: 'participantId',
  EXTRA_PARAMS: ['assignmentId', 'projectId'],
  // 자극물이 받는 panel_id 형식. 어긋나면 자극물이 ID를 버리므로 입장 전에 막습니다.
  ID_PATTERN: /^[A-Za-z0-9_-]{1,64}$/,

  // 모바일 접속 차단 여부 (자극물이 PC 기준이면 true)
  BLOCK_MOBILE: true,

  /* ── 2. 실험 셀 (3 × 3) ───────────────────────────────────────
     code = 자극물의 조건 코드. 자극물 담당자가 코드를 바꾸면 여기도 같이 바꿉니다.
     group: ai | human | mixed  →  4번의 조건별 설명문을 고릅니다.
     cong : all(100%) | half(50%) | none(0%) */
  CELLS: [
    { id: 'AI_100',    group: 'ai',    cong: 'all',  code: 'q7' },
    { id: 'AI_50',     group: 'ai',    cong: 'half', code: 'm2' },
    { id: 'AI_0',      group: 'ai',    cong: 'none', code: 'z5' },
    { id: 'HUMAN_100', group: 'human', cong: 'all',  code: 'b9' },
    { id: 'HUMAN_50',  group: 'human', cong: 'half', code: 'k3' },
    { id: 'HUMAN_0',   group: 'human', cong: 'none', code: 'r6' },
    { id: 'MIXED_100', group: 'mixed', cong: 'all',  code: 'v3' },
    { id: 'MIXED_50',  group: 'mixed', cong: 'half', code: 't8' },
    { id: 'MIXED_0',   group: 'mixed', cong: 'none', code: 'f1' }
  ],
  CELL_QUOTA: 0,               // 표시용 기본값. 실제 정원은 서버 스크립트 속성 CELL_QUOTA에서 설정 (0 = 제한 없음)
  IN_PROGRESS_MINUTES: 60,     // 서버 스크립트 속성 IN_PROGRESS_MINUTES의 기본값 (진행 중 자리 유지 시간)

  /* ── 3. 투표 주제 ─────────────────────────────────────────────
     자극물의 투표와 같은 질문·선택지로 맞춥니다. A/B 값은 자극물 로그의 choice(A/B)와 같아야
     T1(자극물 투표)과 T2(사후 재투표)를 바로 비교할 수 있습니다. 문구 안에서 {{topic_q}},
     {{topic_A}}, {{topic_B}}로 불러 쓸 수 있습니다. */
  TOPIC: {                     // 자극물 hj 브랜치(11/12) 기준
    q: 'Do you think that video games contribute to youth violence?',
    A: 'Yes',
    B: 'No',
    order: ['A', 'B']          // 자극물 화면의 선택지 순서와 같게
  },

  /* ── 4. 이동 주소 (CloudResearch Connect에서 받은 값) ─────── */
  REDIRECTS: {
    complete: '',              // 완료 리다이렉트 주소. 비우면 아래 완료 코드를 화면에 보여 줍니다
    screenedOut: '',           // 선정 기준 탈락
    attentionFail: '',         // 주의 점검 탈락 (ATTENTION.action이 'end'일 때만)
    full: ''                   // 모든 셀 마감
  },
  COMPLETION_CODE: '',

  // 주의 점검 문항 처리. 'flag' = 기록만 하고 계속(분석 시 제외) / 'end' = 설문 종료
  // ※ 연구계획서·동의서의 문구와 반드시 같게 맞출 것
  ATTENTION: { maxFails: 2, action: 'flag' },

  INTRO_MIN_SECONDS: 45,       // 조건별 설명문 강제 체류 시간(초). 항목 3개가 이 시간을 3등분해 하나씩 나타납니다 (45초 = 항목당 15초)

  /* ── 5. 동의서 ─────────────────────────────────────────────── */
  CONSENT: {
    title: 'Research Consent',
    lead: 'Please read the information below before deciding whether to take part.',
    // 맨 위 요약 칸 (비우면 표시하지 않음). 본문 값과 같게 맞출 것
    facts: [
      { label: 'Time', value: 'About [N] minutes' },
      { label: 'Payment', value: '[Amount]' },
      { label: 'Device', value: 'Computer only' }
    ],
    html: `
      <p><b>Purpose.</b> This study examines viewers' experiences with and perceptions of live streaming.
      It is conducted for academic research only.</p>
      <p><b>Procedure.</b> You will answer a few questions, watch a short live stream, and then complete a
      questionnaire. The study takes about [N] minutes.</p>
      <p><b>Data.</b> We collect your responses and basic demographic information (e.g., gender, age).
      Your CloudResearch ID is used only to process payment and is stored separately from your answers
      after the study. All data are kept confidential and used for research purposes only.</p>
      <p><b>Compensation.</b> [Amount] upon completion.</p>
      <p><b>Voluntary participation.</b> You may stop at any time without penalty.</p>
      <p><b>Contact.</b> This study has been reviewed by the Institutional Review Board of Sungkyunkwan
      University (IRB No. [XXXX]). Questions: [Researcher name], [email].</p>`,
    // 체크박스 문구. 체크해야 [Next]가 눌립니다.
    agree: 'I have read the information above and agree to participate.',
    // 체크박스 아래 작은 안내. 비우면 표시하지 않습니다. (IRB 문구와 맞출 것)
    declineNote: 'If you do not wish to participate, you may close this window.'
  },

  /* ── 6. 조건별 설명문 (자극물 입장 직전, INTRO_MIN_SECONDS 체류) ──
     항목 3개가 INTRO_MIN_SECONDS를 3등분한 간격으로 하나씩 나타나고, 끝나면 입장 버튼이 켜집니다.
     세 조건의 화면 구성·그림·애니메이션은 똑같고, groups의 문장(headline, sub)과 미리보기 채팅의 AI 배지만 다릅니다.
     (조건 간 차이가 "시청자가 누구인지" 하나로만 남도록)
     headline = 크게 보이는 핵심 문장, sub = 그 아래 보조 문장
     <span class="hl">…</span> = 강조색으로 표시할 단어 (세 조건 모두 같은 색)
     문구 안 <span class="aib">AI</span> = 방송 화면과 같은 AI 배지 */
  INTRO: {
    title: 'Before you join the stream',
    lead: 'Three things to know. Please read each one.',
    viewers: {
      heading: 'Who is watching with you',
      chatTitle: 'Stream chat',
      caption: 'Example: how the chat will look'
    },
    actions: {
      heading: 'What you can do',
      headline: 'You can freely watch the stream and type in the chat.',
      sub: 'You can also use the like and subscribe buttons. Chatting is optional.',
      demoMessage: 'great stream!',        // 그림 속 입력칸에 타이핑 → 전송되는 예시. 주제와 관련 없는 말만
      demoName: 'You',
      caption: 'Example: the controls under the video'
    },
    finish: {
      heading: 'When the stream ends',
      headline: 'Click the red <span style="white-space:nowrap">Finish participation</span> button to continue.',
      sub: 'It appears in the center of the video. If you close the window without clicking it, your participation will not be complete.',
      mockTitle: 'The stream has ended',
      mockButton: 'Finish participation',
      caption: 'Example: the end of the stream'
    },
    enterNote: 'The stream opens full screen. Please keep this window open until it ends.',
    groups: {
      ai: {
        headline: '<span class="hl">All</span> other viewers in this stream are <span class="hl">AI</span>.',
        sub: 'Every chat message is written by AI, not by people. Messages written by AI are marked with an <span class="aib">AI</span> label.',
        aiRows: [1, 1, 1, 1]          // 미리보기 채팅 줄마다 AI 배지 여부
      },
      human: {
        headline: 'The other viewers in this stream are <span class="hl">people</span> watching at the same time as you.',
        sub: 'Every chat message is written by a person.',
        aiRows: [0, 0, 0, 0]
      },
      mixed: {
        // PR #6: describe the mixed audience without revealing its ratio.
        headline: 'This stream is a space where <span class="hl">AI</span> and <span class="hl">people</span> watch together.',
        sub: 'Messages written by AI are marked with an <span class="aib">AI</span> label.',
        aiRows: [1, 0, 0, 1]
      }
    },
    // 미리보기 채팅. 주제와 관련 없는 인사만 넣을 것(의견에 영향을 주지 않도록)
    chatPreview: [
      { name: 'maple_22',   text: 'hi everyone' },
      { name: 'jaykim',     text: 'hello!' },
      { name: 'riverstone', text: 'just joined' },
      { name: 'nova8',      text: 'hey all' }
    ]
  },
  ENTER_BUTTON: 'Enter the stream',

  /* ── 7. 디브리핑 ───────────────────────────────────────────── */
  DEBRIEF: {
    title: 'About this study',
    html: `
      <p>Thank you for participating. Before you finish, we would like to tell you more about this study.</p>
      <p>This study examined whether chat messages from other viewers in a live stream influence viewers'
      opinions.</p>
      <div class="callout">
        <p><b>Some information in the stream was not real.</b> [Describe exactly what was false, e.g.:
        all chat messages were prepared in advance by the research team, and the poll results were generated
        based on your own vote.]</p>
        <p>We could not tell you this beforehand because knowing it would have changed how you responded.</p>
      </div>
      <p>Your choice in the poll does not reflect what other people actually think.</p>
      <p>Now that you know the purpose of the study, you may withdraw your data. You will be paid in either
      case. Questions: [Researcher name], [email].</p>`,
    question: 'May we use your responses in our research?',
    keep: 'Yes, you may use my responses.',
    withdraw: 'No, please delete my responses.'
  },

  /* ── 8. 문항 페이지 ───────────────────────────────────────────
     pre  = 동의 후 · 자극물 전 /  post = 자극물 후 · 디브리핑 전
     ※ 「라이브 스트리밍 설문지」(PDF) 기준. 문항은 원문 그대로 영어로 옮긴 것. 선별(스크린아웃) 문항은 뺌.

     페이지: { id, title?, blocks:[…], showIf?: ctx => bool, minSeconds? }
     블록 type
       html      : 안내문           { html }
       single    : 하나 선택         { id, text, options, required?, randomize?, horizontal?, screen?, attention? }
       multi     : 여러 개 선택      { id, text, options, min?, max? }
       likert    : 척도 묶음         { id, text, items:[{id,text}], points, labels:{1:'..',7:'..'}, randomize? }
       textarea  : 주관식           { id, text, minChars? }
       number    : 숫자 (키보드로만 입력, 숫자 외 글자는 자동으로 지움)  { id, text, min?, max? }
       select    : 드롭다운          { id, text, options }
     options: ['문구', …] 또는 [{value:'코드', label:'문구', other:true(기타 입력칸)}]
     screen   : { allowed:['값', …] }  → 그 외를 고르면 선정 기준 탈락으로 종료
     attention: { correct:'값' }       → 틀리면 ATTENTION 규칙 적용
     splash   : 문항 없는 단계 안내 화면 { steps, current, kicker, title, body, pagesFmt, button } (main_start 참고)
     showIf   : ctx => 조건. ctx.group('ai'|'human'|'mixed'), ctx.cong, ctx.answers 사용 가능
     문구 안 {{viewers}} = 조건별 시청자 표현 (VIEWER_WORDS)
     저장되는 열 이름: single/number/textarea = id, likert = id_항목id, multi = id_값(1/0) */
  VIEWER_WORDS: { ai: 'the AI viewers', human: 'the other viewers', mixed: 'the other viewers' },

  PAGES: {
    pre: [],

    post: [
      {
        // 방송 끝난 직후 본조사 시작 안내 (문항 없음). 쪽 수는 이 뒤로 남은 쪽을 세서 자동으로 넣음
        id: 'main_start',
        splash: {
          steps: ['Consent', 'Live stream', 'Questionnaire', 'Finish'],
          current: 2,                                   // 0부터 셈. 2 = Questionnaire
          kicker: 'The live stream is over',
          title: 'Now, the main questionnaire',
          body: 'Please answer the following questions about the live stream you just watched. There are no right or wrong answers.',
          pagesFmt: n => `About ${n} pages`,
          button: 'Start the questionnaire'
        },
        blocks: []
      },
      {
        // 종속변수(T2)는 안내 바로 다음, 문항 중 맨 앞
        id: 'dv_revote',
        blocks: [
          { type: 'single', id: 't2_vote', required: true,
            text: 'If the poll from the stream were held again right now, which would you choose?<br><i>{{topic_q}}</i>',
            options: 'TOPIC' },     // 'TOPIC' = 3번 주제의 A/B를 자극물과 같은 순서로
          { type: 'likert', id: 't2_conf', required: true,
            text: 'How confident are you in this choice?',
            points: 7, labels: { 1: 'Not at all confident', 7: 'Extremely confident' },
            items: [{ id: 'x', text: '' }] }
        ]
      },

      /* ── Part 1. 방송 시청 후 ── */
      {
        // 1. 의견 공유
        id: 'shared_view',
        blocks: [
          { type: 'likert', id: 'shared', required: true,
            text: 'Please rate, from 1 (Strongly disagree) to 7 (Strongly agree), how much you think you share thoughts and feelings with the other viewers of this live stream about the discussion topic presented in the stream.',
            points: 7, labels: { 1: 'Strongly disagree', 7: 'Strongly agree' },
            items: [
              { id: '1', text: 'I think my thoughts on this topic match well with those of the other viewers of this live stream.' },
              { id: '2', text: 'I think I feel the same way about this topic as the other viewers of this live stream.' },
              { id: '3', text: 'I agree with the other viewers\' perspectives on this topic in this live stream.' },
              { id: '4', text: 'I see this topic in the same way as the other viewers of this live stream.' },
              { id: '5', text: 'I agree with the other viewers\' judgments on this topic in this live stream.' }
            ] }
        ]
      },
      {
        // 2. 집단 동일시
        id: 'group_identity',
        blocks: [
          { type: 'likert', id: 'groupid', required: true,
            text: 'Please rate, from 1 (Strongly disagree) to 7 (Strongly agree), how much you felt like one group with the other viewers while watching this live stream.',
            points: 7, labels: { 1: 'Strongly disagree', 7: 'Strongly agree' },
            items: [
              { id: '1', text: 'I thought I belonged to one group with the other viewers of this live stream.' },
              { id: '2', text: 'I felt that I formed a close community with the other viewers of this live stream.' },
              { id: '3', text: 'I felt a sense of "we" with the other viewers of this live stream.' },
              { id: '4', text: 'Even with our differences, I felt that I shared the same identity with the other viewers of this live stream.' },
              { id: '5', text: 'I felt a sense of unity with the other viewers of this live stream.' }
            ] }
        ]
      },
      {
        // 3. 사회적 실재감
        id: 'social_presence',
        blocks: [
          { type: 'likert', id: 'presence', required: true,
            text: 'Please rate, from 1 (Strongly disagree) to 7 (Strongly agree), how much you felt the other viewers were present while watching this live stream.',
            points: 7, labels: { 1: 'Strongly disagree', 7: 'Strongly agree' },
            items: [
              { id: '1', text: 'I clearly felt the presence of the other viewers in this live stream.' },
              { id: '2', text: 'I felt as if I were together with the other viewers of this live stream.' },
              { id: '3', text: 'I felt connected to the other viewers of this live stream.' },
              { id: '4', text: 'I felt that the other viewers of this live stream were interacting with each other.' },
              { id: '5', text: 'I felt a sense of belonging to the viewer group of this live stream.' }
            ] }
        ]
      },
      {
        // 4. 함께하는 느낌
        id: 'companionship',
        blocks: [
          { type: 'likert', id: 'company', required: true,
            text: 'Please rate, from 1 (Strongly disagree) to 7 (Strongly agree), how much you felt you were with someone while watching this live stream.',
            points: 7, labels: { 1: 'Strongly disagree', 7: 'Strongly agree' },
            items: [
              { id: '1', text: 'While watching this live stream, I felt that I was not alone.' },
              { id: '2', text: 'While watching this live stream, I felt that I had someone to be with.' },
              { id: '3', text: 'While watching this live stream, I felt less lonely.' }
            ] }
        ]
      },
      {
        // 5. 몰입
        id: 'immersion',
        blocks: [
          { type: 'likert', id: 'immerse', required: true,
            text: 'Please rate, from 1 (Strongly disagree) to 7 (Strongly agree), how immersed you were while watching this live stream.',
            points: 7, labels: { 1: 'Strongly disagree', 7: 'Strongly agree' },
            items: [
              { id: '1', text: 'I was very immersed while watching this live stream.' },
              { id: '2', text: 'I was able to concentrate without being disturbed while watching this live stream.' },
              { id: '3', text: 'I lost track of time while watching this live stream.' },
              { id: '4', text: 'I hardly noticed what was happening around me while watching this live stream.' },
              { id: '5', text: 'I briefly forgot about the things I had to do while watching this live stream.' }
            ] }
        ]
      },
      {
        // 6. 즐거움
        id: 'enjoyment',
        blocks: [
          { type: 'likert', id: 'enjoy', required: true,
            text: 'Please rate, from 1 (Strongly disagree) to 7 (Strongly agree), how much enjoyment you felt while watching this live stream.',
            points: 7, labels: { 1: 'Strongly disagree', 7: 'Strongly agree' },
            items: [
              { id: '1', text: 'Watching this live stream was enjoyable.' },
              { id: '2', text: 'I had fun watching this live stream.' },
              { id: '3', text: 'I found watching this live stream exciting.' }
            ] }
        ]
      },
      {
        // 7. 관심
        id: 'interest',
        blocks: [
          { type: 'likert', id: 'interest', required: true,
            text: 'Please rate your overall interest in this live stream from 1 (Strongly disagree) to 7 (Strongly agree).',
            points: 7, labels: { 1: 'Strongly disagree', 7: 'Strongly agree' },
            items: [
              { id: '1', text: 'I am interested in this live stream.' },
              { id: '2', text: 'I like this live stream.' },
              { id: '3', text: 'I got a good impression of this live stream.' }
            ] }
        ]
      },
      {
        // 8. 지속 시청 의도 + 9. 이유(주관식)
        id: 'continuance',
        blocks: [
          { type: 'likert', id: 'contin', required: true,
            text: 'Please rate, from 1 (Strongly disagree) to 7 (Strongly agree), how much you intend to keep watching this live stream in the future.',
            points: 7, labels: { 1: 'Strongly disagree', 7: 'Strongly agree' },
            items: [
              { id: '1', text: 'I intend to keep watching this live stream in the future.' },
              { id: '2', text: 'I will try to watch this live stream regularly in my daily life in the future.' },
              { id: '3', text: 'I plan to watch this live stream often in the future.' }
            ] },
          { type: 'textarea', id: 'contin_why', required: true,
            text: 'Please freely write why you would or would not like to keep watching this live stream in the future.' }
        ]
      },
      {
        // 조작점검
        id: 'manip',
        blocks: [
          { type: 'single', id: 'mc_author', required: true,
            text: 'Who wrote the chat messages?',
            options: [{ value: '1', label: 'Humans' }, { value: '2', label: 'AI' }] },
          { type: 'single', id: 'mc_match', required: true,
            text: 'How closely do you think the result you voted for matches the result chosen by {{viewers}}?',
            options: [
              { value: '1', label: 'Hardly matches' },
              { value: '2', label: 'About half matches' },
              { value: '3', label: 'Almost fully matches' }
            ] }
        ]
      },

      /* ── Part 2. 추가 질문 ── */
      {
        // 1. 투표 의견 확신 + 2. 의견 변화
        id: 'opinion',
        blocks: [
          { type: 'likert', id: 'vote_conf', required: true,
            text: 'How confident are you in the opinion you chose in the poll during this live stream? Please choose from 1 (Not at all confident) to 7 (Very confident).',
            points: 7, labels: { 1: 'Not at all confident', 7: 'Very confident' },
            items: [{ id: 'x', text: '' }] },
          { type: 'likert', id: 'op_change', required: true,
            text: 'Please rate, from 1 (Strongly disagree) to 7 (Strongly agree), any change in your opinion after watching this live stream.',
            points: 7, labels: { 1: 'Strongly disagree', 7: 'Strongly agree' },
            items: [
              { id: '1', text: 'My opinion was influenced by seeing the opinions of the other viewers in the chat.' },
              { id: '2', text: 'I was persuaded by what the other viewers said in the chat and accepted their opinions.' },
              { id: '3', text: 'While watching the stream, I felt that I had to agree with the other viewers\' opinions.' },
              { id: '4', text: 'I was not persuaded by the other viewers\' opinions, but I accepted them.' }
            ] }
        ]
      },
      {
        // 3. 즐겨 보는 방송 + 4. 주당 시청 일수
        id: 'viewing_habits',
        blocks: [
          { type: 'multi', id: 'genres', required: true, min: 1,
            text: 'What kinds of live streams do you enjoy watching the most? (Select all that apply)',
            options: [
              { value: '1', label: 'Games' },
              { value: '2', label: 'Daily life, talking about experiences' },
              { value: '3', label: 'Music, singing, dancing' },
              { value: '4', label: 'Creative work, art' },
              { value: '5', label: 'Eating shows (mukbang), cooking shows' },
              { value: '6', label: 'Health, exercise' },
              { value: '7', label: 'Education, knowledge' },
              { value: '8', label: 'Science, technology' },
              { value: '9', label: 'Entertainment' },
              { value: '10', label: 'Travel' },
              { value: '11', label: 'Live events' },
              { value: '12', label: 'Talk, chatting with viewers' },
              { value: '13', label: 'Current affairs, debate' },
              { value: '14', label: 'Other' }
            ] },
          { type: 'single', id: 'watch_days', required: true,
            text: 'On how many days a week do you usually watch live streams?',
            options: [
              { value: '1', label: 'Less than 1 day a week' },
              { value: '2', label: '1–3 days' },
              { value: '3', label: '4–5 days' },
              { value: '4', label: '6–7 days' }
            ] }
        ]
      },
      {
        // 5. 시청 참여 유형 + 6-1. 선호 규모 + 6-2. 이유(주관식)
        id: 'viewing_style',
        blocks: [
          { type: 'likert', id: 'style', required: true,
            text: 'Please rate your usual way of taking part in streams from 1 (Strongly disagree) to 7 (Strongly agree).',
            points: 7, labels: { 1: 'Strongly disagree', 7: 'Strongly agree' },
            items: [
              { id: '1', text: 'I like watching the content the streamer is broadcasting without being disturbed by other viewers.' },
              { id: '2', text: 'I do not like interacting with other people in live streams.' },
              { id: '3', text: 'I think what happens in the content being streamed is more interesting than interacting with other viewers.' },
              { id: '4', text: 'I think what happens in the content being streamed is more interesting than interacting with the streamer.' },
              { id: '5', text: 'I do not like it when the streamer gets distracted by other viewers.' }
            ] },
          { type: 'single', id: 'size_pref', required: true,
            text: 'What size of stream do you prefer when watching live streams?',
            options: [
              { value: '1', label: 'Streams with many viewers' },
              { value: '2', label: 'Streams with few viewers' },
              { value: '3', label: 'Doesn\'t matter' }
            ] },
          { type: 'textarea', id: 'size_why', required: true,
            text: 'Please freely write why you chose that answer in the question above.' }
        ]
      },
      {
        // 7. AI 친숙도 + 8. 생성형 AI 사용 빈도 + 9. AI 인식
        id: 'ai_attitude',
        blocks: [
          { type: 'single', id: 'ai_familiar', required: true,
            text: 'How familiar are you with using AI services?',
            options: [
              { value: '1', label: 'Very familiar' },
              { value: '2', label: 'Familiar' },
              { value: '3', label: 'Neutral' },
              { value: '4', label: 'Unfamiliar' },
              { value: '5', label: 'Very unfamiliar' }
            ] },
          { type: 'single', id: 'genai_freq', required: true,
            text: 'How often do you use generative AI such as ChatGPT, Gemini, or Copilot?',
            options: [
              { value: '1', label: 'Never' },
              { value: '2', label: 'Rarely (less than once a month)' },
              { value: '3', label: 'Fairly often (several times a month)' },
              { value: '4', label: 'Often (several times a week)' },
              { value: '5', label: 'Very often (every day)' }
            ] },
          { type: 'likert', id: 'ai_view', required: true,
            text: 'Please rate how you usually perceive AI from 1 (Strongly disagree) to 7 (Strongly agree).',
            points: 7, labels: { 1: 'Strongly disagree', 7: 'Strongly agree' },
            items: [
              { id: '1', text: 'I usually feel comfortable talking with AI.' },
              { id: '2', text: 'If AI had emotions, I think I could become friends with them.' },
              { id: '3', text: 'I usually find it comforting to be with AI that has emotions.' }
            ] }
        ]
      },

      /* ── Part 3. 기본 정보 ── */
      {
        id: 'demo',
        title: 'About you',
        blocks: [
          { type: 'single', id: 'gender', required: true, text: 'What is your gender?',
            options: [{ value: '1', label: 'Male' }, { value: '2', label: 'Female' }] },
          { type: 'number', id: 'birth_year', required: true, min: 1920, max: 2008,
            text: 'What is your year of birth?' },
          { type: 'single', id: 'education', required: true,
            text: 'What is your highest level of education?',
            options: [
              { value: '1', label: 'High school graduate or less' },
              { value: '2', label: 'Currently in college/university (including leave of absence)' },
              { value: '3', label: 'College/university graduate' },
              { value: '4', label: 'Currently in graduate school or higher' }
            ] },
          { type: 'single', id: 'job', required: true,
            text: 'What is your occupation?',
            options: [
              { value: '1', label: 'Full-time homemaker' },
              { value: '2', label: 'Student' },
              { value: '3', label: 'Professional (doctor, lawyer, pharmacist, etc.)' },
              { value: '4', label: 'IT industry' },
              { value: '5', label: 'Culture/arts (designer, music, etc.)' },
              { value: '6', label: 'Research' },
              { value: '7', label: 'Education' },
              { value: '8', label: 'Office/technical' },
              { value: '9', label: 'Sales/service' },
              { value: '10', label: 'Skilled/manual/simple labor' },
              { value: '11', label: 'Job seeker' },
              { value: '12', label: 'Unemployed' },
              { value: '13', label: 'Other' }
            ] },
          { type: 'single', id: 'income', required: true,
            text: 'What is your average monthly income?',
            options: [
              { value: '1', label: 'Less than 2 million KRW' },
              { value: '2', label: '2 million KRW range' },
              { value: '3', label: '3 million KRW range' },
              { value: '4', label: '4 million KRW range' },
              { value: '5', label: '5 million KRW range' },
              { value: '6', label: '6 million KRW range' },
              { value: '7', label: '7–9.99 million KRW' },
              { value: '8', label: '10 million KRW or more' }
            ] }
        ]
      }
    ]
  },

  /* ── 9. 화면 공통 문구 ─────────────────────────────────────── */
  TEXT: {
    next: 'Next',
    finish: 'Finish',
    studyName: 'Research Study',               // 상단 바 왼쪽 이름
    parts: {                                    // 상단 바 오른쪽 단계 이름
      consent: 'Part 1 of 4 · Consent', pre: 'Part 1 of 4 · About you', stream: 'Part 2 of 4 · Live stream',
      post: 'Part 3 of 4 · After the stream', debrief: 'Part 4 of 4 · About this study', done: 'Complete'
    },
    questionFmt: n => `Question ${n}`,
    optional: 'Optional',
    noBack: "You can't go back after pressing Next.",
    introLoading: 'Loading…',                  // 방송 전 안내에서 입장 버튼이 켜지기 전 로딩 표시. 화면엔 안 보이고 화면 읽기 프로그램용 (남은 시간도 안 보여 줌)
    errorSumFmt: n => n === 1 ? '1 question needs an answer' : `${n} questions need an answer`,
    msg: {                                      // 문항별 오류 문구
      single: 'Please choose one answer.',
      multiFmt: n => n > 1 ? `Please choose at least ${n}.` : 'Please choose at least one.',
      likert: 'Please answer every statement.',
      scale: 'Please choose a number.',
      number: 'Please enter a number.',
      rangeFmt: (a, b) => `Enter a number from ${a} to ${b}.`,
      text: 'Please write an answer.',
      minCharsFmt: n => `Please write at least ${n} characters.`
    },
    waitFmt: s => `You can continue in ${s} s`,
    required: 'Please answer all questions on this page.',
    saving: 'Saving…',
    idTitle: 'Enter your ID',
    idBody: 'We could not find your CloudResearch ID. Please enter it below.',
    idInvalid: 'Please enter a valid ID (letters, numbers, - or _).',
    mobileBlocked: 'This study must be completed on a computer (desktop or laptop). Please return the study.',
    screenedMsg: 'Thank you. Unfortunately you are not eligible for this study. You may now close this window.',
    attentionMsg: 'Thank you. Unfortunately, your responses did not meet the study\'s quality requirements.',
    fullMsg: 'This study is now full. Thank you for your interest.',
    returnStream: 'It looks like you have not finished the stream yet. Click below to go back to it.',
    returnStreamBtn: 'Return to the stream',
    stimFinishing: 'Saving your responses. Please wait…',
    stimFallback: 'Continue to the survey',     // 자극물 종료를 감지하지 못하는 환경에서만 나타남
    lostTitle: 'Session not found',
    lostMsg: 'We could not find your session. Please contact the researcher with your ID.',
    alreadyDone: 'You have already completed this study. Thank you!',
    doneTitle: 'Thank you!',
    doneRedirect: 'Your responses have been saved. Redirecting you to CloudResearch…',
    doneSaved: 'Your responses have been saved. You may now close this window.',
    doneCodeLead: 'Your responses have been saved. Enter this completion code on CloudResearch.',
    copy: 'Copy', copied: 'Copied.', copyManual: 'Press Ctrl+C (Cmd+C on Mac) to copy the selected code.',
    endTitles: { screened: 'Thank you', attention: 'Thank you', full: 'Study full', mobile: 'Computer required' },
    redirectLink: 'Click here if you are not redirected automatically.',
    errorSave: 'Connection problem while saving. Retrying…'
  }
};
