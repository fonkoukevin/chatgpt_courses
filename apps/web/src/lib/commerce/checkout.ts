export function isStripeCheckoutUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 4096 || value.includes("\\") || Array.from(value).some((character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127) || !/^https:\/\/checkout\.stripe\.com\/(?:c|g)\/pay\//.test(value)) return false;
  try { const url = new URL(value); return url.origin === "https://checkout.stripe.com" && !url.username && !url.password && /^\/(?:c|g)\/pay\//.test(url.pathname); } catch { return false; }
}
