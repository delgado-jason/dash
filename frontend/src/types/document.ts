// A document filed on the DTS server and linked to a load. Read-only in
// dash: rows are created by the server's ingest agent, never from the UI —
// the upload path is the DTS Inbox, and the server is the source of truth.
export interface LoadDocument {
  document_id: string;
  load_id: string;
  doc_type: string;
  filename: string;
  server_url: string;
  sha256: string;
  uploaded_at: string;
}
