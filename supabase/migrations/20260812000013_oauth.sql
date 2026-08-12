-- ============ oauth_clients / oauth_codes ============
-- Backing tables for the MCP OAuth authorization-code flow. Access is
-- service_role-only: RLS is enabled with zero policies, which denies all
-- access to anon/authenticated (and any other non-bypassrls role); only
-- service_role (which bypasses RLS) may read or write these tables.

create table oauth_clients (
  id uuid primary key default gen_random_uuid(),
  client_name text not null,
  redirect_uris text[] not null,
  created_at timestamptz default now()
);

create table oauth_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  client_id uuid not null references oauth_clients(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null,
  expires_at timestamptz not null,
  used boolean not null default false,
  created_at timestamptz default now()
);

alter table oauth_clients enable row level security;
alter table oauth_codes enable row level security;

grant select, insert, update, delete on oauth_clients, oauth_codes to service_role;
