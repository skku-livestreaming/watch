-- 참가자 데이터가 제대로 쌓이는지 보는 요약 뷰.
-- Supabase SQL Editor에서 한 번 실행하면, 이후에는 Table Editor → participant_status 를 열기만 하면 됩니다.
-- 참가자 1명(세션 1건)당 1줄입니다. 최근 참가자가 맨 위에 옵니다.

create or replace view participant_status
with (security_invoker = true)   -- 뷰가 RLS를 우회하지 않게 합니다
as
select
  s.started_at,
  s.pid,
  s.condition->>'code'                                    as code,
  s.condition->>'cong'                                    as cong,
  s.condition->>'label'                                   as label,
  count(e.id)                                             as events,
  max(e.created_at)                                       as last_event_at,
  bool_or(e.type = 'intro_done')                          as passed_intro,
  bool_or(e.type = 'vote')                                as voted,
  bool_or(e.type = 'stream_ended')                        as saw_end,
  max(e.data->>'via')        filter (where e.type = 'leave') as leave_via,
  max((e.data->>'dwell_sec')::numeric)     filter (where e.type = 'leave') as dwell_sec,
  max((e.data->>'after_end_sec')::numeric) filter (where e.type = 'leave') as after_end_sec,
  case
    when bool_or(e.type = 'leave' and e.data->>'via' = 'end_button') then '완료'
    when bool_or(e.type = 'leave')                                    then '창 닫음'
    when count(e.id) = 0                                              then '이벤트 없음'
    when max(e.created_at) > now() - interval '10 minutes'            then '진행 중'
    else '중단'
  end                                                     as status,
  s.id                                                    as session_id
from sessions s
left join events e on e.session_id = s.id
group by s.id
order by s.started_at desc;

-- 참가자(anon) 키로는 이 뷰를 읽을 수 없게 막습니다. Supabase는 public 스키마의 새 뷰를
-- 기본으로 anon에게 열어 두므로 반드시 회수합니다.
revoke all on participant_status from anon, authenticated;

-- 조건별 완료 인원 (배정이 고르게 되고 있는지)
create or replace view condition_counts
with (security_invoker = true)
as
select code, cong, label,
       count(*)                                  as sessions,
       count(*) filter (where status = '완료')    as completed,
       count(*) filter (where status = '창 닫음') as closed,
       count(*) filter (where status = '중단')    as dropped
from participant_status
group by code, cong, label
order by code;

revoke all on condition_counts from anon, authenticated;
