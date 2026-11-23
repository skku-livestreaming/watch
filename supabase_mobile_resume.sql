-- Allow a participant blocked on mobile to resume on desktop.
begin;

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
      (previous in ('complete','screened','attention_fail','technical','full') or
       coalesce(array_position(progression,p_status),99) < coalesce(array_position(progression,previous),0))) then
    next_status := previous;
  end if;
  update public.study_assignments set status = next_status,updated_at = clock_timestamp()
    where study_id = p_study and pid = p_pid;
  return public.get_condition_assignment(p_pid,p_study);
end;
$$;

revoke all on function public.set_condition_status(text,text,text) from public,anon,authenticated;
grant execute on function public.set_condition_status(text,text,text) to service_role;

commit;
