-- Schema for moving feedback from Redis into SQL (Postgres / Supabase).
-- Items are exported by `GET /api/feedback` (JSON) or `?format=csv` with the admin key.
create table if not exists feedback (
  id          text primary key,
  created_at  timestamptz not null,
  rating      smallint check (rating between 1 and 5),
  tags        text[] not null default '{}',
  body        text not null default '',
  who         text not null,            -- short hash of the browser token, groups repeat feedback
  context     jsonb not null default '{}'::jsonb,  -- room, phase, mode, voteStyle, players, bots, isHost, ...
  theme       text,                      -- to fill in later when sorting feedback into themes
  status      text not null default 'new' check (status in ('new','triaged','planned','done','wontfix'))
);
create index if not exists feedback_created_at_idx on feedback (created_at desc);
create index if not exists feedback_tags_idx on feedback using gin (tags);
