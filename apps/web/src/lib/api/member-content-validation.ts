import type { MemberResourceDetail } from "./generated/types.gen";
import { record } from "./auth-validation";
import { isPublicDocument, isResourceDetail } from "./public-validation";

// Only private, owner-authorized responses use this decoder. The public decoder
// still rejects every protected body. The document projection excludes solutions.
export function isMemberResourceDetail(value: unknown): value is MemberResourceDetail {
  if (!record(value) || !isResourceDetail({ ...value, document: null })) return false;
  return value.document === null || value.availability === "PUBLISHED" && isPublicDocument(value.document) && value.document.access === value.access;
}
