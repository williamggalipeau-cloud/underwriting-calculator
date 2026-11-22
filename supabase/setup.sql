-- ─── Underwriting calculator: Supabase database setup ───────────────────────
-- Run once in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- Safe to run again (it creates what is missing and replaces functions).
--
-- What it creates
--   workspaces         one row per shared workspace (the app's data as JSON)
--   workspace_members  who can open a workspace, and their role
--   workspace_invites  emails invited before they have signed in
--   workspace_versions every saved version of a workspace (kept for history)
--   audit_log          one row per changed field; written only through
--                      save_workspace(), stamped by the database with the
--                      signed-in user and server time; no one can edit or
--                      delete rows (no UPDATE/DELETE policies)
-- Roles: owner (manage members, delete), editor (save), viewer (read).

create extension if not exists pgcrypto;

-- ── Tables ──────────────────────────────────────────────────────────────────
create table if not exists public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  data        jsonb not null,
  version     integer not null default 1,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid(),
  updated_by_email text default (auth.jwt() ->> 'email'),
  updated_at  timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null,
  email        text,
  role         text not null default 'editor' check (role in ('owner', 'editor', 'viewer')),
  added_at     timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.workspace_invites (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email        text not null,
  role         text not null default 'editor' check (role in ('owner', 'editor', 'viewer')),
  invited_by   uuid default auth.uid(),
  invited_at   timestamptz not null default now(),
  primary key (workspace_id, email)
);

create table if not exists public.workspace_versions (
  id           bigserial primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  version      integer not null,
  data         jsonb not null,
  saved_by     uuid,
  saved_by_email text,
  saved_at     timestamptz not null
);

create table if not exists public.audit_log (
  id           bigserial primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  version      integer,
  at           timestamptz not null default now(),
  user_id      uuid default auth.uid(),
  user_email   text default (auth.jwt() ->> 'email'),
  area         text,
  item         text,
  field        text,
  path         jsonb,
  from_value   jsonb,
  to_value     jsonb,
  note         text
);
create index if not exists audit_log_ws_at on public.audit_log (workspace_id, at desc);
create index if not exists versions_ws on public.workspace_versions (workspace_id, version desc);

-- ── Helpers (security definer avoids recursive row-level security) ──────────
create or replace function public.ws_role(ws uuid)
returns text language sql stable security definer set search_path = public as $$
  select role from public.workspace_members where workspace_id = ws and user_id = auth.uid()
$$;

create or replace function public.ws_can(ws uuid, roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.ws_role(ws) = any(roles), false)
$$;

-- ── Triggers ─────────────────────────────────────────────────────────────────
-- The creator of a workspace becomes its owner.
create or replace function public.ws_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.workspace_members (workspace_id, user_id, email, role)
  values (new.id, auth.uid(), auth.jwt() ->> 'email', 'owner')
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists ws_after_insert on public.workspaces;
create trigger ws_after_insert after insert on public.workspaces
  for each row execute function public.ws_after_insert();

-- Audit rows always carry the real user and server time.
create or replace function public.audit_stamp()
returns trigger language plpgsql as $$
begin
  new.at := now();
  new.user_id := auth.uid();
  new.user_email := auth.jwt() ->> 'email';
  return new;
end $$;
drop trigger if exists audit_stamp on public.audit_log;
create trigger audit_stamp before insert on public.audit_log
  for each row execute function public.audit_stamp();

-- ── Row-level security ──────────────────────────────────────────────────────
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invites enable row level security;
alter table public.workspace_versions enable row level security;
alter table public.audit_log enable row level security;

drop policy if exists ws_select on public.workspaces;
create policy ws_select on public.workspaces for select
  using (public.ws_can(id, array['owner', 'editor', 'viewer']));
drop policy if exists ws_delete on public.workspaces;
create policy ws_delete on public.workspaces for delete
  using (public.ws_can(id, array['owner']));
-- Creating and saving go through create_workspace() / save_workspace() only.

drop policy if exists mem_select on public.workspace_members;
create policy mem_select on public.workspace_members for select
  using (public.ws_can(workspace_id, array['owner', 'editor', 'viewer']));
drop policy if exists inv_select on public.workspace_invites;
create policy inv_select on public.workspace_invites for select
  using (public.ws_can(workspace_id, array['owner']));
drop policy if exists ver_select on public.workspace_versions;
create policy ver_select on public.workspace_versions for select
  using (public.ws_can(workspace_id, array['owner', 'editor', 'viewer']));
drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log for select
  using (public.ws_can(workspace_id, array['owner', 'editor', 'viewer']));
-- No insert/update/delete policies on members, invites, versions or audit_log:
-- they change only through the functions below.

-- ── Functions the app calls ─────────────────────────────────────────────────
-- Creates a workspace owned by the signed-in user; returns its id.
create or replace function public.create_workspace(ws_name text, ws_data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  insert into public.workspaces (name, data, created_by, updated_by, updated_by_email)
  values (ws_name, ws_data, auth.uid(), auth.uid(), auth.jwt() ->> 'email')
  returning id into new_id;
  insert into public.audit_log (workspace_id, version, area, item, note)
  values (new_id, 1, 'Workspace', ws_name, 'Created workspace');
  return new_id;
end $$;

-- Saves a workspace if nobody else saved since expected_version. Keeps the
-- previous version and writes the audit rows in the same transaction.
-- Returns the new version, or raises 'conflict' (with the current version).
create or replace function public.save_workspace(ws uuid, expected_version integer, new_data jsonb, changes jsonb default '[]'::jsonb, new_name text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare
  cur public.workspaces;
  c jsonb;
begin
  if not public.ws_can(ws, array['owner', 'editor']) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into cur from public.workspaces where id = ws for update;
  if cur.id is null then
    raise exception 'not found';
  end if;
  if cur.version <> expected_version then
    raise exception 'conflict: version %', cur.version using errcode = '40001';
  end if;
  insert into public.workspace_versions (workspace_id, version, data, saved_by, saved_by_email, saved_at)
  values (ws, cur.version, cur.data, cur.updated_by, cur.updated_by_email, cur.updated_at);
  update public.workspaces
     set data = new_data,
         name = coalesce(new_name, name),
         version = cur.version + 1,
         updated_by = auth.uid(),
         updated_by_email = auth.jwt() ->> 'email',
         updated_at = now()
   where id = ws;
  for c in select * from jsonb_array_elements(coalesce(changes, '[]'::jsonb)) loop
    insert into public.audit_log (workspace_id, version, area, item, field, path, from_value, to_value, note)
    values (ws, cur.version + 1, c ->> 'area', c ->> 'item', c ->> 'field', c -> 'path', c -> 'from', c -> 'to', c ->> 'note');
  end loop;
  return cur.version + 1;
end $$;

-- Records a note (e.g. "Created workspace") without changing data.
create or replace function public.log_note(ws uuid, note_text text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.ws_can(ws, array['owner', 'editor']) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.audit_log (workspace_id, area, item, note) values (ws, 'Workspace', note_text, note_text);
end $$;

-- Owners add people by email. If they haven't signed in yet, an invite is
-- kept and claimed on their first sign-in.
create or replace function public.add_member(ws uuid, member_email text, member_role text default 'editor')
returns text language plpgsql security definer set search_path = public, auth as $$
declare
  uid uuid;
begin
  if not public.ws_can(ws, array['owner']) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if member_role not in ('owner', 'editor', 'viewer') then
    raise exception 'bad role';
  end if;
  select id into uid from auth.users where lower(email) = lower(member_email);
  if uid is null then
    insert into public.workspace_invites (workspace_id, email, role) values (ws, lower(member_email), member_role)
    on conflict (workspace_id, email) do update set role = excluded.role;
    insert into public.audit_log (workspace_id, area, item, note) values (ws, 'Members', member_email, 'Invited as ' || member_role);
    return 'invited';
  end if;
  insert into public.workspace_members (workspace_id, user_id, email, role) values (ws, uid, lower(member_email), member_role)
  on conflict (workspace_id, user_id) do update set role = excluded.role;
  insert into public.audit_log (workspace_id, area, item, note) values (ws, 'Members', member_email, 'Added as ' || member_role);
  return 'added';
end $$;

create or replace function public.remove_member(ws uuid, member_email text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.ws_can(ws, array['owner']) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if (select count(*) from public.workspace_members where workspace_id = ws and role = 'owner' and lower(email) <> lower(member_email)) = 0
     and exists (select 1 from public.workspace_members where workspace_id = ws and lower(email) = lower(member_email) and role = 'owner') then
    raise exception 'a workspace needs at least one owner';
  end if;
  delete from public.workspace_members where workspace_id = ws and lower(email) = lower(member_email);
  delete from public.workspace_invites where workspace_id = ws and lower(email) = lower(member_email);
  insert into public.audit_log (workspace_id, area, item, note) values (ws, 'Members', member_email, 'Removed');
end $$;

-- Turns invites for the signed-in email into memberships.
create or replace function public.claim_invites()
returns integer language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  insert into public.workspace_members (workspace_id, user_id, email, role)
  select workspace_id, auth.uid(), lower(auth.jwt() ->> 'email'), role
    from public.workspace_invites where lower(email) = lower(auth.jwt() ->> 'email')
  on conflict (workspace_id, user_id) do nothing;
  get diagnostics n = row_count;
  delete from public.workspace_invites where lower(email) = lower(auth.jwt() ->> 'email');
  return n;
end $$;

grant usage on schema public to anon, authenticated;
grant select, delete on public.workspaces to authenticated;
grant select on public.workspace_members, public.workspace_invites, public.workspace_versions, public.audit_log to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function public.create_workspace(text, jsonb) to authenticated;
grant execute on function public.save_workspace(uuid, integer, jsonb, jsonb, text) to authenticated;
grant execute on function public.log_note(uuid, text) to authenticated;
grant execute on function public.add_member(uuid, text, text) to authenticated;
grant execute on function public.remove_member(uuid, text) to authenticated;
grant execute on function public.claim_invites() to authenticated;
grant execute on function public.ws_role(uuid) to authenticated;
grant execute on function public.ws_can(uuid, text[]) to authenticated;
