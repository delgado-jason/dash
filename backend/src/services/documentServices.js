import { db } from "../../db/pool.js";
import { ValidationError, NotFoundError } from "../utils/error.js";

const DOC_COLUMNS =
  "document_id, load_id, doc_type, filename, server_url, sha256, uploaded_at";

const SHA_RE = /^[0-9a-f]{64}$/;
const DOC_TYPE_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
// Chips render as clickable links — only URLs on our own file host are
// accepted, so even a leaked service token can't plant a link to elsewhere.
// The trailing slash is the guard against files.dts-ops.co.evil.com, so it
// is enforced here rather than trusted to the env value.
const rawPrefix = process.env.DOCS_URL_PREFIX || "https://files.dts-ops.co/";
const DOCS_URL_PREFIX = rawPrefix.endsWith("/") ? rawPrefix : rawPrefix + "/";

export async function getDocumentsForLoad(user_id, load_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!load_id) throw new ValidationError("Missing load_id");
  const query = `
    SELECT ${DOC_COLUMNS}
    FROM documents
    WHERE user_id = $1 AND load_id = $2
    ORDER BY doc_type, uploaded_at;`;
  const result = await db.query(query, [user_id, load_id]);
  return result.rows;
}

// Called by the ingest agent (service token). Resolves the human-facing
// load number to the immutable load_id; identical bytes re-registering
// against the same load are a no-op (created: false).
export async function registerDocument(user_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const { load_number, doc_type, filename, server_url, sha256 } = data ?? {};
  if (!load_number || typeof load_number !== "string" || load_number.length > 20)
    throw new ValidationError("Bad load_number");
  if (!doc_type || !DOC_TYPE_RE.test(doc_type))
    throw new ValidationError("Bad doc_type");
  if (!filename || typeof filename !== "string" || filename.length > 255)
    throw new ValidationError("Bad filename");
  if (!server_url || typeof server_url !== "string" ||
      !server_url.startsWith(DOCS_URL_PREFIX) ||
      server_url.includes("/../") || server_url.length > 1000)
    throw new ValidationError("server_url must be on the DTS file host");
  if (!sha256 || !SHA_RE.test(sha256))
    throw new ValidationError("Bad sha256");

  const loadResult = await db.query(
    `SELECT load_id FROM loads WHERE user_id = $1 AND load_number = $2;`,
    [user_id, load_number],
  );
  if (loadResult.rowCount === 0)
    throw new NotFoundError(`No load with number ${load_number}`);
  const load_id = loadResult.rows[0].load_id;

  const insert = await db.query(
    `INSERT INTO documents (user_id, load_id, doc_type, filename, server_url, sha256)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (load_id, sha256) DO NOTHING
     RETURNING ${DOC_COLUMNS};`,
    [user_id, load_id, doc_type, filename, server_url, sha256],
  );
  if (insert.rowCount > 0) {
    return { document: insert.rows[0], created: true };
  }
  const existing = await db.query(
    `SELECT ${DOC_COLUMNS} FROM documents WHERE load_id = $1 AND sha256 = $2;`,
    [load_id, sha256],
  );
  if (existing.rowCount === 0) {
    // The conflicting row vanished between INSERT and SELECT (cascade
    // delete). A real failure the caller's audit log should record.
    throw new NotFoundError("Load disappeared during registration");
  }
  return { document: existing.rows[0], created: false };
}
