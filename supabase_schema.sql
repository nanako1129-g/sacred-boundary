create extension if not exists "pgcrypto";

create type public.spot_type as enum ('sacred', 'random');

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  pilgrim_title text default '旅立ちの観測者',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.spots (
  id text primary key,
  name text not null unique,
  lat double precision not null,
  lon double precision not null,
  type public.spot_type not null,
  prefecture text,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  spot_id text not null references public.spots(id) on delete restrict,
  visited_on date not null,
  memo text,
  rating smallint check (rating between 1 and 5),
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, spot_id, visited_on)
);

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.visits(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  storage_path text not null unique,
  public_url text,
  caption text,
  taken_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_spots_type on public.spots(type);
create index if not exists idx_spots_lat_lon on public.spots(lat, lon);
create index if not exists idx_spots_type_lat_lon on public.spots(type, lat, lon);
create index if not exists idx_visits_user_created on public.visits(user_id, created_at desc);
create index if not exists idx_visits_spot on public.visits(spot_id);
create index if not exists idx_visits_public on public.visits(is_public) where is_public = true;
create index if not exists idx_photos_visit on public.photos(visit_id);
create index if not exists idx_photos_user on public.photos(user_id);

alter table public.spots enable row level security;
alter table public.users enable row level security;
alter table public.visits enable row level security;
alter table public.photos enable row level security;

drop policy if exists "spots are viewable by everyone" on public.spots;
create policy "spots are viewable by everyone" on public.spots
for select to public
using (true);

drop policy if exists "users can read public profile" on public.users;
create policy "users can read public profile" on public.users
for select to public
using (true);

drop policy if exists "users can update self profile" on public.users;
create policy "users can update self profile" on public.users
for all to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "public can read public visits" on public.visits;
create policy "public can read public visits" on public.visits
for select to public
using (is_public = true or auth.uid() = user_id);

drop policy if exists "users can write own visits" on public.visits;
create policy "users can write own visits" on public.visits
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "public can read photo with public visit" on public.photos;
create policy "public can read photo with public visit" on public.photos
for select to public
using (
  exists (
    select 1
    from public.visits
    where visits.id = photos.visit_id
      and (visits.is_public = true or visits.user_id = auth.uid())
  )
);

drop policy if exists "users can write own photos" on public.photos;
create policy "users can write own photos" on public.photos
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

insert into public.spots (id, name, lat, lon, type)
values
  ('osorezan', '恐山', 41.3264, 141.0916, 'sacred'),
  ('tateyama', '立山', 36.5753, 137.6196, 'sacred'),
  ('kumano-nachi', '熊野那智大社', 33.6764, 135.8888, 'sacred'),
  ('koyasan', '高野山', 34.2122, 135.5853, 'sacred'),
  ('izumo', '出雲大社', 35.4021, 132.6855, 'sacred'),
  ('bungui', '分杭峠', 35.8097, 138.0423, 'sacred'),
  ('togakushi', '戸隠神社', 36.7441, 138.0853, 'sacred'),
  ('ise', '伊勢神宮', 34.455, 136.7254, 'sacred'),
  ('yakushima', '屋久島', 30.3363, 130.5336, 'sacred'),
  ('kifune', '貴船神社', 35.1214, 135.763, 'sacred'),
  ('random-1', 'ランダム地点1: 札幌市郊外', 43.0621, 141.3544, 'random'),
  ('random-2', 'ランダム地点2: 秋田県横手市', 39.3113, 140.5533, 'random'),
  ('random-3', 'ランダム地点3: 群馬県前橋市', 36.3912, 139.0608, 'random'),
  ('random-4', 'ランダム地点4: 東京都八王子市', 35.6662, 139.316, 'random'),
  ('random-5', 'ランダム地点5: 静岡県浜松市', 34.7108, 137.7261, 'random'),
  ('random-6', 'ランダム地点6: 大阪府堺市', 34.5733, 135.483, 'random'),
  ('random-7', 'ランダム地点7: 岡山県倉敷市', 34.585, 133.7717, 'random'),
  ('random-8', 'ランダム地点8: 愛媛県松山市', 33.8396, 132.7657, 'random'),
  ('random-9', 'ランダム地点9: 福岡県久留米市', 33.3191, 130.5083, 'random'),
  ('random-10', 'ランダム地点10: 鹿児島県霧島市', 31.7406, 130.763, 'random')
on conflict (id) do update
set
  name = excluded.name,
  lat = excluded.lat,
  lon = excluded.lon,
  type = excluded.type,
  updated_at = now();
