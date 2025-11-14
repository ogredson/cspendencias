create table public.pendencias (
  id character varying(20) not null default (
    'ID-'::text || lpad(
      (nextval('pendencias_id_seq'::regclass))::text,
      5,
      '0'::text
    )
  ),
  modulo_id integer not null,
  tipo character varying(20) not null,
  cliente_id bigint null,
  descricao text not null,
  tecnico character varying(100) not null,
  data_relato date not null,
  previsao_conclusao date null,
  prioridade character varying(20) not null,
  status character varying(50) not null,
  dias_pendentes integer null default 0,
  link_trello text null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint pendencias_pkey primary key (id),
  constraint pendencias_cliente_id_fkey foreign KEY (cliente_id) references clientes (id_cliente),
  constraint pendencias_modulo_id_fkey foreign KEY (modulo_id) references modulos (id),
  constraint pendencias_prioridade_check check (
    (
      (prioridade)::text = any (
        (
          array[
            'Critica'::character varying,
            'Alta'::character varying,
            'Media'::character varying,
            'Baixa'::character varying
          ]
        )::text[]
      )
    )
  ),
  constraint pendencias_status_check check (
    (
      (status)::text = any (
        (
          array[
            'Pendente'::character varying,
            'Em Andamento'::character varying,
            'Resolvido'::character varying,
            'Em Analise'::character varying,
            'Em Teste'::character varying
          ]
        )::text[]
      )
    )
  ),
  constraint pendencias_tipo_check check (
    (
      (tipo)::text = any (
        (
          array[
            'Programação'::character varying,
            'Suporte'::character varying,
            'Implantação'::character varying,
            'Atualizacao'::character varying
          ]
        )::text[]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_pendencias_modulo on public.pendencias using btree (modulo_id) TABLESPACE pg_default;

create index IF not exists idx_pendencias_cliente on public.pendencias using btree (cliente_id) TABLESPACE pg_default;

create index IF not exists idx_pendencias_tecnico on public.pendencias using btree (tecnico) TABLESPACE pg_default;

create index IF not exists idx_pendencias_prioridade on public.pendencias using btree (prioridade) TABLESPACE pg_default;

create index IF not exists idx_pendencias_status on public.pendencias using btree (status) TABLESPACE pg_default;

create index IF not exists idx_pendencias_data_relato on public.pendencias using btree (data_relato) TABLESPACE pg_default;

create index IF not exists idx_pendencias_previsao on public.pendencias using btree (previsao_conclusao) TABLESPACE pg_default;

create trigger update_pendencias_updated_at BEFORE
update on pendencias for EACH row
execute FUNCTION update_updated_at_column ();