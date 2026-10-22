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

-- ════════════════════════════════════════════════════════════════
-- 사람별로 보기
-- ════════════════════════════════════════════════════════════════

-- ① 사람별 핵심 결과 한 줄. 분석에 바로 쓰는 값만 옆으로 펼쳤습니다.
create or replace view participant_results
with (security_invoker = true)
as
select
  s.started_at,
  s.pid,
  s.condition->>'code'                                                        as code,
  s.condition->>'label'                                                       as label,
  s.condition->>'cong'                                                        as cong,
  -- 투표가 두 개입니다(1: 고릴라, 2: 10년 애인). poll 필드가 없는 예전 기록은 투표 1로 봅니다.
  max(e.data->>'label')       filter (where e.type = 'vote'        and coalesce(e.data->>'poll','1') = '1') as vote1,
  max(e.data->>'text')        filter (where e.type = 'vote_reason' and coalesce(e.data->>'poll','1') = '1') as reason1,
  bool_or(e.type = 'poll_missed' and coalesce(e.data->>'poll','1') = '1')                                  as missed_vote1,
  max((e.data->>'mine_share')::numeric) filter (where e.type = 'poll_result_shown' and coalesce(e.data->>'poll','1') = '1') as result_mine_share1,
  max(e.data->>'label')       filter (where e.type = 'vote'        and e.data->>'poll' = '2')             as vote2,
  max(e.data->>'text')        filter (where e.type = 'vote_reason' and e.data->>'poll' = '2')             as reason2,
  bool_or(e.type = 'poll_missed' and e.data->>'poll' = '2')                                                as missed_vote2,
  max((e.data->>'mine_share')::numeric) filter (where e.type = 'poll_result_shown' and e.data->>'poll' = '2') as result_mine_share2,
  count(*)                    filter (where e.type = 'text_select')           as drags,
  count(*)                    filter (where e.type = 'user_comment')          as comments,
  count(*)                    filter (where e.type = 'user_card_open')        as card_opens,
  count(*)                    filter (where e.type = 'next_video_click')      as next_video_clicks,
  max(e.data->>'subscribed')  filter (where e.type = 'leave')                 as subscribed,
  max(e.data->>'reaction')    filter (where e.type = 'leave')                 as reaction,
  max((e.data->>'seen_congruence_ratio')::numeric) filter (where e.type = 'leave') as seen_congruence_ratio,
  max((e.data->>'after_end_sec')::numeric)         filter (where e.type = 'leave') as after_end_sec,
  max(e.data->>'via')         filter (where e.type = 'leave')                 as leave_via,
  s.id                                                                        as session_id
from sessions s
left join events e on e.session_id = s.id
group by s.id
order by s.started_at desc;

revoke all on participant_results from anon, authenticated;

-- ② 사람별 전체 기록 한 줄. events 열을 누르면 그 사람의 행동이 시간순 JSON으로 보입니다
--    (실험 화면의 'JSON 내려받기'와 같은 모양).
create or replace view participant_log
with (security_invoker = true)
as
select
  s.started_at,
  s.pid,
  s.condition->>'code'  as code,
  count(e.id)           as n_events,
  coalesce(
    jsonb_agg(jsonb_build_object('t', e.t, 'type', e.type) || (e.data - 't' - 'type')
              order by e.t, e.id) filter (where e.id is not null),
    '[]'::jsonb)        as events,
  s.id                  as session_id
from sessions s
left join events e on e.session_id = s.id
group by s.id
order by s.started_at desc;

revoke all on participant_log from anon, authenticated;

-- ③ 한 사람의 행동을 시간순 표로. Table Editor에서 pid로 필터하면 그 사람만 보입니다.
create or replace view participant_timeline
with (security_invoker = true)
as
select
  s.pid,
  s.condition->>'code'  as code,
  e.t,
  e.type,
  e.data - 't' - 'type' as detail,
  s.started_at,
  s.id                  as session_id
from events e
join sessions s on s.id = e.session_id
order by s.started_at desc, e.t, e.id;

revoke all on participant_timeline from anon, authenticated;
