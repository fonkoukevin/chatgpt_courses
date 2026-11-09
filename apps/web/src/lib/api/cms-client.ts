import { clearCsrfToken, getCsrfToken, type AuthResult } from "./auth-client";
import { isContentPage, isContentView, isDependencies, isReadiness, isRevisionPage, isUuid } from "./cms-validation";
import { decodeCmsResponse } from "./cms-response";
import type { ArchiveContent, ContentView, CreateContent, CreateTranslation, DuplicateContent, ListContentsData, NewVersion, PublishContent, RenameContentSlug, ReplaceComposition, SaveMetadata, SaveRevision, TransitionContent } from "./generated/types.gen";

export type ContentQuery = NonNullable<ListContentsData["query"]>;
export function contentPath(id: string, action = ""): string {
  if (!isUuid(id) || !["", "/revisions", "/versions", "/duplicate", "/translations", "/transition", "/publish", "/archive", "/composition", "/metadata", "/slug", "/readiness", "/preview", "/dependencies"].includes(action)) throw new Error("Invalid content path.");
  return `/admin/contents/${id}${action}`;
}
export function contentQueryString(query: ContentQuery): string {
  const result = new URLSearchParams();
  for (const key of ["q", "kind", "state", "locale", "courseId", "verifiedBefore", "needsUpdate", "page", "size"] as const) {
    const value = query[key];
    if (value !== undefined && value !== null && value !== "") result.set(key, String(value));
  }
  return result.toString();
}
async function request<T>(path: string, decode: (value: unknown) => value is T, init: RequestInit = {}, status = 200): Promise<AuthResult<T>> {
  const timer = new AbortController();
  const timeout = setTimeout(() => timer.abort(), 35000);
  try {
    const response = await fetch(`/api/v1${path}`, { ...init, credentials: "same-origin", cache: "no-store", redirect: "error", signal: timer.signal,
      headers: { Accept: "application/json, application/problem+json", ...init.headers } });
    return await decodeCmsResponse(response, decode, status);
  } catch { return { ok: false, error: { kind: "unavailable" } }; }
  finally { clearTimeout(timeout); }
}
async function mutate(path: string, body: unknown, etag?: string, status = 200, method = "POST", accountContext?: string): Promise<AuthResult<ContentView>> {
  const token = await getCsrfToken();
  if (!token.ok) return token;
  const result = await request(path, isContentView, { method, body: JSON.stringify(body), headers: {
    "Content-Type": "application/json", [token.data.headerName]: token.data.token, ...(etag ? { "If-Match": etag } : {}), ...(accountContext ? { "X-Account-Context": accountContext } : {}),
  } }, status);
  if (!result.ok && [401, 403].includes(result.error.status ?? 0)) { clearCsrfToken(); await getCsrfToken(); }
  return result;
}
export function listContents(query: ContentQuery) { return request(`/admin/contents?${contentQueryString(query)}`, isContentPage); }
export function getContent(id: string) { return request(contentPath(id), isContentView); }
export function createContent(body: CreateContent) { return mutate("/admin/contents", body, undefined, 201); }
export function saveContentRevision(id: string, etag: string, body: SaveRevision) { return mutate(contentPath(id, "/revisions"), body, etag); }
export function saveContentMetadata(id: string, etag: string, body: SaveMetadata) { return mutate(contentPath(id, "/metadata"), body, etag, 200, "PUT"); }
export async function renameContentSlug(id: string, etag: string, body: RenameContentSlug, accountContext: string): Promise<AuthResult<ContentView>> {
  if (!isUuid(id) || !isUuid(accountContext) || !new RegExp(`^"content-${id}-r(0|[1-9][0-9]*)"$`).test(etag)
    || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.slug) || body.slug.length > 180 || !body.reason.trim() || [...body.reason].length > 1000) throw new Error("Invalid public address change.");
  const revision = Number(etag.match(/-r([0-9]+)"$/)![1]);
  if (!Number.isSafeInteger(revision)) throw new Error("Invalid content revision.");
  const result = await mutate(contentPath(id, "/slug"), body, etag, 200, "PATCH", accountContext);
  if (result.ok && (result.data.id !== id || result.data.slug !== body.slug || result.data.revision < revision)) return { ok: false, error: { kind: "invalid-response", status: result.status } };
  return result;
}
export function createContentVersion(id: string, etag: string, body: NewVersion) { return mutate(contentPath(id, "/versions"), body, etag, 201); }
export function duplicateContent(id: string, etag: string, body: DuplicateContent) { return mutate(contentPath(id, "/duplicate"), body, etag, 201); }
export function createContentTranslation(id: string, etag: string, body: CreateTranslation) { return mutate(contentPath(id, "/translations"), body, etag, 201); }
export function transitionContent(id: string, etag: string, body: TransitionContent) { return mutate(contentPath(id, "/transition"), body, etag); }
export function publishContent(id: string, etag: string, body: PublishContent) { return mutate(contentPath(id, "/publish"), body, etag); }
export function archiveContent(id: string, etag: string, body: ArchiveContent) { return mutate(contentPath(id, "/archive"), body, etag); }
export function replaceContentComposition(id: string, etag: string, body: ReplaceComposition) { return mutate(contentPath(id, "/composition"), body, etag, 200, "PUT"); }
export function getContentReadiness(id: string) { return request(contentPath(id, "/readiness"), isReadiness); }
export function getContentDependencies(id: string) { return request(contentPath(id, "/dependencies"), isDependencies); }
export function listContentRevisions(id: string, page = 0) { return request(`${contentPath(id, "/revisions")}?page=${page}&size=20`, isRevisionPage); }
