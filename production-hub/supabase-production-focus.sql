-- Production Hub: workflow focado em ação.
-- Esta migration já foi aplicada no projeto Supabase.

alter table public.tasks
  add column if not exists priority text not null default 'normal'
  check (priority in ('low','normal','high','urgent'));

create table if not exists public.sprints (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  objective text not null default '',
  starts_on date,
  ends_on date,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.blockers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  title text not null,
  detail text not null default '',
  owner_id uuid references public.profiles(id) on delete set null,
  status text not null default 'OPEN' check (status in ('OPEN','RESOLVED')),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  requester_id uuid references public.profiles(id) on delete set null default auth.uid(),
  requested_from_id uuid references public.profiles(id) on delete set null,
  title text not null,
  detail text not null default '',
  due_date date,
  blocks_task_id uuid references public.tasks(id) on delete set null,
  status text not null default 'OPEN' check (status in ('OPEN','DONE','CANCELLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.decisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  decision text not null,
  decided_at date not null default current_date,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.builds (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  version text not null,
  summary text not null default '',
  url text not null default '',
  known_issues text not null default '',
  is_current boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sprints_project_active_idx on public.sprints(project_id, active);
create index if not exists blockers_project_status_idx on public.blockers(project_id, status);
create index if not exists requests_project_status_idx on public.requests(project_id, status);
create index if not exists decisions_project_date_idx on public.decisions(project_id, decided_at desc);
create index if not exists builds_project_current_idx on public.builds(project_id, is_current);

alter table public.sprints enable row level security;
alter table public.blockers enable row level security;
alter table public.requests enable row level security;
alter table public.decisions enable row level security;
alter table public.builds enable row level security;

drop policy if exists "sprints read authenticated" on public.sprints;
create policy "sprints read authenticated" on public.sprints for select to authenticated using (true);
drop policy if exists "sprints producer insert" on public.sprints;
create policy "sprints producer insert" on public.sprints for insert to authenticated with check (public.is_producer());
drop policy if exists "sprints producer update" on public.sprints;
create policy "sprints producer update" on public.sprints for update to authenticated using (public.is_producer()) with check (public.is_producer());
drop policy if exists "sprints producer delete" on public.sprints;
create policy "sprints producer delete" on public.sprints for delete to authenticated using (public.is_producer());

drop policy if exists "blockers read authenticated" on public.blockers;
create policy "blockers read authenticated" on public.blockers for select to authenticated using (true);
drop policy if exists "blockers insert authenticated" on public.blockers;
create policy "blockers insert authenticated" on public.blockers for insert to authenticated with check (auth.uid() is not null);
drop policy if exists "blockers update team" on public.blockers;
create policy "blockers update team" on public.blockers for update to authenticated using (public.is_producer() or created_by = auth.uid() or owner_id = auth.uid()) with check (public.is_producer() or created_by = auth.uid() or owner_id = auth.uid());
drop policy if exists "blockers delete producer" on public.blockers;
create policy "blockers delete producer" on public.blockers for delete to authenticated using (public.is_producer());

drop policy if exists "requests read authenticated" on public.requests;
create policy "requests read authenticated" on public.requests for select to authenticated using (true);
drop policy if exists "requests insert authenticated" on public.requests;
create policy "requests insert authenticated" on public.requests for insert to authenticated with check (requester_id = auth.uid() or public.is_producer());
drop policy if exists "requests update participants" on public.requests;
create policy "requests update participants" on public.requests for update to authenticated using (public.is_producer() or requester_id = auth.uid() or requested_from_id = auth.uid()) with check (public.is_producer() or requester_id = auth.uid() or requested_from_id = auth.uid());
drop policy if exists "requests delete producer" on public.requests;
create policy "requests delete producer" on public.requests for delete to authenticated using (public.is_producer());

drop policy if exists "decisions read authenticated" on public.decisions;
create policy "decisions read authenticated" on public.decisions for select to authenticated using (true);
drop policy if exists "decisions producer insert" on public.decisions;
create policy "decisions producer insert" on public.decisions for insert to authenticated with check (public.is_producer());
drop policy if exists "decisions producer update" on public.decisions;
create policy "decisions producer update" on public.decisions for update to authenticated using (public.is_producer()) with check (public.is_producer());
drop policy if exists "decisions producer delete" on public.decisions;
create policy "decisions producer delete" on public.decisions for delete to authenticated using (public.is_producer());

drop policy if exists "builds read authenticated" on public.builds;
create policy "builds read authenticated" on public.builds for select to authenticated using (true);
drop policy if exists "builds producer insert" on public.builds;
create policy "builds producer insert" on public.builds for insert to authenticated with check (public.is_producer());
drop policy if exists "builds producer update" on public.builds;
create policy "builds producer update" on public.builds for update to authenticated using (public.is_producer()) with check (public.is_producer());
drop policy if exists "builds producer delete" on public.builds;
create policy "builds producer delete" on public.builds for delete to authenticated using (public.is_producer());

drop trigger if exists set_sprints_updated_at on public.sprints;
create trigger set_sprints_updated_at before update on public.sprints for each row execute function public.set_updated_at();
drop trigger if exists set_blockers_updated_at on public.blockers;
create trigger set_blockers_updated_at before update on public.blockers for each row execute function public.set_updated_at();
drop trigger if exists set_requests_updated_at on public.requests;
create trigger set_requests_updated_at before update on public.requests for each row execute function public.set_updated_at();
drop trigger if exists set_decisions_updated_at on public.decisions;
create trigger set_decisions_updated_at before update on public.decisions for each row execute function public.set_updated_at();
drop trigger if exists set_builds_updated_at on public.builds;
create trigger set_builds_updated_at before update on public.builds for each row execute function public.set_updated_at();
