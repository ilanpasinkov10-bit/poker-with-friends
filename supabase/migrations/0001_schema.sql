-- ===========================================================================
-- Poker With Friends — core schema
-- Money is stored in agorot (1 ILS = 100 agorot) as integers. Never floats.
-- Chip and money totals are NEVER stored as mutable counters: they are derived
-- from the append-only buyin_transactions ledger via table_player_totals.
-- ===========================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums (English in the database; Hebrew lives only in the UI layer)
-- ---------------------------------------------------------------------------
create type public.table_status      as enum ('WAITING', 'ACTIVE', 'COUNTING', 'COMPLETED', 'CANCELLED');
create type public.join_mode         as enum ('AUTO_JOIN', 'ADMIN_APPROVAL');
create type public.player_visibility as enum ('OPEN', 'PRIVATE');
create type public.counting_mode     as enum ('ADMIN_COUNT', 'SELF_COUNT');
create type public.player_status     as enum ('PENDING', 'ACTIVE', 'REJECTED', 'REMOVED');
create type public.buyin_type        as enum ('INITIAL_BUYIN', 'REBUY', 'REVERSAL');
create type public.request_status    as enum ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles — one row per auth user (registered AND anonymous/guest users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  avatar_url   text,
  is_guest     boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create table public.profile_privacy_settings (
  profile_id                     uuid primary key references public.profiles(id) on delete cascade,
  -- Other players at a shared table may see aggregate stats (games, balance).
  share_stats_with_table_members boolean not null default true,
  -- Per-game financial history is private unless explicitly opened up.
  share_detailed_history         boolean not null default false,
  updated_at                     timestamptz not null default now()
);
create trigger profile_privacy_updated_at before update on public.profile_privacy_settings
  for each row execute function public.set_updated_at();

-- Auto-provision a profile for every new auth user (including anonymous guests).
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name text;
begin
  v_name := btrim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  if v_name = '' then
    v_name := coalesce(nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'שחקן');
  end if;

  insert into public.profiles (id, display_name, is_guest)
  values (new.id, left(v_name, 40), coalesce(new.is_anonymous, false))
  on conflict (id) do nothing;

  insert into public.profile_privacy_settings (profile_id)
  values (new.id)
  on conflict (profile_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- poker_groups — recurring poker circles. A table may belong to a group so
-- that "השולחנות שלי" and leaderboards can aggregate across game nights.
-- ---------------------------------------------------------------------------
create table public.poker_groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 1 and 60),
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index poker_groups_owner_idx on public.poker_groups (owner_id);
create trigger poker_groups_updated_at before update on public.poker_groups
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- poker_tables — one physical poker night
-- ---------------------------------------------------------------------------
create table public.poker_tables (
  id                  uuid primary key default gen_random_uuid(),
  group_id            uuid references public.poker_groups(id) on delete set null,
  owner_id            uuid not null references public.profiles(id) on delete cascade,
  name                text not null check (char_length(btrim(name)) between 1 and 60),
  join_code           text not null unique check (join_code ~ '^[A-Z0-9]{5}$'),
  game_date           date not null,
  planned_start_at    timestamptz not null,
  planned_end_at      timestamptz not null,
  buy_in_agorot       integer not null check (buy_in_agorot between 1 and 100000000),
  chips_per_buy_in    integer not null check (chips_per_buy_in between 1 and 100000000),
  max_buy_ins         smallint not null check (max_buy_ins between 1 and 50),
  join_mode           public.join_mode not null default 'AUTO_JOIN',
  player_visibility   public.player_visibility not null default 'OPEN',
  counting_mode       public.counting_mode not null default 'ADMIN_COUNT',
  status              public.table_status not null default 'WAITING',
  started_at          timestamptz,
  counting_started_at timestamptz,
  completed_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint poker_tables_time_order check (planned_end_at > planned_start_at)
);
create index poker_tables_owner_idx  on public.poker_tables (owner_id);
create index poker_tables_group_idx  on public.poker_tables (group_id);
create index poker_tables_status_idx on public.poker_tables (status);
create trigger poker_tables_updated_at before update on public.poker_tables
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- table_players — a seat at a table. user_id is nullable only for historical
-- rows whose profile was deleted; live guests always carry an anonymous uid.
-- ---------------------------------------------------------------------------
create table public.table_players (
  id           uuid primary key default gen_random_uuid(),
  table_id     uuid not null references public.poker_tables(id) on delete cascade,
  user_id      uuid references public.profiles(id) on delete set null,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  status       public.player_status not null default 'ACTIVE',
  is_admin     boolean not null default false,
  joined_at    timestamptz not null default now(),
  approved_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index table_players_user_uniq on public.table_players (table_id, user_id)
  where user_id is not null;
create unique index table_players_name_uniq on public.table_players (table_id, lower(btrim(display_name)))
  where status in ('PENDING', 'ACTIVE');
create index table_players_table_idx on public.table_players (table_id);
create index table_players_user_idx  on public.table_players (user_id);
create trigger table_players_updated_at before update on public.table_players
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- rebuy_requests — a player asking the admin for another entry
-- ---------------------------------------------------------------------------
create table public.rebuy_requests (
  id              uuid primary key default gen_random_uuid(),
  table_id        uuid not null references public.poker_tables(id) on delete cascade,
  table_player_id uuid not null references public.table_players(id) on delete cascade,
  status          public.request_status not null default 'PENDING',
  requested_at    timestamptz not null default now(),
  resolved_at     timestamptz,
  resolved_by     uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
-- At most one open request per player: repeated taps cannot queue duplicates.
create unique index rebuy_requests_one_pending on public.rebuy_requests (table_player_id)
  where status = 'PENDING';
create index rebuy_requests_table_idx on public.rebuy_requests (table_id, status);
create trigger rebuy_requests_updated_at before update on public.rebuy_requests
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- buyin_transactions — append-only financial ledger. Corrections are recorded
-- as REVERSAL rows; existing rows are never mutated.
-- ---------------------------------------------------------------------------
create table public.buyin_transactions (
  id                      uuid primary key default gen_random_uuid(),
  table_id                uuid not null references public.poker_tables(id) on delete cascade,
  table_player_id         uuid not null references public.table_players(id) on delete cascade,
  type                    public.buyin_type not null,
  amount_agorot           integer not null,
  chips                   integer not null,
  request_id              uuid references public.rebuy_requests(id) on delete set null,
  reverses_transaction_id uuid references public.buyin_transactions(id) on delete restrict,
  note                    text,
  created_by              uuid references public.profiles(id) on delete set null,
  created_at              timestamptz not null default now(),
  constraint buyin_sign_matches_type check (
    (type in ('INITIAL_BUYIN', 'REBUY') and amount_agorot > 0 and chips > 0)
    or (type = 'REVERSAL' and amount_agorot < 0 and chips < 0)
  ),
  constraint buyin_reversal_link check (
    (type = 'REVERSAL') = (reverses_transaction_id is not null)
  )
);
-- Idempotency: one approved request can only ever produce one ledger row, and
-- a transaction can only ever be reversed once.
create unique index buyin_tx_request_uniq on public.buyin_transactions (request_id)
  where request_id is not null;
create unique index buyin_tx_reversal_uniq on public.buyin_transactions (reverses_transaction_id)
  where reverses_transaction_id is not null;
create index buyin_tx_player_idx on public.buyin_transactions (table_player_id);
create index buyin_tx_table_idx  on public.buyin_transactions (table_id);

-- ---------------------------------------------------------------------------
-- chip_count_submissions — final physical chip count per player
-- ---------------------------------------------------------------------------
create table public.chip_count_submissions (
  id              uuid primary key default gen_random_uuid(),
  table_id        uuid not null references public.poker_tables(id) on delete cascade,
  table_player_id uuid not null unique references public.table_players(id) on delete cascade,
  submitted_chips integer check (submitted_chips >= 0),
  submitted_by    uuid references public.profiles(id) on delete set null,
  submitted_at    timestamptz,
  approved_chips  integer check (approved_chips >= 0),
  approved_by     uuid references public.profiles(id) on delete set null,
  approved_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index chip_counts_table_idx on public.chip_count_submissions (table_id);
create trigger chip_counts_updated_at before update on public.chip_count_submissions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- game_results — frozen per-player outcome, written once at finalization.
-- This is the source of truth for all lifetime statistics.
-- ---------------------------------------------------------------------------
create table public.game_results (
  id                 uuid primary key default gen_random_uuid(),
  table_id           uuid not null references public.poker_tables(id) on delete cascade,
  table_player_id    uuid not null references public.table_players(id) on delete cascade,
  user_id            uuid references public.profiles(id) on delete set null,
  display_name       text not null,
  buy_in_count       integer not null check (buy_in_count >= 0),
  total_paid_agorot  integer not null check (total_paid_agorot >= 0),
  chips_issued       integer not null check (chips_issued >= 0),
  final_chips        integer not null check (final_chips >= 0),
  final_value_agorot integer not null check (final_value_agorot >= 0),
  profit_loss_agorot integer not null,
  revision           integer not null default 1,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (table_id, table_player_id)
);
create index game_results_user_idx  on public.game_results (user_id);
create index game_results_table_idx on public.game_results (table_id);
create trigger game_results_updated_at before update on public.game_results
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- settlements — who transfers money to whom
-- ---------------------------------------------------------------------------
create table public.settlements (
  id                   uuid primary key default gen_random_uuid(),
  table_id             uuid not null references public.poker_tables(id) on delete cascade,
  from_table_player_id uuid not null references public.table_players(id) on delete cascade,
  to_table_player_id   uuid not null references public.table_players(id) on delete cascade,
  amount_agorot        integer not null check (amount_agorot > 0),
  is_paid              boolean not null default false,
  created_at           timestamptz not null default now(),
  constraint settlement_distinct_parties check (from_table_player_id <> to_table_player_id)
);
create index settlements_table_idx on public.settlements (table_id);

-- ---------------------------------------------------------------------------
-- game_corrections — audit trail for post-completion corrections
-- ---------------------------------------------------------------------------
create table public.game_corrections (
  id                uuid primary key default gen_random_uuid(),
  table_id          uuid not null references public.poker_tables(id) on delete cascade,
  performed_by      uuid references public.profiles(id) on delete set null,
  reason            text not null check (char_length(btrim(reason)) between 3 and 500),
  previous_snapshot jsonb not null,
  new_snapshot      jsonb not null,
  created_at        timestamptz not null default now()
);
create index game_corrections_table_idx on public.game_corrections (table_id);

-- ---------------------------------------------------------------------------
-- saved_players — an admin's roster of regulars, for fast table setup
-- ---------------------------------------------------------------------------
create table public.saved_players (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.profiles(id) on delete cascade,
  display_name   text not null check (char_length(btrim(display_name)) between 1 and 40),
  linked_user_id uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);
create unique index saved_players_uniq on public.saved_players (owner_id, lower(btrim(display_name)));

-- ---------------------------------------------------------------------------
-- Derived totals. The ledger is the only source of truth.
-- ---------------------------------------------------------------------------
create view public.table_player_totals
with (security_invoker = true) as
select
  tp.id       as table_player_id,
  tp.table_id as table_id,
  coalesce(sum(bt.amount_agorot), 0)::int as total_paid_agorot,
  coalesce(sum(bt.chips), 0)::int         as chips_issued,
  coalesce(sum(
    case bt.type
      when 'INITIAL_BUYIN' then 1
      when 'REBUY'         then 1
      when 'REVERSAL'      then -1
      else 0
    end
  ), 0)::int as buy_in_count
from public.table_players tp
left join public.buyin_transactions bt on bt.table_player_id = tp.id
group by tp.id, tp.table_id;
