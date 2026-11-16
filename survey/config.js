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
        sub: 'Every chat message is written by AI, not by people. Messages written by AI are marked with an <span class="aib">AI</span> label.',
        aiRows: [1, 1, 1, 1]          // 미리보기 채팅 줄마다 AI 배지 여부
      },
      human: {
        headline: 'The other viewers in this stream are <span class="hl">people</span> watching at the same time as you.',
        sub: 'Every chat message is written by a person.',
        aiRows: [0, 0, 0, 0]
      },
      mixed: {
        // 비율(반반)은 말하지 않고, AI와 사람이 함께 있는 공간이라고만 안내
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
     ※ 「라이브스트리밍_설문문항_근거」 엑셀의 합본_1113 시트 기준. 문구는 'Revised (우리 설문에 사용)' 열 그대로.
       쪽 나눔: 시트의 1~5번page는 그대로, 그 뒤는 시트의 표 구분(종속변수 / 조작점검 / 조절변수 / 통제변수 / 인구통계)대로 한 쪽씩.

     페이지: { id, title?, blocks:[…], showIf?: ctx => bool, minSeconds? }
     블록 type
       html      : 안내문           { html }
       single    : 하나 선택         { id, text, options, required?, randomize?, horizontal?, screen?, attention? }
       multi     : 여러 개 선택      { id, text, options, min?, max? }
       likert    : 척도 묶음         { id, text, items:[{id,text,attention?}], points, labels:{1:'..',7:'..'}, randomize?, rawKeys? }
       textarea  : 주관식           { id, text, minChars? }
       number    : 숫자 (키보드로만 입력, 숫자 외 글자는 자동으로 지움)  { id, text, min?, max? }
       select    : 드롭다운          { id, text, options }
     options: ['문구', …] 또는 [{value:'코드', label:'문구', other:true(기타 입력칸)}]
     screen   : { allowed:['값', …] }  → 그 외를 고르면 선정 기준 탈락으로 종료
     attention: { correct:'값' }       → 틀리면 ATTENTION 규칙 적용 (likert는 항목에 붙임)
     dependsOn: '같은 쪽 single 문항 id' + textByAnswer: { 값: '질문' }
                → 그 문항에 답하기 전엔 숨기고, 고른 답에 맞는 질문으로 바꿔 보여 줌 (3번 쪽 주관식)
     splash   : 문항 없는 단계 안내 화면 { steps, current, kicker, title, body, pagesFmt, button } (main_start 참고)
     showIf   : ctx => 조건. ctx.group('ai'|'human'|'mixed'), ctx.cong, ctx.answers 사용 가능
     저장되는 열 이름: single/number/textarea = id, likert = id_항목id (rawKeys: true면 항목id 그대로), multi = id_값(1/0) */
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

      /* ── 1번page. 종속변수: Opinion confidence ── */
      {
        id: 'p1_confidence',
        blocks: [
          { type: 'likert', id: 'op_conf', required: true,
            text: `Think back to your vote during the live stream. How confident are you now in the choice you made on the question “Do violent video games contribute to youth violence?”`,
            points: 7, labels: { 1: 'Not at all confident', 7: 'Extremely confident' },
            items: [{ id: 'x', text: '' }] }
        ]
      },

      /* ── 2번page. 종속변수: Opinion change (re-vote) ── */
      {
        id: 'p2_revote',
        blocks: [
          { type: 'single', id: 't2_vote', required: true,
            text: `If you could go back and vote in the poll again, what would you choose now? Please vote again.<br><i>“Do violent video games contribute to youth violence?”</i>`,
            options: 'TOPIC' }     // 'TOPIC' = 자극물 투표와 같은 A/B 코드 (A = Yes, B = No) → t1_vote와 바로 비교
        ]
      },

      /* ── 3번page. 종속변수: Opinion change (self-report) + 이유(주관식) ── */
      {
        id: 'p3_change',
        blocks: [
          { type: 'single', id: 'op_changed', required: true,
            text: 'Is your choice now different from the one you made during the live stream, or is it the same?',
            options: [
              { value: '1', label: 'My choice is different from before.' },
              { value: '2', label: 'My choice is the same as before.' }
            ] },
          { type: 'textarea', id: 'op_why', required: true, dependsOn: 'op_changed',
            textByAnswer: {
              '1': 'Why did your choice change? Please explain in detail.',
              '2': 'Why did your choice stay the same? Please explain in detail.'
            } }
        ]
      },

      /* ── 4번page. 매개변수: Social presence · Mind perception · Shared social identity · Group entitativity
            (+ 주의집중 점검) / Shared reality ── */
      {
        id: 'p4_viewers',
        blocks: [
          { type: 'likert', id: 'p4', rawKeys: true, required: true,
            text: 'Think about your experience of watching the live stream with other viewers.<br>Please indicate how much you agree with each statement on a scale from 1 to 7 (1 = Strongly disagree, 7 = Strongly agree).',
            points: 7, labels: { 1: 'Strongly disagree', 7: 'Strongly agree' },
            items: [
              { id: 'sp_1', text: 'I felt as if the other viewers were there with me.' },
              { id: 'sp_2', text: 'While watching the live stream, I was constantly aware of the other viewers.' },
              { id: 'sp_3', text: 'I felt as if the other viewers had real emotions.' },
              { id: 'mind_1', text: 'It seemed to me that the other viewers were capable of thinking.' },
              { id: 'mind_2', text: 'It seemed to me that the other viewers were capable of conveying their thoughts and feelings to others.' },
              { id: 'mind_3', text: 'It seemed to me that the other viewers were capable of understanding how others feel.' },
              { id: 'mind_4', text: 'It seemed to me that the other viewers were capable of telling right from wrong and trying to do what is right.' },
              { id: 'sid_1', text: 'The other viewers seemed to share a sense of “we-ness” with me.' },
              { id: 'sid_2', text: 'The other viewers seemed to share the same identity as me, despite our differences.' },
              { id: 'sid_3', text: 'The other viewers seemed to feel a sense of unity with me.' },
              { id: 'ent_1', text: 'The other viewers seemed like a community.' },
              { id: 'ent_2', text: 'The other viewers seemed like a single unit.' },
              { id: 'ent_3', text: 'The other viewers felt like a group.' },
              { id: 'att_1', text: 'If you are reading carefully, please select 6 for this statement.', attention: { correct: '6' } }
            ] },
          { type: 'likert', id: 'sr', rawKeys: true, required: true,
            text: 'Think about your views on the issue raised in the poll, and those of the other viewers, while you were watching the live stream.<br>Please indicate how much you agree with each statement on a scale from 1 to 7 (1 = Strongly disagree, 7 = Strongly agree).',
            points: 7, labels: { 1: 'Strongly disagree', 7: 'Strongly agree' },
            items: [
              { id: 'sr_1', text: 'I thought that the other reviewers and I were on the same wavelength with regard to video games.' },
              { id: 'sr_2', text: 'I felt the same way about video games as the other reviewers did.' },
              { id: 'sr_3', text: 'I agreed with the other reviewers\' point of view of video games.' },
              { id: 'sr_4', text: 'The other reviewers and I saw video games in the same way.' },
              { id: 'sr_5', text: 'I agreed with the other reviewers\' perception of video games.' }
            ] }
        ]
      },

      /* ── 5번page. 매개변수: Perceived public opinion / Informational · Normative influence /
            Perceived manipulation · Threat to freedom · Message credibility ── */
      {
        id: 'p5_comments',
        blocks: [
          { type: 'likert', id: 'pub_op', required: true,
            text: 'How much do you think the general public agrees with the statement “Violent video games contribute to youth violence”?',
            points: 7, labels: { 1: 'The general public strongly disagrees', 7: 'The general public strongly agrees' },
            items: [{ id: 'x', text: '' }] },
          { type: 'likert', id: 'infl', rawKeys: true, required: true,
            text: 'Think about how you felt about the comments other viewers posted in the live stream you just watched.<br>Please indicate how much you agree with each statement on a scale from 1 to 7 (1 = Strongly disagree, 7 = Strongly agree).',
            points: 7, labels: { 1: 'Strongly disagree', 7: 'Strongly agree' },
            items: [
              { id: 'inf_1', text: 'My opinion was influenced by the comments.' },
              { id: 'inf_2', text: 'I was persuaded by the comments and accepted the opinion they expressed.' },
              { id: 'nor_1', text: 'I felt like I had to agree with the opinions in the comments.' },
              { id: 'nor_2', text: 'I was not persuaded by the comments, but I still accepted the opinions they expressed.' }
            ] },
          { type: 'likert', id: 'cmt', rawKeys: true, required: true,
            text: 'Think about the comments other viewers posted in the live stream you just watched about the issue raised in the poll.<br>Please indicate how much you agree with each statement on a scale from 1 to 7 (1 = Strongly disagree, 7 = Strongly agree).',
            points: 7, labels: { 1: 'Strongly disagree', 7: 'Strongly agree' },
            items: [
              { id: 'manip_1', text: 'The comments felt manipulative.' },
              { id: 'manip_2', text: 'The comments seemed to be trying to influence viewers\' judgments in ways I didn\'t like.' },
              { id: 'manip_3', text: 'The comments seemed to be trying to inappropriately control viewers\' judgments.' },
              { id: 'manip_4', text: 'The comments seemed intentionally designed to influence viewers\' judgments without their awareness.' },
              { id: 'thr_1', text: 'The comments seemed to threaten my freedom to form my own opinion.' },
              { id: 'thr_2', text: 'The comments seemed to be trying to make the decision for me.' },
              { id: 'thr_3', text: 'The comments seemed to be trying to manipulate me.' },
              { id: 'thr_4', text: 'The comments seemed to be pressuring me to hold a particular opinion.' },
              { id: 'cred_1', text: 'Overall, the comments were accurate.' },
              { id: 'cred_2', text: 'Overall, the comments were authentic.' },
              { id: 'cred_3', text: 'Overall, the comments were believable.' }
            ] }
        ]
      },

      /* ── 종속변수: Enjoyment / Live-streaming interest / Platform future use intention ── */
      {
        id: 'p6_platform',
        blocks: [
          { type: 'likert', id: 'enjoy', rawKeys: true, required: true,
            text: 'Think about your experience participating in the live stream you just watched.<br>Please indicate how much you agree with each statement on a scale from 1 to 7 (1 = Strongly disagree, 7 = Strongly agree).',
            points: 7, labels: { 1: 'Strongly disagree', 7: 'Strongly agree' },
            items: [
              { id: 'enj_1', text: 'I enjoyed participating in the live stream.' },
              { id: 'enj_2', text: 'I had fun participating in the live stream.' },
              { id: 'enj_3', text: 'I found participating in the live stream exciting.' }
            ] },
          { type: 'likert', id: 'interest', rawKeys: true, required: true,
            text: 'Think about how viewers can participate in live streams on the platform you just used.<br>Please indicate how much you agree with each statement on a scale from 1 to 7 (1 = Strongly disagree, 7 = Strongly agree).',
            points: 7, labels: { 1: 'Strongly disagree', 7: 'Strongly agree' },
            items: [
              { id: 'int_1', text: 'I am interested in the way of participating in live streams on this platform.' },
              { id: 'int_2', text: 'I like the way of participating in live streams on this platform.' },
              { id: 'int_3', text: 'The way of participating in live streams on this platform gives me a positive impression.' }
            ] },
          { type: 'likert', id: 'future', rawKeys: true, required: true,
            text: 'Imagine that the platform on which you just watched the live stream were actually available to you.<br>Please indicate how much you agree with each statement on a scale from 1 to 7 (1 = Strongly disagree, 7 = Strongly agree).',
            points: 7, labels: { 1: 'Strongly disagree', 7: 'Strongly agree' },
            items: [
              { id: 'fut_1', text: 'I would use this platform in the future.' },
              { id: 'fut_2', text: 'I would choose this platform over other platforms.' },
              { id: 'fut_3r', text: 'If possible, I would avoid using this platform in the future.' }   // 역문항
            ] }
        ]
      },

      /* ── 조작점검 ── */
      {
        id: 'p7_manip',
        blocks: [
          { type: 'single', id: 'mc_match', required: true,
            text: 'How closely do you think the other viewers\' opinions matched your vote during the live stream?',
            options: [
              { value: '1', label: 'Almost all other viewers voted the same way as I did.' },
              { value: '2', label: 'About half of the other viewers voted the same way as I did.' },
              { value: '3', label: 'Almost all other viewers voted differently from me.' }
            ] },
          { type: 'single', id: 'mc_comp', required: true,
            text: 'Who were the viewers of the live stream you just watched?',
            options: [
              { value: '1', label: 'Only AI viewers' },
              { value: '2', label: 'Both human and AI viewers' },
              { value: '3', label: 'Only human viewers' }
            ] }
        ]
      },

      /* ── 조절변수: Bandwagon heuristic · Personal issue importance · Subjective knowledge · Conformity tendency · Trust in AI ── */
      {
        id: 'p8_traits',
        blocks: [
          { type: 'likert', id: 'bandwagon', rawKeys: true, required: true,
            text: 'Think about your general beliefs about the opinions and judgments of groups of people.<br>Please indicate how much you agree with each statement on a scale from 1 to 7 (1 = Strongly disagree, 7 = Strongly agree).',
            points: 7, labels: { 1: 'Strongly disagree', 7: 'Strongly agree' },
            items: [
              { id: 'bw_1', text: 'Large groups of people are good at telling which opinions are right, so it is reasonable to trust their judgment.' },
              { id: 'bw_2', text: 'An opinion that many people believe is right is likely to actually be right.' }
            ] },
          { type: 'likert', id: 'importance', rawKeys: true, required: true,
            text: 'The following statements are about the issue of whether violent video games contribute to youth violence.<br>Please indicate how much you agree with each statement on a scale from 1 to 7 (1 = Strongly disagree, 7 = Strongly agree).',
            points: 7, labels: { 1: 'Strongly disagree', 7: 'Strongly agree' },
            items: [
              { id: 'imp_1', text: 'This issue is personally important to me.' },
              { id: 'imp_2', text: 'I care a great deal about this issue.' }
            ] },
          { type: 'likert', id: 'knowledge', rawKeys: true, required: true,
            text: 'The following statements are about your knowledge of whether violent video games contribute to youth violence.<br>Please indicate how much you agree with each statement on a scale from 1 to 7 (1 = Strongly disagree, 7 = Strongly agree).',
            points: 7, labels: { 1: 'Strongly disagree', 7: 'Strongly agree' },
            items: [
              { id: 'know_1', text: 'I know quite a lot about this issue.' },
              { id: 'know_2', text: 'Among my friends, I am one of the “experts” on this issue.' }
            ] },
          { type: 'likert', id: 'conformity', rawKeys: true, required: true,
            text: 'Think about how you actually are in most situations.<br>Please indicate how much you agree with each statement on a scale from 1 to 7 (1 = Strongly disagree, 7 = Strongly agree).',
            points: 7, labels: { 1: 'Strongly disagree', 7: 'Strongly agree' },
            items: [
              { id: 'conf_1', text: 'I often rely on others\' advice and follow it.' },
              { id: 'conf_2', text: 'If someone is persuasive, I tend to change my opinion and go along with them.' }
            ] },
          { type: 'likert', id: 'trust_ai', rawKeys: true, required: true,
            text: 'Think about how much you generally trust AI.<br>Please indicate how much you agree with each statement on a scale from 1 to 7 (1 = Strongly disagree, 7 = Strongly agree).',
            points: 7, labels: { 1: 'Strongly disagree', 7: 'Strongly agree' },
            items: [
              { id: 'tai_1', text: 'AI is reliable.' },
              { id: 'tai_2', text: 'AI is dependable.' }
            ] }
        ]
      },

      /* ── 통제변수 ── */
      {
        id: 'p9_controls',
        blocks: [
          { type: 'multi', id: 'genres', required: true, min: 1,
            text: 'What kinds of live streams do you enjoy watching the most? (Choose all that apply)',
            options: [
              { value: '1', label: 'Gaming' },
              { value: '2', label: 'In real life (daily life and personal stories)' },
              { value: '3', label: 'Music, singing, dancing' },
              { value: '4', label: 'Creative (art, crafts)' },
              { value: '5', label: 'Food (mukbang, cooking)' },
              { value: '6', label: 'Health and fitness' },
              { value: '7', label: 'Education and knowledge' },
              { value: '8', label: 'Science and technology' },
              { value: '9', label: 'Variety shows' },
              { value: '10', label: 'Traveling' },
              { value: '11', label: 'Live events' },
              { value: '12', label: 'Talk and chatting with viewers' },
              { value: '13', label: 'Current affairs and debate' },
              { value: '14', label: 'Other' }
            ] },
          { type: 'single', id: 'watch_days', required: true,
            text: 'On how many days of the week do you usually watch live streams?',
            options: [
              { value: '1', label: 'Less than 1 day per week' },
              { value: '2', label: '1–3 days' },
              { value: '3', label: '4–5 days' },
              { value: '4', label: '6–7 days' }
            ] },
          { type: 'likert', id: 'ai_familiar', required: true,
            text: 'How familiar are you with AI services?',
            points: 7, labels: { 1: 'Not at all familiar', 7: 'Very familiar' },
            items: [{ id: 'x', text: '' }] },
          { type: 'single', id: 'genai_freq', required: true,
            text: 'How often do you use generative AI, such as ChatGPT, Gemini, or Copilot?',
            options: [
              { value: '1', label: 'Never' },
              { value: '2', label: 'Less than once a month' },
              { value: '3', label: '1–3 times a month' },
              { value: '4', label: 'About once a week' },
              { value: '5', label: 'Several times a week' },
              { value: '6', label: 'Daily' }
            ] },
          { type: 'multi', id: 'genai_purpose', required: true, min: 1,
            text: 'For what purposes do you use generative AI, such as ChatGPT, Gemini, or Copilot? (Select all that apply.)',
            options: [
              { value: '1', label: 'Searching for information' },
              { value: '2', label: 'Work-related tasks' },
              { value: '3', label: 'Studying or learning' },
              { value: '4', label: 'Writing or editing text' },
              { value: '5', label: 'Creating images, videos, or other content' },
              { value: '6', label: 'Coding or programming' },
              { value: '7', label: 'Entertainment or casual conversation' },
              { value: '8', label: 'Personal advice or emotional support' },
              { value: '9', label: 'Other (please specify)', other: true },
              { value: '10', label: 'I do not use generative AI' }
            ] },
          { type: 'likert', id: 'game_freq', required: true,
            text: 'How often do you play video games?',
            points: 7, labels: { 1: 'Never', 7: 'Always' },
            items: [{ id: 'x', text: '' }] },
          { type: 'likert', id: 'violent_familiar', required: true,
            text: 'How familiar are you with violent video games?',
            points: 7, labels: { 1: 'Not at all familiar', 7: 'Very familiar' },
            items: [{ id: 'x', text: '' }] }
        ]
      },

      /* ── 인구통계 ── */
      {
        id: 'demo',
        title: 'About you',
        blocks: [
          { type: 'number', id: 'birth_year', required: true, min: 1920, max: 2008,
            text: 'What is your year of birth?' },
          { type: 'single', id: 'gender', required: true, text: 'What is your gender?',
            options: [
              { value: '1', label: 'Male' },
              { value: '2', label: 'Female' },
              { value: '3', label: 'Non-binary' },
              { value: '4', label: 'Prefer to self-describe', other: true },
              { value: '5', label: 'Prefer not to say' }
            ] },
          { type: 'single', id: 'education', required: true,
            text: 'What is the highest level of education you have completed?',
            options: [
              { value: '1', label: 'Less than high school' },
              { value: '2', label: 'High school graduate' },
              { value: '3', label: 'Some college' },
              { value: '4', label: 'College graduate (4-year degree)' },
              { value: '5', label: 'Master\'s degree' },
              { value: '6', label: 'Doctoral or professional degree' },
              { value: '7', label: 'Prefer not to say' }
            ] },
          { type: 'single', id: 'employment', required: true,
            text: 'What is your current employment status?',
            options: [
              { value: '1', label: 'Employed full-time' },
              { value: '2', label: 'Employed part-time' },
              { value: '3', label: 'Unemployed, looking for work' },
              { value: '4', label: 'Unemployed, not looking for work' },
              { value: '5', label: 'Retired' },
              { value: '6', label: 'Student' },
              { value: '7', label: 'Homemaker' },
              { value: '8', label: 'Prefer not to say' },
              { value: '9', label: 'Other' }
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
