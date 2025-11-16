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
  situacao text null,
  etapas_reproducao text null,
  frequencia text null,
  informacoes_adicionais text null,
  escopo text null,
  objetivo text null,
  recursos_necessarios text null,
  solucao_orientacao text null,
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
        array[
          ('Triagem'::character varying)::text,
          ('Aguardando Aceite'::character varying)::text,
          ('Rejeitada'::character varying)::text,
          ('Em Analise'::character varying)::text,
          ('Aguardando o Cliente'::character varying)::text,
          ('Em Andamento'::character varying)::text,
          ('Em Teste'::character varying)::text,
          ('Resolvido'::character varying)::text
        ]
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

create table public.modulos (
  id serial not null,
  nome character varying(100) not null,
  created_at timestamp with time zone null default now(),
  constraint modulos_pkey primary key (id),
  constraint modulos_nome_key unique (nome)
) TABLESPACE pg_default;

ALTER TABLE public.pendencias 
ADD COLUMN situacao TEXT,
ADD COLUMN etapas_reproducao TEXT,
ADD COLUMN frequencia TEXT,
ADD COLUMN informacoes_adicionais TEXT,
ADD COLUMN escopo TEXT, -- Para implantação/atualização
ADD COLUMN objetivo TEXT, -- Para implantação/atualização
ADD COLUMN recursos_necessarios TEXT; -- Para implantação/atualização

-- Tabela de histórico de auditoria
CREATE TABLE public.pendencia_historicos (
  id BIGSERIAL PRIMARY KEY,
  pendencia_id VARCHAR(20) NOT NULL REFERENCES public.pendencias(id) ON DELETE CASCADE,
  usuario VARCHAR(100) NOT NULL,
  acao TEXT NOT NULL,
  campo_alterado VARCHAR(100),
  valor_anterior TEXT,
  valor_novo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de usuários/tecnicos
CREATE TABLE public.usuarios (
  id BIGSERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  ativo BOOLEAN DEFAULT TRUE,
  funcao VARCHAR(50) DEFAULT 'Tecnico',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inserir usuários baseados nos técnicos existentes
INSERT INTO public.usuarios (nome, email) VALUES
('Luiz Ricardo', 'luiz.ricardo@empresa.com'),
('Orisvando Alves', 'orisvando.alves@empresa.com'),
('Samuel Nojoza', 'samuel.nojoza@empresa.com'),
('Rian Duarte', 'rian.duarte@empresa.com'),
('Marcos George', 'marcos.george@empresa.com');

-- Atualizar a função do trigger para incluir triagem
CREATE OR REPLACE FUNCTION registrar_historico_pendencia()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.pendencia_historicos 
    (pendencia_id, usuario, acao, campo_alterado, valor_anterior, valor_novo)
    VALUES (
      NEW.id,
      NEW.tecnico,
      'Pendência criada e enviada para triagem',
      'status',
      NULL,
      'Triagem'
    );
  ELSIF TG_OP = 'UPDATE' THEN
    -- Status alterado
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO public.pendencia_historicos 
      (pendencia_id, usuario, acao, campo_alterado, valor_anterior, valor_novo)
      VALUES (
        NEW.id,
        NEW.tecnico,
        'Status alterado',
        'status',
        OLD.status,
        NEW.status
      );
    END IF;
    
    -- Técnico responsável alterado
    IF OLD.tecnico IS DISTINCT FROM NEW.tecnico THEN
      INSERT INTO public.pendencia_historicos 
      (pendencia_id, usuario, acao, campo_alterado, valor_anterior, valor_novo)
      VALUES (
        NEW.id,
        NEW.tecnico,
        'Responsável alterado',
        'tecnico',
        OLD.tecnico,
        NEW.tecnico
      );
    END IF;
    
    -- Prioridade alterada
    IF OLD.prioridade IS DISTINCT FROM NEW.prioridade THEN
      INSERT INTO public.pendencia_historicos 
      (pendencia_id, usuario, acao, campo_alterado, valor_anterior, valor_novo)
      VALUES (
        NEW.id,
        NEW.tecnico,
        'Prioridade alterada',
        'prioridade',
        OLD.prioridade,
        NEW.prioridade
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Função específica para registrar eventos de triagem
CREATE OR REPLACE FUNCTION registrar_historico_triagem()
RETURNS TRIGGER AS $$
BEGIN
  -- Inserção de nova triagem
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.pendencia_historicos 
    (pendencia_id, usuario, acao, campo_alterado, valor_anterior, valor_novo)
    VALUES (
      NEW.pendencia_id,
      NEW.tecnico_relato,
      'Triagem iniciada',
      'triagem',
      NULL,
      'Pendência relatada por ' || NEW.tecnico_relato
    );
    
  -- Atualização de triagem
  ELSIF TG_OP = 'UPDATE' THEN
    -- Técnico de triagem designado
    IF OLD.tecnico_triagem IS NULL AND NEW.tecnico_triagem IS NOT NULL THEN
      INSERT INTO public.pendencia_historicos 
      (pendencia_id, usuario, acao, campo_alterado, valor_anterior, valor_novo)
      VALUES (
        NEW.pendencia_id,
        NEW.tecnico_triagem,
        'Designado para triagem',
        'tecnico_triagem',
        OLD.tecnico_triagem,
        NEW.tecnico_triagem
      );
    END IF;
    
    -- Pendência aceita
    IF OLD.tecnico_responsavel IS NULL AND NEW.tecnico_responsavel IS NOT NULL THEN
      INSERT INTO public.pendencia_historicos 
      (pendencia_id, usuario, acao, campo_alterado, valor_anterior, valor_novo)
      VALUES (
        NEW.pendencia_id,
        NEW.tecnico_responsavel,
        'Pendência aceita para resolução',
        'tecnico_responsavel',
        OLD.tecnico_responsavel,
        NEW.tecnico_responsavel
      );
    END IF;
    
    -- Pendência rejeitada
    IF OLD.data_rejeicao IS NULL AND NEW.data_rejeicao IS NOT NULL THEN
      INSERT INTO public.pendencia_historicos 
      (pendencia_id, usuario, acao, campo_alterado, valor_anterior, valor_novo)
      VALUES (
        NEW.pendencia_id,
        NEW.tecnico_triagem,
        'Pendência rejeitada',
        'status_triagem',
        'Aguardando Aceite',
        'Rejeitada: ' || COALESCE(NEW.motivo_rejeicao, 'Sem motivo informado')
      );
    END IF;
    
    -- Redesignação de triagem
    IF OLD.tecnico_triagem IS NOT NULL AND NEW.tecnico_triagem IS NOT NULL 
       AND OLD.tecnico_triagem != NEW.tecnico_triagem THEN
      INSERT INTO public.pendencia_historicos 
      (pendencia_id, usuario, acao, campo_alterado, valor_anterior, valor_novo)
      VALUES (
        NEW.pendencia_id,
        NEW.tecnico_triagem,
        'Triagem redesignada',
        'tecnico_triagem',
        OLD.tecnico_triagem,
        NEW.tecnico_triagem
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Tabela de triagem de pendências
CREATE TABLE public.pendencia_triagem (
  id BIGSERIAL PRIMARY KEY,
  pendencia_id VARCHAR(20) NOT NULL REFERENCES public.pendencias(id) ON DELETE CASCADE,
  tecnico_relato VARCHAR(100) NOT NULL, -- Quem recebeu o relato do cliente
  tecnico_triagem VARCHAR(100), -- Quem fez a análise inicial
  tecnico_responsavel VARCHAR(100), -- Quem aceitou resolver
  data_triagem TIMESTAMPTZ,
  data_aceite TIMESTAMPTZ,
  data_rejeicao TIMESTAMPTZ,
  motivo_rejeicao TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Status mais específicos
ALTER TABLE public.pendencias 
DROP CONSTRAINT pendencias_status_check;

ALTER TABLE public.pendencias 
ADD CONSTRAINT pendencias_status_check CHECK (
  (status)::text = ANY (
    (
      ARRAY[
        'Triagem'::character varying,
        'Aguardando Aceite'::character varying,
        'Rejeitada'::character varying,
        'Em Andamento'::character varying,
        -- constraint/lista de status válidos (ajuste de rótulo)
        'Aguardando Teste'::character varying,
        'Resolvido'::character varying
      ]
    )::text[]
  )
);

-- Trigger para histórico de triagem
CREATE TRIGGER trigger_historico_triagem
  AFTER INSERT OR UPDATE ON public.pendencia_triagem
  FOR EACH ROW EXECUTE FUNCTION registrar_historico_triagem();
  
ALTER TABLE public.usuarios ADD COLUMN senha VARCHAR(5);