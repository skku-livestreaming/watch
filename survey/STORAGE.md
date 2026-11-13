# 응답·행동 지표 저장 연결

현재 실제 Google 시트와 Apps Script 배포 주소는 아직 없습니다. `config.js`의 `API_URL`은 빈 값으로 유지했습니다. 아래 코드는 로컬 검증까지 완료했으며, 서버 배포·실제 데이터 저장·실제 부하 검증은 별도로 해야 합니다.

## 데이터 흐름

- 조건 배정: 설문 → Apps Script → Supabase `assign_condition` → 배정 원본 저장, 시트 `assignments`에 복제. [설치·규칙](ASSIGNMENT.md).

- 설문 응답: `survey/index.html` → Apps Script `Code.gs` → `responses` (참가자당 1행).
- 자극물 원본 행동 이벤트: `index.html` → Supabase `sessions`, `events` (기존 저장 경로 유지).
- 분석용 행동 요약: `Behavior.gs` → Supabase의 `leave` 이벤트를 읽어 Google 시트 `behavior`에 세션당 1행 저장.
- 설문과 행동은 `responses.stim_session_id = behavior.session_id`로 결합합니다. 같은 참가자의 재접속 세션을 혼동할 수 있어 `pid`만으로 합치지 않습니다.

`behavior`에는 T1 선택·확신도, 시청 시간, 댓글 작성 수, 텍스트 선택 수, 프로필 열기·클릭 수, 다음 영상 클릭 수, 좋아요/싫어요, 구독 상태, 채팅 스크롤·노출량, AI·사람별 의견 댓글 수를 저장합니다. 원본 이벤트와 텍스트 선택 내용은 Supabase에 남습니다. 새로 추가된 요약 필드가 없는 과거 세션은 해당 열을 빈 값으로 두며, 측정되지 않은 값을 0으로 바꾸지 않습니다.

## 설치

0. Supabase에서 `supabase_assignment.sql`을 실행해 배정 함수를 설치합니다. 기존 시트 배정이 있다면 먼저 이관합니다. [자동 배정 안내](ASSIGNMENT.md).
1. 연구자 계정으로 Google 스프레드시트를 만들고 **확장 프로그램 → Apps Script**를 엽니다.
2. 저장소의 `apps-script/Code.gs`와 `apps-script/Behavior.gs`를 같은 프로젝트의 두 파일로 추가합니다.
3. **프로젝트 설정 → 스크립트 속성**에 다음을 설정합니다.
   - `SUPABASE_URL`: 현재 자극물과 같은 프로젝트 URL.
   - `SUPABASE_SERVICE_ROLE_KEY`: 서버에서 조회할 수 있는 service role 또는 secret 키. 공개 HTML·`config.js`·Git 저장소에는 넣지 않습니다. 자극물의 publishable 키로는 읽을 수 없습니다.
   - 선택: `ASSIGNMENT_STUDY_ID` (기본 `livestream-ai-chat-2026`). 정원·모집 상태는 Supabase `study_assignment_settings`에서 설정합니다. [자동 배정 설치](ASSIGNMENT.md)를 먼저 완료합니다.
4. 편집기에서 `syncBehaviorMeasures`를 한 번 실행하고 권한을 승인합니다. `behavior` 시트가 만들어지고, 종료 로그가 있으면 최대 100건을 가져옵니다.
5. `installBehaviorSync`를 한 번 실행하면 **5분마다** 동기화합니다. 미처리 종료 이벤트가 100건 이상이면 다음 실행에서 이어서 가져옵니다. 수동 실행을 반복해도 됩니다.
6. Apps Script를 **웹 앱**, 실행 계정 **나**, 접근 **모든 사용자**로 배포하고 `…/exec` 주소를 `survey/config.js`의 `API_URL`에 넣습니다. 이후 코드 변경은 새 버전으로 다시 배포합니다.
7. CloudResearch의 완료 주소 또는 코드를 `REDIRECTS.complete` / `COMPLETION_CODE`에 설정합니다. 동의서·디브리핑의 기존 자리표시자도 실제 연구 정보로 채웁니다.

8. 연구자 화면(`/survey/?admin=1`)의 **Participant setup** 항목을 확인합니다. 필수 설정과 실제 파일럿을 확인한 후 `PARTICIPANT_OPEN: true`로 바꿔 배포합니다. 현재는 false이므로 일반 참가자에게 모집 중지 안내가 나오며, 저장되지 않는 상태로 설문을 진행하지 않습니다.

참가자 배포 링크는 `/survey/?v=2026-11-13-assignment-v2&participantId=[ID]`를 기준으로 설정합니다. 관리자·debug 파라미터는 참가자 링크에 포함하지 않습니다. 새 배포에서 파일 구성이 바뀌면 `ASSET_VERSION`과 HTML의 config.js 버전도 함께 갱신합니다.

시트의 행·열 수가 부족하면 코드가 자동으로 확장합니다. `BEHAVIOR_EVENT_CURSOR` 속성은 성공한 마지막 종료 이벤트 ID입니다. 전체 재동기화가 필요하면 이 속성만 지우고 다시 실행합니다. 세션 ID로 갱신하므로 중복 행을 만들지 않으며, 단순 창 닫기 기록이 완료 기록을 덮어쓰지 않습니다. 시트 쓰기 실패 시 커서를 진행시키지 않아 다음 실행에서 재시도합니다.

설문 철회 시 `responses`·`log`에 더해 `behavior`도 지웁니다. 이후 동기화에서도 철회 ID는 가져오지 않습니다. **Supabase 원본 삭제는 기존과 같이 연구자 작업으로 남습니다.**

## 500명 검토

- **총 표본 500명**: 행동 요약은 약 500행 × 40열 = 20,000셀입니다. 설문이 300열이라는 가정이면 150,000셀입니다. 이는 규모 산정이며, 문항 추가에 따라 달라집니다.
- **원본 로그 용량**: 기존 가정인 1인당 2,000건·건당 0.3KB라면 약 300MB입니다. JSON 크기·인덱스·기존 데이터가 추가되므로 무료 DB 용량에 무조건 들어간다고 보장하지 않습니다. 실제 파일럿의 세션당 저장량과 프로젝트 여유 용량을 확인해야 합니다.
- **500명 동시 접속**: 현재 Apps Script 웹 앱으로 수용을 보장할 수 없습니다. 공식 제한은 계정당 동시 실행 30개, 스크립트당 1,000개, 실행당 6분이며, 현재 `Code.gs`는 배정·저장을 하나의 잠금으로 직렬 처리합니다. 동시 요청이 몰리면 대기·재시도가 발생합니다. [Apps Script 공식 할당량](https://developers.google.com/apps-script/guides/services/quotas).
- **동작 검증**: `node tests/check_behavior.cjs`로 500명 모의 데이터의 100건 단위 동기화, 중복 방지, 완료 기록 우선, 실패 후 재시도, 철회 제외와 시트 크기 확장을 확인했습니다. 네트워크·Google 서버의 실제 부하 시험을 대신하지 않습니다.
- **운영 전**: 소규모 파일럿에서 조건 배정·T1·T2·행동 데이터 결합·철회·오프라인 재전송을 확인하고, 모집을 나누어 점진적으로 늘립니다. 500명 동시 입장이 필요하면 배정·응답을 처리하는 서버/DB를 별도로 마련하고 부하 시험을 해야 합니다.

현재 구현은 `SpreadsheetApp`을 사용합니다. 추후 Sheets REST API를 직접 쓰는 서버로 바꾸면 읽기·쓰기 각각 프로젝트당 분당 300회, 사용자·프로젝트당 분당 60회가 기본 제한이므로 묶음 처리와 재시도가 필요합니다. [Sheets API 공식 제한](https://developers.google.com/workspace/sheets/api/limits).

## 참가자 배포 점검 결과

- `admin=1`과 `debug=1`은 각각 별도의 브라우저 저장 공간을 사용하고 설문 API와 자극물 DB에 쓰지 않습니다. 연구자의 화면 이동·조건 전환·빠른 미리보기는 유지합니다.
- 참가자 진행 기록은 ID별로 분리합니다. 지원 브라우저의 Web Locks로 같은 ID의 중복 탭을 막고, 새로고침 시 진행 단계·현재 쪽의 입력 초안·무작위 문항 순서를 복원합니다.
- 서버 조건 배정에 실패하면 재시도 화면에서 기다립니다. 실제 참가자에게 임의 조건을 배정하지 않습니다.
- 설문 완료 코드와 복귀 링크는 서버 저장 확인 뒤에만 표시합니다. 실패한 응답은 브라우저에 유지하고 다시 보낼 수 있습니다. 현재 자극물의 종료 로그도 저장을 확인한 후 사후 문항으로 이동합니다. 6초가 지나도 미완료면 재시도 버튼이 나옵니다.
- 자극물 요청은 전송 전에 재시도 큐에 보관하고 큰 이벤트 묶음은 약 48KiB로 나눕니다. 세션 재전송은 같은 UUID를 중복 생성하지 않으며, 예전 세션의 실패가 새 참가자 저장을 막지 않습니다. 저장소가 차면 해당 페이지의 메모리에서 재시도하므로 저장 성공 전에는 페이지를 닫지 않도록 안내합니다.
- iframe 로드 실패는 재시도할 수 있으며, 참가자용 수동 건너뛰기는 제공하지 않습니다. 영상 재생이 반복 실패하면 기술 오류로 종료하고 정상 완료로 처리하지 않습니다.
- 서버의 늦은 요청이 완료 상태를 이전 단계로 되돌리거나 철회한 응답을 다시 저장하지 못하게 했습니다.

검증 명령: `python tests/check_stimulus.py`, `python tests/check_revision.py`, `python tests/check_participant.py`, `python tests/check_sink.py`, `node tests/check_behavior.cjs`, `python tests/check_media.py` (실제 MP4, 미리보기 8배속).
브라우저 검사는 실제 외부 요청을 차단합니다. 일반 회귀검사는 모의 API·미디어를 사용하고, `check_media.py`는 저장소의 실제 MP4를 디코딩해 시작·종료를 확인합니다. 실제 API 배포, Google 계정 권한/CORS, 실제 영상 디코딩·네트워크 성능과 동시 모집 부하는 운영 파일럿에서 확인해야 합니다.
