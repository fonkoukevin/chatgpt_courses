export function isStripeCheckoutUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 4096 || value.includes("\\") || Array.from(value).some((character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127) || !value.startsWith("https://checkout.stripe.com/")) return false;
  try { const url = new URL(value); return url.origin === "https://checkout.stripe.com" && !url.username && !url.password; } catch { return false; }
}
