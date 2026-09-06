-- 065: documents — the DTS server's document layer lands in dash (2026-09-06).
-- One row per filed document linked to a load. Rows are created by the
-- server's ingest agent (service token) as it files documents into the
-- canonical tree; server_url points at files.dts-ops.co (tailnet-only).
-- Additive and rollback-safe: turning the agent off stops writes; dash
-- merely renders what exists.

CREATE TABLE IF NOT EXISTS public.documents (
  document_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  load_id uuid NOT NULL REFERENCES public.loads(load_id) ON DELETE CASCADE,
  doc_type varchar(40) NOT NULL,
  filename varchar(255) NOT NULL,
  server_url text NOT NULL,
  sha256 char(64) NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  -- the same bytes link to a load once — re-registration is a no-op
  CONSTRAINT documents_load_sha_unique UNIQUE (load_id, sha256)
);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_documents_load ON public.documents(load_id);
CREATE INDEX IF NOT EXISTS idx_documents_user ON public.documents(user_id);
