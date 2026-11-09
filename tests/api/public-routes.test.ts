import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { absolutePublicUrl, isPublicIndexingPath, localeIsIndexable, publicResourcePath } from "../../apps/web/src/lib/public/seo-policy";
import { isPublicActivityContext, isPublicPublicationPage } from "../../apps/web/src/lib/api/public-routes-validation";

test("les URL canoniques gardent la langue et refusent une destination externe ou ambiguë", () => {
  const path = publicResourcePath("COURSE", "en", "from-brief-to-proposal");
  assert.equal(absolutePublicUrl(path, "https://courses.invalid"), "https://courses.invalid/en/courses/from-brief-to-proposal");
  for (const path of ["//other.invalid/a", "https://other.invalid/a", "/\\other.invalid/a", "/fr\n", "/fr#token"]) assert.throws(() => absolutePublicUrl(path, "https://courses.invalid"));
  assert.throws(() => publicResourcePath("GUIDE", "fr", "../private"));
});

test("la publication d’une langue n’indexe ni la recette, ni les routes privées ou recherches", () => {
  const config = { environment: "production", publicOrigin: "https://courses.invalid", publishedLocales: ["fr"] as const };
  assert.equal(localeIsIndexable(config, "en"), false);
  assert.equal(isPublicIndexingPath("/fr/parcours/brief", "", config), true);
  for (const [path, query] of [["/en/courses/brief", ""], ["/fr/compte", ""], ["/fr/admin/content", ""], ["/fr/catalogue", "?q=brief"], ["/api/v1/me/profile", ""]]) assert.equal(isPublicIndexingPath(path, query, config), false);
  for (const environment of ["local", "test", "staging"]) assert.equal(isPublicIndexingPath("/fr", "", { ...config, environment }), false);
});

test("une projection de publication ne laisse passer ni secret ni équivalent sans auto-inclusion", () => {
  const item = { resourceId: randomUUID(), kind: "GUIDE", versionId: randomUUID(), versionNumber: 1, revisionId: randomUUID(), locale: "fr", slug: "brief", title: "Brief", summary: "Résumé", publishedAt: null, languages: [{ locale: "fr", slug: "brief" }] };
  const page = { items: [item], page: 0, pageSize: 100, total: 1 };
  assert.equal(isPublicPublicationPage(page), true);
  assert.equal(isPublicPublicationPage({ ...page, items: [{ ...item, document: { private: "body" } }] }), false);
  assert.equal(isPublicPublicationPage({ ...page, items: [{ ...item, languages: [{ locale: "en", slug: "brief-en" }] }] }), false);
  assert.equal(isPublicPublicationPage({ ...page, items: [{ ...item, languages: [item.languages[0], item.languages[0]] }] }), false);
});

test("un contexte déclaré publié exige les slugs exacts et une auto-inclusion cohérente", () => {
  const value = { courseResourceId: randomUUID(), courseVersionId: randomUUID(), activityResourceId: randomUUID(), activityVersionId: randomUUID(), locale: "fr", availability: "PUBLISHED", courseSlug: "course", activitySlug: "activity", languages: [{ locale: "fr", availability: "PUBLISHED", courseSlug: "course", activitySlug: "activity" }, { locale: "en", availability: "MISSING_TRANSLATION", courseSlug: null, activitySlug: "activity-en" }] };
  assert.equal(isPublicActivityContext(value), true);
  assert.equal(isPublicActivityContext({ ...value, courseSlug: null }), false);
  assert.equal(isPublicActivityContext({ ...value, languages: value.languages.map(language => ({ ...language, availability: "PUBLISHED" })) }), false);
  assert.equal(isPublicActivityContext({ ...value, ownerId: randomUUID() }), false);
});
