-- Run in Supabase SQL Editor before deploying the updated Apps Script.
-- Assignment is private and callable only from a trusted service-role backend.
begin;

create table if not exists public.study_assignment_settings (
  study_id text primary key,
  enrollment_open boolean not null default false,
  cell_quota integer not null default 0 check (cell_quota >= 0),
  total_quota integer not null default 0 check (total_quota >= 0),
  in_progress_minutes integer not null default 60 check (in_progress_minutes between 1 and 1440)
);
create table if not exists public.study_cells (
  study_id text not null references public.study_assignment_settings(study_id),
  cell_id text not null,
  group_name text not null check (group_name in ('ai','human','mixed')),
  congruence text not null check (congruence in ('all','half','none')),
  stim_code text not null,
  enabled boolean not null default true,
  primary key (study_id, cell_id),
  unique (study_id, stim_code)
);
create table if not exists public.study_assignments (
  assignment_id uuid primary key default gen_random_uuid(),
  study_id text not null,
  pid text not null check (pid ~ '^[A-Za-z0-9_-]{1,64}$'),
  cell_id text not null,
  is_test boolean generated always as (left(pid,5) = 'TEST_') stored,
  status text not null default 'assigned' check (status in
    ('consented','assigned','stimulus','returned','complete','withdrawn','screened','attention_fail','technical','full','mobile')),
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (study_id,pid),
  foreign key (study_id,cell_id) references public.study_cells(study_id,cell_id)
);
create index if not exists study_assignment_counts_idx
  on public.study_assignments(study_id,cell_id,status,updated_at) where not is_test;

insert into public.study_assignment_settings(study_id)
values ('livestream-ai-chat-2026') on conflict do nothing;
insert into public.study_cells(study_id,cell_id,group_name,congruence,stim_code) values
  ('livestream-ai-chat-2026','AI_100','ai','all','q7'),
  ('livestream-ai-chat-2026','AI_50','ai','half','m2'),
  ('livestream-ai-chat-2026','AI_0','ai','none','z5'),
  ('livestream-ai-chat-2026','HUMAN_100','human','all','b9'),
  ('livestream-ai-chat-2026','HUMAN_50','human','half','k3'),
  ('livestream-ai-chat-2026','HUMAN_0','human','none','r6'),
  ('livestream-ai-chat-2026','MIXED_100','mixed','all','v3'),
  ('livestream-ai-chat-2026','MIXED_50','mixed','half','t8'),
  ('livestream-ai-chat-2026','MIXED_0','mixed','none','f1')
on conflict do nothing;

alter table public.study_assignment_settings enable row level security;
alter table public.study_cells enable row level security;
alter table public.study_assignments enable row level security;
revoke all on public.study_assignment_settings,public.study_cells,public.study_assignments from public,anon,authenticated;
grant select,insert,update on public.study_assignment_settings,public.study_cells,public.study_assignments to service_role;

create or replace function public.get_condition_assignment(
  p_pid text, p_study text default 'livestream-ai-chat-2026'
) returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce((
    select jsonb_build_object('ok',true,'found',true,'existing',true,
      'assignment_id',a.assignment_id,'status',a.status,'is_test',a.is_test,
      'assigned_at',a.assigned_at,'updated_at',a.updated_at,
      'cell',jsonb_build_object('id',c.cell_id,'group',c.group_name,'cong',c.congruence,'code',c.stim_code))
    from public.study_assignments a join public.study_cells c using (study_id,cell_id)
    where a.study_id = p_study and a.pid = p_pid
  ),jsonb_build_object('ok',true,'found',false));
$$;

create or replace function public.assign_condition(
  p_pid text, p_study text default 'livestream-ai-chat-2026', p_force_cell text default null
) returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare
  cfg public.study_assignment_settings%rowtype;
  chosen public.study_cells%rowtype;
  existing jsonb;
  counts jsonb;
  total integer;
  test_pid boolean;
  ts timestamptz;
begin
  if p_pid is null or p_pid !~ '^[A-Za-z0-9_-]{1,64}$' or p_study is null then
    raise exception 'Invalid participant or study ID' using errcode = '22023';
  end if;
  -- Transaction-level study lock makes count -> choose -> insert indivisible,
  -- even when separate app servers call the function at the same time.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_study,20261113));
  ts := clock_timestamp();
  select * into cfg from public.study_assignment_settings where study_id = p_study;
  if not found then raise exception 'Unknown study' using errcode = '22023'; end if;
  existing := public.get_condition_assignment(p_pid,p_study);
  if (existing->>'found')::boolean then return existing; end if;
  test_pid := left(p_pid,5) = 'TEST_';
  if p_force_cell is not null and not test_pid then
    raise exception 'Forced conditions are restricted to test IDs' using errcode = '22023';
  end if;
  if not cfg.enrollment_open and not test_pid then
    return jsonb_build_object('ok',true,'full',true,'reason','closed');
  end if;
  with active as (
    select * from public.study_assignments
    where study_id = p_study and not is_test and
      (status in ('returned','complete') or
       (status in ('assigned','consented','stimulus') and updated_at >= ts - make_interval(mins => cfg.in_progress_minutes)))
  ), by_cell as (
    select c.cell_id,count(a.assignment_id)::integer as n
    from public.study_cells c left join active a on a.cell_id = c.cell_id
    where c.study_id = p_study and c.enabled group by c.cell_id
  )
  select coalesce((select jsonb_object_agg(cell_id,n) from by_cell),'{}'::jsonb),
         (select count(*)::integer from active) into counts,total;
  if not test_pid and cfg.total_quota > 0 and total >= cfg.total_quota then
    return jsonb_build_object('ok',true,'full',true,'reason','total_quota','counts',counts);
  end if;
  if p_force_cell is not null then
    select * into chosen from public.study_cells
      where study_id = p_study and cell_id = p_force_cell and enabled;
    if not found then raise exception 'Unknown test condition' using errcode = '22023'; end if;
  else
    select * into chosen from public.study_cells c
      where c.study_id = p_study and c.enabled and
        (test_pid or cfg.cell_quota = 0 or (counts->>c.cell_id)::integer < cfg.cell_quota)
      order by (counts->>c.cell_id)::integer,random() limit 1;
    if not found then
      return jsonb_build_object('ok',true,'full',true,'reason','cell_quota','counts',counts);
    end if;
  end if;
  insert into public.study_assignments(study_id,pid,cell_id,assigned_at,updated_at)
    values (p_study,p_pid,chosen.cell_id,ts,ts);
  return public.get_condition_assignment(p_pid,p_study) ||
    jsonb_build_object('existing',false,'counts',counts);
end;
$$;

create or replace function public.set_condition_status(
  p_pid text, p_status text, p_study text default 'livestream-ai-chat-2026'
) returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare
  previous text;
  next_status text := p_status;
  progression text[] := array['consented','assigned','stimulus','returned','complete'];
begin
  if p_status is null or p_status not in
    ('consented','assigned','stimulus','returned','complete','withdrawn','screened','attention_fail','technical','full','mobile') then
    raise exception 'Unknown participation status' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_study,20261113));
  select status into previous from public.study_assignments where study_id = p_study and pid = p_pid;
  if not found then return jsonb_build_object('ok',true,'found',false); end if;
  if previous = 'withdrawn' or (p_status <> 'withdrawn' and
      (previous in ('complete','screened','attention_fail','technical','full','mobile') or
       coalesce(array_position(progression,p_status),99) < coalesce(array_position(progression,previous),0))) then
    next_status := previous;
  end if;
  update public.study_assignments set status = next_status,updated_at = clock_timestamp()
    where study_id = p_study and pid = p_pid;
  return public.get_condition_assignment(p_pid,p_study);
end;
$$;

revoke all on function public.assign_condition(text,text,text) from public,anon,authenticated;
revoke all on function public.get_condition_assignment(text,text) from public,anon,authenticated;
revoke all on function public.set_condition_status(text,text,text) from public,anon,authenticated;
grant execute on function public.assign_condition(text,text,text) to service_role;
grant execute on function public.get_condition_assignment(text,text) to service_role;
grant execute on function public.set_condition_status(text,text,text) to service_role;

commit;
