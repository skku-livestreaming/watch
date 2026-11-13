/* ═══════════════════════════════════════════════════════════════
   설문 설정 파일 — 문항이 바뀌면 이 파일만 고치면 됩니다.
   참가자에게 보이는 글은 영어, 주석은 한국어입니다.
   ═══════════════════════════════════════════════════════════════ */
window.SURVEY_CONFIG = {

  /* ── 1. 기본 설정 ─────────────────────────────────────────── */
  STUDY_ID: 'livestream-ai-chat-2026',     // 바꾸면 브라우저에 저장된 진행 상태가 초기화됩니다

  // Apps Script 웹 앱 주소(…/exec). 비워 두면 저장 없이 화면만 점검하는 모드로 돌아갑니다.
  API_URL: '',

  // 자극물 주소. 끝에 ?c=셀코드&panel_id=참가자ID 가 자동으로 붙습니다.
  // 어디에 올려도(skku, 개인 깃허브, PC 파일) 같은 방송을 띄웁니다.
  // 주소를 바꾸면 index.html 맨 위 frame-src 줄의 주소도 같이 바꿀 것
  STIMULUS_URL: 'https://skku-livestreaming.github.io/watch/',
  // 자극물에 추가로 넘길 값. 예: 자극물 자체 안내 화면을 끄려면 { intro: 'off' }
  STIMULUS_EXTRA: {},

  /* 자극물을 설문 페이지 안에 띄우는 방식(true).
     참가자가 [Finish participation]을 누르면 설문이 감지해 사후 문항으로 넘어갑니다.
     자극물 파일은 수정하지 않으며, 설문과 자극물이 같은 사이트(skku-livestreaming.github.io)에 있어야 동작합니다.
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
  CELL_QUOTA: 0,               // 셀당 최대 인원 (0 = 제한 없음). 다 차면 "모집 마감" 화면
  IN_PROGRESS_MINUTES: 60,     // 배정 후 이 시간 안에 돌아오지 않으면 자리를 다른 사람에게 넘깁니다

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
        sub: 'Every chat message is written by AI, not by people.',
        aiRows: [1, 1, 1, 1]          // 미리보기 채팅 줄마다 AI 배지 여부
      },
      human: {
        headline: 'The other viewers in this stream are <span class="hl">people</span> watching at the same time as you.',
        sub: 'Every chat message is written by a person.',
        aiRows: [0, 0, 0, 0]
      },
      mixed: {
        headline: '<span class="hl">Half</span> of the viewers in this stream are <span class="hl">AI</span>, and <span class="hl">half</span> are <span class="hl">people</span>.',
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
     ※ 아래 문항은 형식 예시입니다. 실제 문항으로 교체하세요.

     페이지: { id, title?, blocks:[…], showIf?: ctx => bool, minSeconds? }
     블록 type
       html      : 안내문           { html }
       single    : 하나 선택         { id, text, options, required?, randomize?, horizontal?, screen?, attention? }
       multi     : 여러 개 선택      { id, text, options, min?, max? }
       likert    : 척도 묶음         { id, text, items:[{id,text}], points, labels:{1:'..',7:'..'}, randomize? }
       textarea  : 주관식           { id, text, minChars? }
       number    : 숫자             { id, text, min?, max? }
       select    : 드롭다운          { id, text, options }
     options: ['문구', …] 또는 [{value:'코드', label:'문구', other:true(기타 입력칸)}]
     screen   : { allowed:['값', …] }  → 그 외를 고르면 선정 기준 탈락으로 종료
     attention: { correct:'값' }       → 틀리면 ATTENTION 규칙 적용
     showIf   : ctx => 조건. ctx.group('ai'|'human'|'mixed'), ctx.cong, ctx.answers 사용 가능
     저장되는 열 이름: single/number/textarea = id, likert = id_항목id, multi = id_값(1/0) */
  PAGES: {
    pre: [
      {
        id: 'screen',
        blocks: [
          { type: 'single', id: 'scr_live3m', required: true,
            text: 'Have you watched a live stream (e.g., Twitch, YouTube Live) in the past 3 months?',
            options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }],
            screen: { allowed: ['yes'] } }
        ]
      },
      {
        id: 'pre_traits',
        title: 'About you',
        blocks: [
          { type: 'likert', id: 'conf_tend', required: true, randomize: true,
            text: 'EXAMPLE — How much do you agree with each statement?',
            points: 7, labels: { 1: 'Strongly disagree', 7: 'Strongly agree' },
            items: [
              { id: '1', text: 'Example item 1' },
              { id: '2', text: 'Example item 2' },
              { id: 'att', text: 'To show you are reading carefully, please select "2" for this statement.',
                attention: { correct: '2' } },
              { id: '3', text: 'Example item 3' }
            ] }
        ]
      }
    ],

    post: [
      {
        // 종속변수(T2)는 반드시 사후 설문 맨 앞
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
      {
        id: 'influence',
        blocks: [
          { type: 'likert', id: 'infl', required: true, randomize: true,
            text: 'EXAMPLE — Informational / normative influence',
            points: 7, labels: { 1: 'Strongly disagree', 7: 'Strongly agree' },
            items: [
              { id: 'inf1', text: 'Example informational item' },
              { id: 'nor1', text: 'Example normative item' }
            ] }
        ]
      },
      {
        id: 'trust_ai',
        showIf: ctx => ctx.group !== 'human',   // AI가 있는 조건에만
        blocks: [
          { type: 'likert', id: 'trust', required: true,
            text: 'EXAMPLE — Trust in the AI viewers (shown only in AI conditions)',
            points: 7, labels: { 1: 'Strongly disagree', 7: 'Strongly agree' },
            items: [{ id: '1', text: 'Example item' }] }
        ]
      },
      {
        id: 'manip',
        blocks: [
          { type: 'single', id: 'mc_author', required: true,
            text: 'EXAMPLE — Who wrote the chat messages in the stream?',
            options: [
              { value: 'human', label: 'People' },
              { value: 'ai', label: 'AI' },
              { value: 'mixed', label: 'Both people and AI' },
              { value: 'unsure', label: 'Not sure' }
            ] },
          { type: 'number', id: 'mc_pct', required: true, min: 0, max: 100,
            text: 'EXAMPLE — What percentage of viewers chose the same answer as you? (0–100)' },
          { type: 'textarea', id: 'suspicion', minChars: 0,
            text: 'EXAMPLE — Did anything about the stream seem unusual to you? Please describe.' }
        ]
      },
      {
        id: 'demo',
        title: 'About you',
        blocks: [
          { type: 'single', id: 'gender', required: true, text: 'What is your gender?',
            options: ['Man', 'Woman', 'Non-binary', { value: 'other', label: 'Prefer to self-describe', other: true }, 'Prefer not to say'] },
          { type: 'number', id: 'birth_year', required: true, min: 1920, max: 2008,
            text: 'In what year were you born?' },
          { type: 'multi', id: 'genres', required: true, min: 1,
            text: 'EXAMPLE — Which types of live streams do you watch? (Select all that apply)',
            options: ['Gaming', 'Just chatting', 'Music', 'News / politics',
                      { value: 'other', label: 'Other', other: true }] }
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
    appearsFmt: s => `Appears in ${s} s`,
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
