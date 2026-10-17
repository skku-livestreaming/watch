-- Supabase 대시보드 → SQL Editor → New query 에 전부 붙여넣고 Run.
-- 한 번만 실행하면 됩니다.

-- 세션 1건 = 참가자 1명의 자극물 1회 실행
create table if not exists sessions (
  id          uuid primary key,
  pid         text,
  condition   jsonb,
  started_at  timestamptz default now(),
  user_agent  text,
  screen_w    int,  screen_h    int,
  viewport_w  int,  viewport_h  int,
  tz          text
);

-- 이벤트 1건 = 행동 1개
create table if not exists events (
  id          bigserial primary key,
  session_id  uuid references sessions(id),
  t           numeric,      -- 세션 시작 기준 경과 초
  type        text,
  data        jsonb,
  created_at  timestamptz default now()
);

create index if not exists events_session_idx on events (session_id);
create index if not exists events_type_idx    on events (type);

-- 참가자(브라우저)는 쓰기만 가능하고 읽기·수정·삭제는 불가
alter table sessions enable row level security;
alter table events   enable row level security;

drop policy if exists "anon insert sessions" on sessions;
drop policy if exists "anon insert events"   on events;
create policy "anon insert sessions" on sessions for insert to anon with check (true);
create policy "anon insert events"   on events   for insert to anon with check (true);

-- 안내 페이지에서 받은 참가자 코드를 세션 행에 채웁니다.
-- 이미 pid가 들어간 세션은 덮어쓰지 않습니다.
create or replace function set_pid(sid uuid, p text)
returns void
language sql
security definer
set search_path = public
as $$
  update sessions set pid = p
  where id = sid and (pid is null or pid = 'TEST');
$$;
revoke all on function set_pid(uuid, text) from public;
grant execute on function set_pid(uuid, text) to anon;
