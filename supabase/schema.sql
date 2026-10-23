-- =========================================================
--  Cartable du professeur d'informatique — schéma PostgreSQL
--  À exécuter dans Supabase > SQL Editor > New query
-- ------------------------------------------------------------
--  Le script est idempotent : il peut être relancé sans risque,
--  sur une base neuve comme sur une base déjà utilisée.
--  Vos données ne sont jamais supprimées (seuls les doublons de
--  noms d'élèves dans une même classe sont fusionnés, voir 3.).
--  Les politiques RLS sont recalculées à chaque exécution.
--
--  Nouveautés de cette version :
--    * Table « students » : la liste des élèves est créée EN MÊME
--      TEMPS que la classe (fonction create_class).
--    * Table « attendance_marks » : chaque séance d'appel garde le
--      statut (P / A / R) de chaque élève → tableau d'historique.
--    * Fonction save_attendance : enregistre une séance en un seul
--      appel, sans doublon.
--    * Colonne materials.due_date : date limite des devoirs.
--
--  Principe de sécurité :
--    * Les ÉLÈVES n'ont aucun accès direct aux tables.
--      Ils passent par la fonction Edge « student-access »,
--      qui valide le code de classe (SHA-256).
--    * Le PROFESSEUR est identifié par auth.uid() (Supabase Auth)
--      et ne voit que ses propres classes et les données rattachées.
-- =========================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1. Classes
-- ------------------------------------------------------------
create table if not exists public.classes (
  id         uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 120),
  level      text not null,
  -- SHA-256 du code normalisé (majuscules, sans espaces)
  code_hash  text not null unique,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2. Élèves de la classe (créés avec la classe)
-- ------------------------------------------------------------
create table if not exists public.students (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references public.classes(id) on delete cascade,
  full_name  text not null check (char_length(full_name) between 1 and 120),
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 3. Ressources publiées
-- ------------------------------------------------------------
create table if not exists public.materials (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references public.classes(id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 200),
  kind       text not null check (kind in ('Cours','Devoir','Exercice','Ressource')),
  body       text not null default '',
  url        text,
  published  boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.materials add column if not exists due_date date;

-- ------------------------------------------------------------
-- 4. Journal d'appel : une ligne par séance…
-- ------------------------------------------------------------
create table if not exists public.attendance (
  id              uuid primary key default gen_random_uuid(),
  class_id        uuid not null references public.classes(id) on delete cascade,
  attendance_date date not null,
  entries         text not null,
  created_at      timestamptz not null default now()
);
-- Libellé facultatif de la séance (ex. « Séance 2 », « 10h-11h »)
alter table public.attendance add column if not exists session_label text not null default '';

-- … et une ligne par élève et par séance (P = présent, A = absent, R = retard)
create table if not exists public.attendance_marks (
  id            uuid primary key default gen_random_uuid(),
  attendance_id uuid not null references public.attendance(id) on delete cascade,
  student_id    uuid not null references public.students(id) on delete cascade,
  status        text not null check (status in ('P','A','R')),
  unique (attendance_id, student_id)
);

-- ------------------------------------------------------------
-- 5. Cahier de texte
-- ------------------------------------------------------------
create table if not exists public.lessons (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid not null references public.classes(id) on delete cascade,
  lesson_date date not null,
  title       text not null,
  content     text not null default '',
  homework    text not null default '',
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 6. Notes
-- ------------------------------------------------------------
create table if not exists public.grades (
  id           uuid primary key default gen_random_uuid(),
  class_id     uuid not null references public.classes(id) on delete cascade,
  student_name text not null,
  assessment   text not null,
  score        numeric(5,2) not null check (score >= 0),
  max_score    numeric(5,2) not null check (max_score > 0 and score <= max_score),
  remark       text not null default '',
  created_at   timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 7. Questions des élèves (écrites par la fonction Edge)
-- ------------------------------------------------------------
create table if not exists public.student_questions (
  id           uuid primary key default gen_random_uuid(),
  class_id     uuid not null references public.classes(id) on delete cascade,
  student_name text not null default 'Élève',
  question     text not null,
  created_at   timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 8. Travaux rendus (écrits par la fonction Edge)
-- ------------------------------------------------------------
create table if not exists public.submissions (
  id           uuid primary key default gen_random_uuid(),
  class_id     uuid not null references public.classes(id) on delete cascade,
  student_name text not null default 'Élève',
  title        text not null,
  answer       text not null,
  created_at   timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 9. Index
-- ------------------------------------------------------------
-- Un même nom ne peut apparaître qu'une fois dans une classe.
-- (Les éventuels doublons déjà présents sont d'abord fusionnés.)
delete from public.students a
  using public.students b
 where a.class_id = b.class_id
   and lower(a.full_name) = lower(b.full_name)
   and a.ctid > b.ctid;
create unique index if not exists uq_students_class_name on public.students (class_id, lower(full_name));

create index if not exists idx_students_class     on public.students (class_id, full_name);
create index if not exists idx_materials_class    on public.materials (class_id, kind, created_at desc);
create index if not exists idx_attendance_class   on public.attendance (class_id, attendance_date desc, created_at desc);
create index if not exists idx_marks_attendance   on public.attendance_marks (attendance_id);
create index if not exists idx_marks_student      on public.attendance_marks (student_id);
create index if not exists idx_lessons_class      on public.lessons (class_id, lesson_date desc);
create index if not exists idx_grades_class       on public.grades (class_id, created_at desc);
create index if not exists idx_grades_student     on public.grades (class_id, student_name);
create index if not exists idx_questions_class    on public.student_questions (class_id, created_at desc);
create index if not exists idx_submissions_class  on public.submissions (class_id, created_at desc);
create index if not exists idx_classes_teacher    on public.classes (teacher_id, created_at desc);

-- ------------------------------------------------------------
-- 10. Reprise de l'ancien journal d'appel (texte → tableau)
--     Les appels déjà enregistrés au format « Nom — Présent » sont
--     convertis pour les élèves retrouvés dans la liste de la classe.
--     Sans effet s'il n'y a rien à convertir.
-- ------------------------------------------------------------
insert into public.attendance_marks (attendance_id, student_id, status)
select distinct on (a.id, s.id)
       a.id, s.id,
       upper(left(btrim(split_part(l.line, ' — ', 2)), 1))
  from public.attendance a
 cross join lateral unnest(string_to_array(a.entries, E'\n')) as l(line)
  join public.students s
    on s.class_id = a.class_id
   and lower(s.full_name) = lower(btrim(split_part(l.line, ' — ', 1)))
 where upper(left(btrim(split_part(l.line, ' — ', 2)), 1)) in ('P','A','R')
   and not exists (select 1 from public.attendance_marks m where m.attendance_id = a.id)
on conflict (attendance_id, student_id) do nothing;

-- ------------------------------------------------------------
-- 11. Row Level Security
-- ------------------------------------------------------------
alter table public.classes           enable row level security;
alter table public.students          enable row level security;
alter table public.materials         enable row level security;
alter table public.attendance        enable row level security;
alter table public.attendance_marks  enable row level security;
alter table public.lessons           enable row level security;
alter table public.grades            enable row level security;
alter table public.student_questions enable row level security;
alter table public.submissions       enable row level security;

-- Un professeur gère uniquement ses propres classes
drop policy if exists "Teacher manages own classes" on public.classes;
create policy "Teacher manages own classes" on public.classes
  for all to authenticated
  using      (teacher_id = (select auth.uid()))
  with check (teacher_id = (select auth.uid()));

-- Anciens noms de politiques (versions précédentes du script)
drop policy if exists "Teacher manages materials in own classes"       on public.materials;
drop policy if exists "Teacher manages own materials in own classes"   on public.materials;

-- Tables rattachées directement à une classe
do $$
declare t text;
begin
  foreach t in array array['students','materials','attendance','lessons','grades','student_questions','submissions'] loop
    execute format('drop policy if exists "Teacher manages own %I" on public.%I', t, t);
    execute format(
      'create policy "Teacher manages own %I" on public.%I
         for all to authenticated
         using      (exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = (select auth.uid())))
         with check (exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = (select auth.uid())))',
      t, t);
  end loop;
end $$;

-- Statuts d'appel : rattachés à une séance, donc à une classe
drop policy if exists "Teacher manages own attendance_marks" on public.attendance_marks;
create policy "Teacher manages own attendance_marks" on public.attendance_marks
  for all to authenticated
  using (exists (select 1 from public.attendance a
                   join public.classes c on c.id = a.class_id
                  where a.id = attendance_id and c.teacher_id = (select auth.uid())))
  with check (exists (select 1 from public.attendance a
                        join public.classes c on c.id = a.class_id
                       where a.id = attendance_id and c.teacher_id = (select auth.uid())));

-- ------------------------------------------------------------
-- 12. Fonctions utilisées par le site
--     « security invoker » : elles s'exécutent avec les droits du
--     professeur connecté, donc soumises aux règles RLS ci-dessus.
-- ------------------------------------------------------------

-- Crée la classe ET sa liste d'élèves en une seule opération.
-- p_students : un nom par élément ; les vides et doublons sont ignorés.
create or replace function public.create_class(
  p_name      text,
  p_level     text,
  p_code_hash text,
  p_students  text[] default '{}'
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.classes (name, level, code_hash)
  values (btrim(p_name), p_level, p_code_hash)
  returning id into v_id;

  insert into public.students (class_id, full_name)
  select v_id, d.n
    from (
      select distinct on (lower(q.n)) q.n
        from (
          select left(btrim(regexp_replace(x, '\s+', ' ', 'g')), 120) as n
            from unnest(coalesce(p_students, '{}')) as x
        ) q
       where q.n <> ''
       order by lower(q.n), q.n
    ) d;

  return v_id;
end;
$$;

-- Enregistre (ou remplace) l'appel d'une séance.
-- p_marks : [{"student_id": "<uuid>", "status": "P" | "A" | "R"}, …]
-- Retourne l'identifiant de la séance. Le champ texte « entries » est
-- recalculé automatiquement (lisible dans les anciennes versions du site).
create or replace function public.save_attendance(
  p_class_id uuid,
  p_date     date,
  p_label    text,
  p_marks    jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id    uuid;
  v_label text := coalesce(btrim(p_label), '');
begin
  select a.id into v_id
    from public.attendance a
   where a.class_id = p_class_id
     and a.attendance_date = p_date
     and a.session_label = v_label
   order by a.created_at desc
   limit 1;

  if v_id is null then
    insert into public.attendance (class_id, attendance_date, session_label, entries)
    values (p_class_id, p_date, v_label, '')
    returning id into v_id;
  end if;

  delete from public.attendance_marks where attendance_id = v_id;

  insert into public.attendance_marks (attendance_id, student_id, status)
  select distinct on (s.id) v_id, s.id, m ->> 'status'
    from jsonb_array_elements(coalesce(p_marks, '[]'::jsonb)) as m
    join public.students s
      on s.id = (m ->> 'student_id')::uuid
     and s.class_id = p_class_id
   where m ->> 'status' in ('P','A','R');

  update public.attendance a
     set entries = coalesce((
           select string_agg(
                    s.full_name || ' — ' ||
                    case am.status when 'P' then 'Présent' when 'A' then 'Absent' else 'Retard' end,
                    E'\n' order by s.full_name)
             from public.attendance_marks am
             join public.students s on s.id = am.student_id
            where am.attendance_id = v_id), '')
   where a.id = v_id;

  return v_id;
end;
$$;

-- ------------------------------------------------------------
-- 13. Vue de synthèse : présences, absences et retards par élève
--     (facultative : utile pour vos propres requêtes dans Supabase)
-- ------------------------------------------------------------
create or replace view public.attendance_summary
with (security_invoker = true) as
select s.class_id,
       s.id        as student_id,
       s.full_name,
       count(m.id)                              as seances,
       count(*) filter (where m.status = 'P')   as presences,
       count(*) filter (where m.status = 'A')   as absences,
       count(*) filter (where m.status = 'R')   as retards
  from public.students s
  left join public.attendance_marks m on m.student_id = s.id
 group by s.class_id, s.id, s.full_name;

-- ------------------------------------------------------------
-- 14. Droits
--    - authenticated : CRUD sur ses propres données
--    - anon          : RIEN (les élèves passent par la fonction Edge)
-- ------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.classes           to authenticated;
grant select, insert, update, delete on public.students          to authenticated;
grant select, insert, update, delete on public.materials         to authenticated;
grant select, insert, update, delete on public.attendance        to authenticated;
grant select, insert, update, delete on public.attendance_marks  to authenticated;
grant select, insert, update, delete on public.lessons           to authenticated;
grant select, insert, update, delete on public.grades            to authenticated;
grant select, insert, update, delete on public.student_questions to authenticated;
grant select, insert, update, delete on public.submissions       to authenticated;
grant select on public.attendance_summary to authenticated;

revoke execute on function public.create_class(text, text, text, text[])  from public, anon;
revoke execute on function public.save_attendance(uuid, date, text, jsonb) from public, anon;
grant  execute on function public.create_class(text, text, text, text[])  to authenticated;
grant  execute on function public.save_attendance(uuid, date, text, jsonb) to authenticated;

-- Neutralise tout accès anonyme direct aux tables
revoke all on public.classes           from anon;
revoke all on public.students          from anon;
revoke all on public.materials         from anon;
revoke all on public.attendance        from anon;
revoke all on public.attendance_marks  from anon;
revoke all on public.lessons           from anon;
revoke all on public.grades            from anon;
revoke all on public.student_questions from anon;
revoke all on public.submissions       from anon;
revoke all on public.attendance_summary from anon;

-- Demande à l'API Supabase de recharger le schéma (nouvelles fonctions)
notify pgrst, 'reload schema';

-- =========================================================
--  Vérification (facultatif) : décommenter pour contrôler
-- =========================================================
-- select tablename, policyname, cmd, roles from pg_policies
--  where schemaname = 'public' order by tablename;
-- select * from public.attendance_summary limit 20;
