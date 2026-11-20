"use client";

import type { Slot } from "@/lib/api";
import { formatTime, groupSlotsByDay } from "@/lib/format";

interface SlotPickerProps {
  slots: Slot[];
  selectedId: number | null;
  onSelect: (slotId: number) => void;
  disabled?: boolean;
}

// Free slots grouped by local day. Each time is a toggle button.
export function SlotPicker({ slots, selectedId, onSelect, disabled = false }: SlotPickerProps) {
  const days = groupSlotsByDay(slots);
  return (
    <div className="space-y-6">
      {days.map((day) => {
        const headingId = `slot-day-${day.key}`;
        return (
          <div key={day.key} role="group" aria-labelledby={headingId}>
            <h3 id={headingId} className="mb-3 text-sm font-medium">
              {day.label}
            </h3>
            <div className="flex flex-wrap gap-2">
              {day.slots.map((slot) => {
                const selected = slot.id === selectedId;
                return (
                  <button
                    key={slot.id}
                    type="button"
                    aria-pressed={selected}
                    aria-label={`${day.label} at ${formatTime(slot.starts_at)}`}
                    disabled={disabled}
                    onClick={() => onSelect(slot.id)}
                    className={`min-h-11 min-w-[5.5rem] rounded-[3px] border px-3 text-sm tabular-nums transition ${
                      selected
                        ? "border-accent bg-accent text-on"
                        : "border-line bg-bg text-ink hover:border-accent"
                    }`}
                  >
                    {formatTime(slot.starts_at)}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
