-- 同名神社（別地点）を許可するため、spots.name の一意制約を解除
-- 主キーは spots.id を引き続き利用する

do $$
declare
  constraint_name text;
begin
  select tc.constraint_name
    into constraint_name
  from information_schema.table_constraints tc
  join information_schema.constraint_column_usage ccu
    on tc.constraint_name = ccu.constraint_name
   and tc.table_schema = ccu.table_schema
  where tc.table_schema = 'public'
    and tc.table_name = 'spots'
    and tc.constraint_type = 'UNIQUE'
    and ccu.column_name = 'name'
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.spots drop constraint %I', constraint_name);
  end if;
end $$;

-- 文字列検索性能向上のため任意インデックスを追加
create index if not exists idx_spots_name on public.spots(name);
