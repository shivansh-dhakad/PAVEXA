-- ============================================================================
-- PAVEXA / RoadGuard AI — Supabase SQL Migration
-- Run this in: Supabase Dashboard → SQL Editor → New Query → Run
-- ============================================================================

-- ── Extensions ───────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists postgis; -- optional, for geo queries


-- ============================================================================
-- TABLE: hqs  (Divisional Headquarters)
-- ============================================================================
create table if not exists public.hqs (
  id          text primary key,          -- e.g. "mysuru"
  name        text not null,
  city        text not null,
  lat         double precision not null,
  lng         double precision not null,
  created_at  timestamptz default now()
);

insert into public.hqs (id, name, city, lat, lng) values
  ('mysuru',    'Mysuru PWD Division',           'Mysuru',    12.311,   76.654),
  ('bengaluru', 'Bengaluru PWD Circle',           'Bengaluru', 12.9716,  77.5946),
  ('indore',    'Indore Municipal Roads Cell',    'Indore',    22.7196,  75.8577),
  ('delhi',     'Delhi PWD Headquarters',         'Delhi',     28.6139,  77.209),
  ('tokyo',     'Tokyo Metropolitan Road Office', 'Tokyo',     35.6762, 139.7503),
  ('prague',    'Prague Road Administration',     'Prague',    50.0755,  14.4378)
on conflict (id) do nothing;


-- ============================================================================
-- TABLE: complaints
-- ============================================================================
create table if not exists public.complaints (
  id              text primary key,                        -- e.g. "PVX-1001"
  created_at      timestamptz not null default now(),
  citizen_id      text not null,
  citizen_name    text not null,
  media_kind      text not null check (media_kind in ('image','video')),
  thumb           text not null,                           -- URL or base64 data-url
  comment         text not null default '',
  lat             double precision not null,
  lng             double precision not null,
  road            text not null,
  hq_id           text not null default 'mysuru',
  distance_km     double precision not null default 0,
  status          text not null default 'Submitted'
                    check (status in ('Submitted','Verified','Assigned','In Progress','Resolved')),

  -- Report fields (denormalised for fast queries)
  rhi             integer not null,
  severity        text not null check (severity in ('Low','Moderate','High','Critical')),
  d00_count       integer not null default 0,
  d10_count       integer not null default 0,
  d20_count       integer not null default 0,
  d40_count       integer not null default 0,
  latency_ms      double precision not null default 0,
  simulated       boolean not null default false,
  frames          integer not null default 1
);

-- Indices
create index if not exists complaints_hq_idx    on public.complaints(hq_id);
create index if not exists complaints_status_idx on public.complaints(status);
create index if not exists complaints_created_idx on public.complaints(created_at desc);


-- ============================================================================
-- TABLE: detections  (one row per bounding box)
-- ============================================================================
create table if not exists public.detections (
  id            bigserial primary key,
  complaint_id  text not null references public.complaints(id) on delete cascade,
  code          text not null check (code in ('D00','D10','D20','D40')),
  confidence    double precision not null,
  x1            double precision not null,
  y1            double precision not null,
  x2            double precision not null,
  y2            double precision not null
);

create index if not exists detections_complaint_idx on public.detections(complaint_id);


-- ============================================================================
-- TABLE: complaint_updates  (status history / audit trail)
-- ============================================================================
create table if not exists public.complaint_updates (
  id            bigserial primary key,
  complaint_id  text not null references public.complaints(id) on delete cascade,
  status        text not null,
  note          text not null default '',
  created_at    timestamptz not null default now()
);

create index if not exists updates_complaint_idx on public.complaint_updates(complaint_id);


-- ============================================================================
-- TABLE: inspection_records  (from the ML Dashboard / batch tool)
-- ============================================================================
create table if not exists public.inspection_records (
  id              bigserial primary key,
  inspection_code text,                                    -- e.g. "INS-001"
  image_id        text not null,
  thumbnail_url   text,
  created_at      timestamptz not null default now(),
  latency_ms      double precision not null default 0,
  total_detections integer not null default 0,
  d00_count       integer not null default 0,
  d10_count       integer not null default 0,
  d20_count       integer not null default 0,
  d40_count       integer not null default 0,
  rhi             integer not null default 100,
  location_name   text not null default 'Unknown',
  latitude        double precision,
  longitude       double precision,
  source_mode     text not null default 'single',
  status          text not null default 'Completed',
  user_id         uuid references auth.users(id)
);

create index if not exists inspection_created_idx on public.inspection_records(created_at desc);


-- ============================================================================
-- ROW-LEVEL SECURITY
-- ============================================================================

-- complaints: anyone can read, file, and update complaints
alter table public.complaints enable row level security;

create policy "Anyone can view complaints"
  on public.complaints for select using (true);

create policy "Anyone can file complaints"
  on public.complaints for insert
  with check (true);

create policy "Anyone can update complaints"
  on public.complaints for update
  using (true);

-- detections: readable by all, writeable by all
alter table public.detections enable row level security;

create policy "Anyone can view detections"
  on public.detections for select using (true);

create policy "Anyone can insert detections"
  on public.detections for insert
  with check (true);

-- complaint_updates: readable by all, writeable by all
alter table public.complaint_updates enable row level security;

create policy "Anyone can view updates"
  on public.complaint_updates for select using (true);

create policy "Anyone can add updates"
  on public.complaint_updates for insert
  with check (true);

-- inspection_records: owner only
alter table public.inspection_records enable row level security;

create policy "Users can view own inspection records"
  on public.inspection_records for select
  using (auth.uid() = user_id or user_id is null);

create policy "Users can insert inspection records"
  on public.inspection_records for insert
  with check (auth.uid() = user_id or user_id is null);

create policy "Users can delete own inspection records"
  on public.inspection_records for delete
  using (auth.uid() = user_id);

-- hqs: public read-only
alter table public.hqs enable row level security;
create policy "Anyone can view HQs" on public.hqs for select using (true);


-- ============================================================================
-- HELPER VIEW: complaint_full
-- Returns complaints with all detections and updates nested as JSON arrays.
-- Use in authority dashboard for a single-query load.
-- ============================================================================
create or replace view public.complaint_full as
select
  c.*,
  coalesce(
    (select json_agg(d order by d.id)
     from public.detections d where d.complaint_id = c.id),
    '[]'::json
  ) as detections,
  coalesce(
    (select json_agg(u order by u.created_at)
     from public.complaint_updates u where u.complaint_id = c.id),
    '[]'::json
  ) as updates
from public.complaints c;


-- ============================================================================
-- REALTIME  (enable for live dashboard updates)
-- ============================================================================
-- Run these in SQL editor after creating tables:
-- alter publication supabase_realtime add table public.complaints;
-- alter publication supabase_realtime add table public.complaint_updates;
