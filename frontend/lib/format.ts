import type { Slot } from "@/lib/api";

// Formatters use the browser's locale and time zone, so times show as local time.
const dateFormat = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

export function formatTime(iso: string): string {
  return timeFormat.format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}

export function formatTimeRange(startsAt: string, endsAt: string): string {
  return `${formatTime(startsAt)} to ${formatTime(endsAt)}`;
}

export interface SlotDay {
  key: string;
  label: string;
  slots: Slot[];
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

// Groups slots by local calendar day, earliest first.
export function groupSlotsByDay(slots: Slot[]): SlotDay[] {
  const ordered = [...slots].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const days = new Map<string, SlotDay>();
  for (const slot of ordered) {
    const date = new Date(slot.starts_at);
    const key = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    let day = days.get(key);
    if (!day) {
      day = { key, label: formatDate(slot.starts_at), slots: [] };
      days.set(key, day);
    }
    day.slots.push(slot);
  }
  return [...days.values()];
}

export function initials(name: string): string {
  return name
    .replace(/^Dr\.?\s+/, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join("")
    .toUpperCase();
}
