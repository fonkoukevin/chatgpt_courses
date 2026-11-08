import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { AssetUploadCapabilities } from "../../apps/web/src/lib/api/generated/types.gen";
import { acceptedFile } from "../../apps/web/src/lib/assets/files";
import { safeNotificationsDestination, translateNotificationsDestination } from "../../apps/web/src/lib/notifications/routes";
import { safeReturnTo } from "../../apps/web/src/lib/auth/routes";

test("la sélection respecte formats disponibles et limites, sans débloquer PDF ni chemins actifs", () => {
  const policy: AssetUploadCapabilities = { enabled: true, unavailableReason: null, formats: [
    { contentType: "text/plain", extensions: [".txt"], kind: "FILE", maxBytes: 16, available: true, unavailableReason: null },
    { contentType: "application/pdf", extensions: [".pdf"], kind: "FILE", maxBytes: 16, available: false, unavailableReason: "VALIDATOR_UNAVAILABLE" },
  ], maxFileBytes: 16, maxFilesPerProject: 2, maxBytesPerProject: 32, uploadTtlSeconds: 300, downloadTtlSeconds: 60 };
  const text = { name: "Mon travail.TXT", size: 16, type: "text/plain" };
  assert.equal(acceptedFile(text, policy)?.contentType, "text/plain");
  assert.equal(acceptedFile({ ...text, type: "" }, policy)?.contentType, "text/plain");
  for (const file of [{ ...text, size: 17 }, { ...text, size: 0 }, { ...text, name: "../private.txt" }, { ...text, name: "folder\\private.txt" }, { ...text, name: "text\0.txt" }, { ...text, name: "text.txt", type: "text/html" }, { name: "document.pdf", size: 8, type: "application/pdf" }]) assert.equal(acceptedFile(file, policy), null);
  assert.equal(acceptedFile(text, { ...policy, enabled: false }), null);
});

test("le retour opérateur ne permet ni redirection externe ni paramètre de reprise arbitraire", () => {
  const valid = "/fr/admin/notifications?status=INDETERMINATE&page=2&pageSize=10";
  assert.equal(safeNotificationsDestination(valid, "fr"), valid);
  assert.equal(safeReturnTo(valid, "fr"), valid);
  assert.equal(translateNotificationsDestination(valid, "en"), "/en/admin/notifications?status=INDETERMINATE&page=2&pageSize=10");
  for (const value of ["https://example.invalid/fr/admin/notifications", "http://[", "//example.invalid/fr/admin/notifications", "/fr/admin/notifications/../content", "/fr/admin/notifications%3fstatus=SENT", "/fr/admin/notifications?status=SENT&status=DEAD", "/fr/admin/notifications?page=1000001", "/fr/admin/notifications?pageSize=0", "/fr/admin/notifications?returnTo=https%3A%2F%2Fexample.invalid", "/fr/admin/notifications#token=secret"]) assert.equal(safeNotificationsDestination(value, "fr"), null);
  assert.equal(safeNotificationsDestination(valid, "en"), null);
});
