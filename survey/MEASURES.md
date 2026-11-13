# 행동 지표 정의와 설문 연결

2026-11-14 측정 보완. 자극물 버전은 `2026-11-behavior-visible-exposure-v1`, 종료 요약의 `behavior_version`은 `2026-11-14-v1`이다. 이전 버전의 백업을 새로운 측정 정의로 덮어쓰지 않는다.

## 측정 원칙

설문은 공유현실감, 집단 동일시, 사회적 실재감, 동반감, 몰입, 즐거움, 관심, 지속 시청 의도를 측정한다. 웹 행동은 노출과 선택의 보조 자료다. 화면 노출을 읽기·시선·이해·동일시로, 클릭을 장기적 지속 시청으로 해석하지 않는다.

기존 이벤트와 종료 요약에 정보를 추가한다. 마우스 이동·모든 키 입력을 수집하거나, 메시지별 네트워크 요청을 추가하지 않는다. 원본은 Supabase `events.data`, 시트는 세션별 `behavior` 요약에 저장한다. 설문은 `responses.stim_session_id = behavior.session_id`로 연결한다.

## 화면 상태와 시간

| 필드 | 단위·정의 |
|---|---|
| `dwell_sec` | 기존 영상 시계 기준 진행 시간. 화면이 보였다는 뜻은 아님 |
| `chat_exposure_sec` | 기존 댓글 재개 뒤 영상 시계의 경과 시간. 개인별 주의 지표로 사용하지 않음 |
| `visible_watch_sec` | 시청 입장 후, 문서가 visible이며 영상이 재생 중인 실제 경과 시간. 버퍼링·일시정지·탐색·방송 종료 뒤 구간 제외 |
| `hidden_playback_sec` | 문서가 hidden이지만 영상이 재생 중인 실제 경과 시간. 숨겨진 동안 영상도 멈췄다면 증가하지 않음 |
| `visible_postpoll_sec` | 댓글이 재개된 뒤 열린 상태에서, 문서가 visible이고 영상이 재생 중인 실제 경과 시간. 댓글 한 줄의 노출이 아닌 노출 기회 시간 |
| `after_end_sec` | 기존 방송 종료 후 실제 경과 시간. hidden 구간 포함 |
| `visible_after_end_sec` | 방송 종료 후 문서가 visible인 실제 경과 시간. 재생 여부와 무관하며, 종료 전에는 null |

시간은 `performance.now()`로 누적하고 playing, waiting, pause, seeking/seeked, visibilitychange, 댓글 잠금·재개, 방송 종료, 참여 종료에서 갱신한다. 종료 후 추가 시간이 적립되지 않는다. 문서의 visible 상태가 다른 창에 가리지 않았거나 실제로 보고 있었다는 의미는 아니다. `visible_watch_sec`는 영상 시계 진행 시간이 아니라 재생 상태의 실제 경과 시간이므로 미리보기 배속에서 `dwell_sec`와 같지 않다.

## AI·사람 × 의견 일치 여부의 화면 노출

댓글 창 또는 영상 위 댓글에서 한 줄 면적의 60% 이상이 노출되는 구간을 측정한다. 두 위치에 동시에 보이는 시간은 합집합으로 한 번만 적립한다. hidden 구간은 제외하며, hidden 중 도착한 메시지도 시계를 시작하지 않는다.

`lines_seen`은 **누적 1,000ms 이상 화면에 노출된 줄 수**다. 연속 1초, 읽기 완료, 이해 여부를 뜻하지 않는다. 여러 번의 짧은 노출도 누적된다. 설정은 `threshold_ratio=0.6`, `threshold_ms=1000`으로 원본 종료 요약에 남긴다.

| 작성자·입장 | 시트의 댓글 수 | 시트의 누적 노출 시간 — ms |
|---|---|---|
| AI·일치 | `seen_ai_congruent` | `visible_ms_ai_congruent` |
| AI·불일치 | `seen_ai_incongruent` | `visible_ms_ai_incongruent` |
| 사람·일치 | `seen_human_congruent` | `visible_ms_human_congruent` |
| 사람·불일치 | `seen_human_incongruent` | `visible_ms_human_incongruent` |

원본 종료 요약에서는 `seen_by_identity.ai`와 `.human` 아래의 `congruent`, `incongruent`, `congruent_ms`, `incongruent_ms`로 저장한다. 시간 합계는 누적 1초 기준을 충족한 의견 줄의 전체 누적 노출 시간이다. 동시에 여러 줄이 보이므로 각 줄의 시간 합은 사람 한 명의 체류 시간보다 클 수 있다.

일치·불일치는 해당 투표에 제출된 T1 선택과 비교한다. T1 미제출이면 분류 결과를 null로 남기며, 모두 불일치로 처리하지 않는다. AI만 있는 조건에서 사람 의견이 없는 경우처럼 측정 가능한 구조적 0과 측정 불가를 구분한다. `IntersectionObserver` 미지원이면 `seen_supported=false`이고 노출 측정값은 null이다. 지원 환경의 `seen_supported=true`도 측정의 완전성이나 시선 타당화를 보증하지는 않는다.

기존 `shown_*`, 시트의 `ai_opinions`·`human_opinions`는 피드에 올린 의견 수다. `seen_*`과 구분한다. `lines_*`는 의견 외의 일반 줄도 포함하므로 `shown_congruent + shown_incongruent`와 직접 빼거나 나누지 않는다.

## 종료 후 추가 콘텐츠 선택

| 필드 | 정의 |
|---|---|
| `next_video_selected` | 방송 종료 후 추천 영상을 한 번이라도 선택했는지. 종료 전은 null, 종료했으나 선택하지 않았다면 false |
| `first_next_video_index` | 처음 선택한 추천 영상의 0부터 시작하는 인덱스. 첫 번째 영상의 0은 빈 값이 아님 |
| `first_next_video_latency_ms` | 방송 종료부터 첫 선택까지 실제 경과 시간. hidden 구간 포함 |
| `first_next_video_visible_latency_ms` | 방송 종료부터 첫 선택까지 visible인 시간만 합산 |
| `next_video_clicks` | 기존 반복 클릭 수. 첫 선택 이후 재시도도 포함 |

첫 선택은 이후 다른 영상을 누르거나 반복 클릭해도 변경되지 않는다. 기존 `next_video_click` 이벤트에는 `first`와 `latency_ms`를 함께 남긴다. 현재 추천 영상은 클릭해도 재생되지 않으므로 이를 실제 추가 시청으로 보고하지 않는다. `subscribed`도 실험 안의 최종 구독 선택 상태이며 실제 유료 구독이 아니다.

## T1 → T2와 조작점검

설문 재투표 페이지를 제출할 때 원래 T1·T2 응답을 유지하면서 다음 값을 `responses`에 함께 저장한다.

| 필드 | 정의 |
|---|---|
| `t1_t2_comparable` | 제출된 T1과 유효한 T2 선택이 모두 있으면 1, 아니면 0 |
| `t1_t2_vote_changed` | 비교 가능할 때 선택 변경 1, 유지 0. 비교 불가이면 빈 값 |
| `t1_t2_conf_delta` | 양쪽 확신도가 유효한 1~7 정수일 때 T2−T1. 비교 불가 또는 확신도 누락이면 빈 값 |

확신도 차이는 선택에 대한 확신의 강도 변화이지 찬성 방향의 변화 점수가 아니다. T1은 방송 중 투표이며 이미 AI·사람 조건 안내를 본 이후이므로 전체 처치에 대한 순수한 사전값으로 표현하지 않는다. 주요 종속변수와 분석 방향은 연구 가설에 맞춰 사전 지정한다.

댓글 작성자 조작점검 `mc_author`는 기존 값 1·2를 유지하면서 3·4를 추가했다: `1=Humans only`, `2=AI only`, `3=Both humans and AI`, `4=Not sure`. 혼합 조건에도 올바른 답을 선택할 수 있다. 실패자를 자동 제외하는 기능은 추가하지 않았다. 설득·동조를 함께 묻는 `op_change` 문항의 평균 점수화나 요인 구조도 이번 구현에서 바꾸지 않았다.

## 업데이트와 확인

1. 사이트의 `index.html`, `survey/index.html`, `survey/config.js`를 함께 갱신한다. 설문 캐시 버전은 `2026-11-14-behavior-v1`이다.
2. Apps Script 프로젝트에서 [Behavior.gs](apps-script/Behavior.gs)를 새 내용으로 교체하고 저장한다. 웹 앱도 **기존 배포 관리 → 수정 → 새 버전**으로 갱신하면 같은 `/exec` URL을 유지할 수 있다. 이번 변경으로 `Code.gs` 수정이나 새 Supabase SQL은 필요하지 않다.
3. 기존 5분 동기화 트리거는 유지한다. 새 데이터가 있는 다음 동기화에서 필요한 열을 이름으로 찾아 추가한다. 기존 열 순서·과거 행·연구자가 추가한 열은 보존한다. 열 이름은 중복되지 않게 유지한다.
4. 새 시트의 기본 요약은 기존 40열에 18열을 추가한 **58열**이다. 구버전 로그에 없는 새 측정값은 빈 칸으로 남긴다. 동기화 커서를 지워도 과거에 측정하지 않은 값을 복원할 수는 없다.
5. 새 `TEST_` ID로 파일럿을 수행해 원본 요약·시트·설문을 세션 ID로 대조한다. 모집은 설정·저장 확인을 마칠 때까지 닫아 둔다. 이번 구현의 모의 검사는 실제 배포된 Apps Script의 버전 교체나 실제 시트 동기화를 대신하지 않는다.

로컬 검증: `python tests/check_measures.py`, `node tests/check_behavior.cjs`, 기존 자극물·설문 회귀 검사. 브라우저 검사에서는 외부 저장 요청을 차단한다.

## 해석과 분석 계획에 참고한 연구

- [Hilvert-Bruce 외, 2018](https://www.sciencedirect.com/science/article/pii/S0747563218300712): 정서적 연결과 시청·구독 등의 행동을 구분한 라이브 스트리밍 연구. 실험 버튼과 실제 유료 구독을 동등하게 해석하지 않는다.
- [Echterhoff·Higgins·Levine, 2009](https://www.uni-muenster.de/imperia/md/content/psyifp/aeechterhoff/wintersemester2011-12/attitudesandsocialjudgment/echterhoffhigginslevine_sharedreality_pps2009.pdf): 공유현실감의 주관적 경험을 행동 횟수와 구분하는 개념적 근거.
- [Bruns 외, 2025](https://doi.org/10.1080/00913367.2025.2524186): 모바일 소셜미디어의 화면 노출 측정과 시선추적을 대조한 연구. 이 연구가 현재의 빠른 채팅·60%·누적 1초 설정을 직접 타당화한 것은 아니다.
- [Montgomery·Nyhan·Torres, 2018 저자 설명](https://ajps.org/2019%2F06%2F10/): 처치 후 행동량을 무조건 통제하거나 조작점검 실패자를 제외하면 생길 수 있는 편향. 무작위 배정 기준 분석과 노출·행동의 보조 분석을 구분한다.
