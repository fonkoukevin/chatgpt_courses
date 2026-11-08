export function mediaTime(value: number): string {
  const seconds = Math.max(0, Math.floor(value)), hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds % 3600 / 60), rest = seconds % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}` : `${minutes}:${String(rest).padStart(2, "0")}`;
}
export function mediaPosition(value: number, duration: number): number {
  return Math.min(duration, Math.round(Math.min(duration, Math.max(0, Number.isFinite(value) ? value : 0)) * 1000) / 1000);
}
