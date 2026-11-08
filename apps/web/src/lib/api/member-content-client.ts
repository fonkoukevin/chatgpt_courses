import type { Locale } from "../i18n/locales";
import { matchingResource, readResourceJson, resourceId as id } from "./resource-http";
import { isMemberResourceDetail } from "./member-content-validation";

export function getMemberResource(resourceId: string, versionId: string, locale: Locale) {
  if (locale !== "fr" && locale !== "en") throw new Error("Invalid member content locale.");
  const resource = id(resourceId), version = id(versionId);
  return readResourceJson(`/me/resources/${resource}/versions/${version}?locale=${locale}`, matchingResource(isMemberResourceDetail, (value) => value.resourceId === resourceId && value.versionId === versionId && value.locale === locale));
}
