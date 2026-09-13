alter table public.employees
  add column if not exists cbo_code text,
  add column if not exists cbo_title text,
  add column if not exists personal_qr_token text;

update public.employees
set personal_qr_token = encode(gen_random_bytes(24), 'hex')
where personal_qr_token is null;

alter table public.employees
  alter column personal_qr_token set default encode(gen_random_bytes(24), 'hex'),
  alter column personal_qr_token set not null;

alter table public.employees
  drop constraint if exists employees_cbo_code_format,
  add constraint employees_cbo_code_format
    check (cbo_code is null or cbo_code ~ '^[0-9]{6}$');

create unique index if not exists employees_personal_qr_token_idx
  on public.employees (personal_qr_token);

comment on column public.employees.cbo_code is
  'Código de seis dígitos da Classificação Brasileira de Ocupações.';
comment on column public.employees.cbo_title is
  'Título da ocupação selecionada no cadastro do colaborador.';
comment on column public.employees.personal_qr_token is
  'Identificador aleatório do QR individual. O registro só é aceito quando o QR pertence ao usuário autenticado.';
