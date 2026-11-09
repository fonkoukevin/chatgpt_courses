import type { AssetAcceptedFormat, AssetUploadCapabilities } from "../api/generated/types.gen";
import type { Locale } from "../i18n/locales";

export function fileSize(bytes: number, locale: Locale): string {
  const divisor = bytes >= 1024 * 1024 ? 1024 * 1024 : bytes >= 1024 ? 1024 : 1;
  const unit = divisor === 1 ? locale === "fr" ? "o" : bytes === 1 ? "byte" : "bytes" : divisor === 1024 ? locale === "fr" ? "Kio" : "KiB" : locale === "fr" ? "Mio" : "MiB";
  return `${new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-GB", { maximumFractionDigits: divisor === 1 ? 0 : 1 }).format(bytes / divisor)} ${unit}`;
}
export function acceptedFile(file: Pick<File, "name" | "type" | "size">, policy: AssetUploadCapabilities): AssetAcceptedFormat | null {
  if (!policy.enabled || !Number.isSafeInteger(file.size) || file.size <= 0 || file.name.length > 180 || /[\\/]/.test(file.name) || Array.from(file.name).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return null;
  return policy.formats.find((format) => format.available && file.size <= format.maxBytes && format.extensions.some((extension) => file.name.toLowerCase().endsWith(extension.toLowerCase()))
    && (!file.type || canonicalFileMime(file) === format.contentType)) ?? null;
}
export function canonicalFileMime(file: Pick<File, "name" | "type">): string {
  return /\.md$/i.test(file.name) && file.type === "text/markdown" ? "text/plain" : file.type;
}
