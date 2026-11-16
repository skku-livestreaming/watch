# Supabase 자동 조건 배정

참가자가 동의한 뒤 설문은 Apps Script의 `assign`을 호출합니다. Apps Script는 Supabase의 `assign_condition`을 호출하고, 반환된 배정을 Google 시트 `assignments`에 복제합니다. **배정의 원본은 Supabase `study_assignments`**입니다. 브라우저와 Google 시트는 조건을 새로 뽑지 않습니다. 연구자 미리보기는 서버에 요청하지 않습니다.

## 배정 규칙

- 기존 3 × 3, 9개 조건 중 현재 인원이 가장 적은 조건에 배정하며, 동률이면 DB에서 무작위로 선택합니다.
- 연구 ID와 참가자 ID의 조합당 배정 한 건을 유지합니다. 재접속 시 설문은 DB 원본을 조회하며 브라우저 기록과 다르면 자동 재배정 없이 중단합니다. 새로고침·재접속·통신 재시도에도 같은 조건과 `assignment_id`를 돌려줍니다. ID 대소문자를 구분합니다.
- 같은 연구의 배정 요청은 트랜잭션 잠금으로 순서대로 처리합니다. 인원 계산과 저장 사이에 다른 요청이 끼어 같은 마지막 자리를 중복 배정하지 못하게 합니다.
- `complete`, `returned`와 최근 60분 이내 `assigned`, `consented`, `stimulus`를 인원에 포함합니다. 진행 중 기준 시각은 마지막 상태 갱신 `updated_at`입니다.
- 철회·기술 오류·탈락과 오래된 진행 중 예약은 인원에서 제외합니다. 완료·철회 상태는 늦게 도착한 요청으로 이전 상태로 돌아가지 않습니다.
- `TEST_`로 시작하는 ID는 실제 인원에서 제외합니다. 테스트 ID에만 `p_force_cell` 강제 조건을 허용합니다. 연구자 미리보기는 이 테스트 배정조차 만들지 않습니다.
- 오래된 예약을 제외하는 규칙상, 장시간 이탈했던 사람이 뒤늦게 복귀하면 집계가 바뀔 수 있습니다. 정원은 현재 유효 예약·복귀·완료 인원 기준이며 최종 유효 표본 수는 종료 후 확인합니다.

## 설치·모집 설정

1. Supabase SQL Editor에서 저장소의 `supabase_assignment.sql`을 실행합니다. 기존 로그용 `supabase_setup.sql`과 별도입니다. 반복 실행해도 기존 배정이나 모집 설정을 덮어쓰지 않습니다.
2. Apps Script 프로젝트의 `Code.gs`와 `Behavior.gs`를 함께 갱신하고 새 버전으로 배포합니다. 스크립트 속성 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`를 설정합니다. 이 키는 공개 HTML·설문 설정 파일에 넣지 않습니다.
3. 연구 ID의 기본값은 `livestream-ai-chat-2026`입니다. 다른 연구를 만들면 DB의 연구·조건 행을 먼저 생성하고 Apps Script 속성 `ASSIGNMENT_STUDY_ID`와 설문 `STUDY_ID`를 맞춥니다.
4. 정원은 **DB 설정**에서 바꿉니다. 예를 들어 총 500명, 셀당 최대 56명이라면:

```sql
update public.study_assignment_settings
set total_quota = 500,
    cell_quota = 56,
    in_progress_minutes = 60
where study_id = 'livestream-ai-chat-2026';
```

`cell_quota`, `total_quota`가 0이면 해당 제한은 없습니다. 조건을 바꾸면 DB `study_cells`, Apps Script의 응답 검증용 `STUDY_CELLS`, 설문의 `CELLS`를 함께 맞춥니다. 예전 Apps Script 속성 `CELL_QUOTA`, `IN_PROGRESS_MINUTES`는 배정에 사용하지 않습니다.

5. 기본 모집 상태는 닫힘입니다. 설정과 파일럿 확인 후 다음 SQL과 설문 `PARTICIPANT_OPEN: true`를 적용합니다.

```sql
update public.study_assignment_settings
set enrollment_open = true
where study_id = 'livestream-ai-chat-2026';
```

모집을 닫아도 기존 배정은 지우지 않습니다. DB 함수는 이미 배정된 ID에 기존 값을 반환하며, 새 실제 참가자는 `full: true, reason: closed`를 받습니다. 설문의 `PARTICIPANT_OPEN: false`는 일반 진입 자체를 중지합니다.

**이미 실제 참가자를 시트에서 배정한 적이 있다면**, 먼저 기존 PID·셀·상태·배정 시각을 `study_assignments`로 이관하고 일치 여부를 검증해야 합니다. 빈 배정 DB로 전환하면 기존 참가자가 새 조건을 받을 수 있습니다. 현재 저장소는 아직 실제 설문 API를 설정하지 않았고 모집도 닫아 둔 상태입니다.

## 함수와 기록

| 함수 | 용도 |
|---|---|
| `assign_condition(p_pid, p_study, p_force_cell)` | 기존 배정 반환 또는 새 균등 배정 |
| `get_condition_assignment(p_pid, p_study)` | 배정·상태 조회 |
| `set_condition_status(p_pid, p_status, p_study)` | 진행·완료·철회 상태 갱신 |

세 함수는 `service_role`만 호출할 수 있습니다. `anon`, `authenticated`에는 함수 실행 및 배정 테이블 읽기 권한이 없습니다. Apps Script를 거쳐 호출하며 공개 publishable 키를 사용하지 않습니다.

`responses.assignment_id`와 `assignments.assignment_id`에 배정 ID를 저장하고, 자극물 URL로도 전달해 `sessions.condition.assignment_id`에 남깁니다. 설문과 원본 행동은 기존 `stim_session_id`로도 연결합니다.

## 검증

```powershell
npm.cmd install --prefix .qa-tools --no-save embedded-postgres pg
node tests/check_assignment.cjs
node tests/check_behavior.cjs
python tests/check_participant.py
```

실제 로컬 PostgreSQL에서 500개 병렬 요청(연결 풀 최대 40개), 동일 ID 100회 재시도, 셀·총 정원, 오래된 예약, 철회·완료 상태, 익명 접근 차단과 재설치를 검증합니다. 500개의 새 유효 배정은 조건별 55~56명입니다. 이 검사는 실제 Supabase/Apps Script 전체 경로의 500명 동시 접속 부하 시험을 대신하지 않습니다.
