-- EduManage Phase 2 — ID Card Studio foundation
-- Spec refs: Section 33 (ID Card Studio), Section 46 (id_card_templates), Section 45 (RLS)
-- Starter templates live in the frontend repo and are copied into this school-scoped
-- table. There are no null-school global rows.

insert into public.permissions (key, module, description) values
  ('id_cards.read', 'id_cards', 'View ID card templates'),
  ('id_cards.create', 'id_cards', 'Create ID card templates'),
  ('id_cards.update', 'id_cards', 'Edit ID card templates'),
  ('id_cards.delete', 'id_cards', 'Delete ID card templates')
on conflict (key) do nothing;

create table public.id_card_templates (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  name text not null,
  category text not null,
  description text,
  layout jsonb not null,
  source_starter_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  constraint id_card_templates_name_not_blank check (btrim(name) <> ''),
  constraint id_card_templates_category_check check (
    category in ('student', 'staff', 'visitor', 'other')
  ),
  constraint id_card_templates_school_name_key unique (school_id, name),
  constraint id_card_templates_starter_key_format check (
    source_starter_key is null
    or source_starter_key ~ '^[a-z0-9][a-z0-9-]{0,62}$'
  ),
  constraint id_card_templates_layout_size check (octet_length(layout::text) <= 100000)
);

create index id_card_templates_school_idx on public.id_card_templates (school_id);
create index id_card_templates_school_category_idx on public.id_card_templates (school_id, category);
create index id_card_templates_school_updated_idx on public.id_card_templates (school_id, updated_at desc);

comment on table public.id_card_templates is
  'School-owned ID card layouts (versioned JSON). System starters are copied into this table; school_id is always required.';

create or replace function public.assert_valid_id_card_layout(layout jsonb)
returns void
language plpgsql
immutable
set search_path = public
as $$
declare
  canvas jsonb;
  background jsonb;
  components jsonb;
  comp jsonb;
  seen_ids text[] := '{}';
  comp_id text;
  comp_type text;
  canvas_w numeric;
  canvas_h numeric;
  n_components int;
begin
  if layout is null or jsonb_typeof(layout) is distinct from 'object' then
    raise exception 'ID card layout must be a JSON object.';
  end if;

  if layout->'version' is null or jsonb_typeof(layout->'version') is distinct from 'number'
     or (layout->>'version')::numeric <> 1 then
    raise exception 'ID card layout.version must be 1.';
  end if;

  canvas := layout->'canvas';
  if canvas is null or jsonb_typeof(canvas) is distinct from 'object' then
    raise exception 'ID card layout.canvas is required.';
  end if;

  if jsonb_typeof(canvas->'widthMm') is distinct from 'number'
     or jsonb_typeof(canvas->'heightMm') is distinct from 'number' then
    raise exception 'ID card canvas widthMm and heightMm must be numbers.';
  end if;

  canvas_w := (canvas->>'widthMm')::numeric;
  canvas_h := (canvas->>'heightMm')::numeric;
  if canvas_w < 40 or canvas_w > 120 or canvas_h < 40 or canvas_h > 120 then
    raise exception 'ID card canvas size must be between 40mm and 120mm.';
  end if;

  background := canvas->'background';
  if background is null or jsonb_typeof(background) is distinct from 'object' then
    raise exception 'ID card canvas.background is required.';
  end if;

  if background->>'type' not in ('solid', 'linear-gradient') then
    raise exception 'ID card background.type must be solid or linear-gradient.';
  end if;

  if background->>'color' is null or background->>'color' !~ '^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$' then
    raise exception 'ID card background.color must be a hex color.';
  end if;

  if background->>'type' = 'linear-gradient' then
    if background->>'gradientFrom' is null
       or background->>'gradientFrom' !~ '^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$'
       or background->>'gradientTo' is null
       or background->>'gradientTo' !~ '^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$' then
      raise exception 'Gradient backgrounds require hex gradientFrom and gradientTo.';
    end if;
  end if;

  components := layout->'components';
  if components is null or jsonb_typeof(components) is distinct from 'array' then
    raise exception 'ID card layout.components must be an array.';
  end if;

  n_components := jsonb_array_length(components);
  if n_components < 1 or n_components > 40 then
    raise exception 'ID card layouts must have between 1 and 40 components.';
  end if;

  for comp in select value from jsonb_array_elements(components)
  loop
    if jsonb_typeof(comp) is distinct from 'object' then
      raise exception 'Each ID card component must be an object.';
    end if;

    comp_id := comp->>'id';
    if comp_id is null or comp_id !~ '^[a-zA-Z][a-zA-Z0-9_-]{0,63}$' then
      raise exception 'Each component needs a stable id (letter, then letters/digits/_/-).';
    end if;
    if comp_id = any (seen_ids) then
      raise exception 'Duplicate component id: %', comp_id;
    end if;
    seen_ids := seen_ids || comp_id;

    if jsonb_typeof(comp->'xMm') is distinct from 'number'
       or jsonb_typeof(comp->'yMm') is distinct from 'number'
       or jsonb_typeof(comp->'widthMm') is distinct from 'number'
       or jsonb_typeof(comp->'heightMm') is distinct from 'number' then
      raise exception 'Component % must have numeric xMm, yMm, widthMm, and heightMm.', comp_id;
    end if;

    if (comp->>'widthMm')::numeric <= 0 or (comp->>'heightMm')::numeric <= 0 then
      raise exception 'Component % widthMm and heightMm must be positive.', comp_id;
    end if;

    if (comp->>'widthMm')::numeric > 120 or (comp->>'heightMm')::numeric > 120 then
      raise exception 'Component % exceeds the maximum size.', comp_id;
    end if;

    comp_type := comp->>'type';
    if comp_type not in ('text', 'logo', 'photo', 'qr', 'shape') then
      raise exception 'Component % has unsupported type %.', comp_id, coalesce(comp_type, 'null');
    end if;

    if comp_type = 'text' then
      if jsonb_typeof(comp->'fontSizeMm') is distinct from 'number'
         or (comp->>'fontSizeMm')::numeric < 1
         or (comp->>'fontSizeMm')::numeric > 20 then
        raise exception 'Text component % needs fontSizeMm between 1 and 20.', comp_id;
      end if;
      if comp->>'color' is null
         or comp->>'color' !~ '^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$' then
        raise exception 'Text component % needs a hex color.', comp_id;
      end if;
      if comp ? 'field'
         and coalesce(comp->>'field', '') !~ '^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*){0,4}$' then
        raise exception 'Text component % has an invalid field path.', comp_id;
      end if;
      if (comp->>'field' is null or btrim(comp->>'field') = '')
         and (comp->>'text' is null) then
        raise exception 'Text component % needs a field or text value.', comp_id;
      end if;
    elsif comp_type = 'shape' then
      if coalesce(comp->>'shape', '') not in ('rect', 'rounded-rect', 'circle', 'ellipse', 'line') then
        raise exception 'Shape component % needs a valid shape kind.', comp_id;
      end if;
    elsif comp_type in ('logo', 'photo') then
      if comp ? 'shape' and coalesce(comp->>'shape', '') not in ('rect', 'rounded', 'circle') then
        raise exception 'Component % photo/logo shape is invalid.', comp_id;
      end if;
    elsif comp_type = 'qr' then
      if comp ? 'field'
         and coalesce(comp->>'field', '') !~ '^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*){0,4}$' then
        raise exception 'QR component % has an invalid field path.', comp_id;
      end if;
    end if;
  end loop;
end;
$$;

comment on function public.assert_valid_id_card_layout(jsonb) is
  'Rejects ID card layout JSON that does not match the v1 contract (docs/conventions/ID_CARD_LAYOUT.md).';

create or replace function public.enforce_id_card_template_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_valid_id_card_layout(new.layout);

  if tg_op = 'UPDATE' and new.school_id is distinct from old.school_id then
    raise exception 'school_id cannot be changed.';
  end if;

  new.name := btrim(new.name);
  new.category := btrim(new.category);
  if new.description is not null then
    new.description := btrim(new.description);
    if new.description = '' then
      new.description := null;
    end if;
  end if;

  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.updated_by := auth.uid();
    new.created_at := now();
    new.updated_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_by := auth.uid();
    new.updated_at := now();
  end if;

  return new;
end;
$$;

create trigger id_card_templates_enforce_row
  before insert or update on public.id_card_templates
  for each row execute function public.enforce_id_card_template_row();

alter table public.id_card_templates enable row level security;

create policy id_card_templates_select on public.id_card_templates
  for select
  using (public.is_school_member(school_id));

create policy id_card_templates_insert on public.id_card_templates
  for insert
  with check (
    public.has_permission(school_id, 'id_cards.create')
    and not public.is_school_read_only(school_id)
  );

create policy id_card_templates_update on public.id_card_templates
  for update
  using (public.has_permission(school_id, 'id_cards.update'))
  with check (
    public.has_permission(school_id, 'id_cards.update')
    and not public.is_school_read_only(school_id)
  );

create policy id_card_templates_delete on public.id_card_templates
  for delete
  using (
    public.has_permission(school_id, 'id_cards.delete')
    and not public.is_school_read_only(school_id)
  );
