"use client";

import { useRef, useState } from "react";
import { SlotPicker } from "@/components/SlotPicker";
import { LiveRegion, useToast } from "@/components/Toast";
import {
  EmptyState,
  ErrorState,
  Skeleton,
  btnPrimary,
  btnSecondary,
  eyebrowClass,
  headingClass,
  panelClass,
} from "@/components/ui";
import {
  type ApiError,
  type Doctor,
  type Slot,
  bookAppointment,
  getDoctorSlots,
  getDoctors,
  toApiError,
} from "@/lib/api";
import { formatDate, formatTime, initials } from "@/lib/format";
import { useLoader } from "@/lib/use-loader";

type SlotState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; error: ApiError }
  | { status: "ready"; slots: Slot[] };

type BookingState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "booked"; message: string }
  | { status: "error"; message: string };

export default function DoctorsPage() {
  const { state, retry } = useLoader(getDoctors);
  const { message: toast, show: showToast } = useToast();
  const [selected, setSelected] = useState<Doctor | null>(null);
  const [slotState, setSlotState] = useState<SlotState>({ status: "idle" });
  const [slotId, setSlotId] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [booking, setBooking] = useState<BookingState>({ status: "idle" });
  // Ignores responses from a slot request that a newer click has overtaken.
  const requestSeq = useRef(0);

  async function loadSlots(doctor: Doctor) {
    const seq = ++requestSeq.current;
    setSlotState({ status: "loading" });
    try {
      const slots = await getDoctorSlots(doctor.id);
      if (seq === requestSeq.current) setSlotState({ status: "ready", slots });
    } catch (err) {
      if (seq === requestSeq.current) {
        setSlotState({ status: "error", error: toApiError(err) });
      }
    }
  }

  function checkAvailability(doctor: Doctor) {
    setSelected(doctor);
    setSlotId(null);
    setBooking({ status: "idle" });
    void loadSlots(doctor);
  }

  async function book(doctor: Doctor) {
    if (slotId === null) return;
    setBooking({ status: "submitting" });
    try {
      const appointment = await bookAppointment({ slot_id: slotId, reason: reason.trim() });
      const message = `Booked with ${doctor.name} on ${formatDate(appointment.slot.starts_at)} at ${formatTime(appointment.slot.starts_at)}.`;
      setBooking({ status: "booked", message });
      showToast("Appointment booked.");
      setSlotId(null);
      setReason("");
      void loadSlots(doctor);
    } catch (err) {
      const apiError = toApiError(err);
      if (apiError.code === "slot_taken" || apiError.code === "slot_not_found") {
        setBooking({
          status: "error",
          message:
            apiError.code === "slot_taken"
              ? "That time was just taken. Pick another."
              : "That time is no longer available. Pick another.",
        });
        setSlotId(null);
        void loadSlots(doctor);
      } else {
        setBooking({ status: "error", message: apiError.message });
      }
    }
  }

  return (
    <div>
      <p className={eyebrowClass}>Doctors</p>
      <h1 className="font-serif text-[clamp(2.25rem,4vw,3.25rem)] leading-[1.1] font-normal tracking-[-0.03em]">
        Find a doctor
      </h1>
      <p className="mt-4 max-w-xl text-sm leading-7 text-muted">
        Choose a specialist, check the free times over the next two weeks and book a visit.
      </p>

      <div className="mt-10">
        {state.status === "loading" && (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className={panelClass}>
                <Skeleton lines={4} />
              </div>
            ))}
          </div>
        )}
        {state.status === "error" && (
          <ErrorState
            title="Could not load doctors"
            message={state.error.message}
            onRetry={retry}
          />
        )}
        {state.status === "ready" && state.data.length === 0 && (
          <EmptyState title="No doctors yet" body="The clinic has not listed any doctors." />
        )}
        {state.status === "ready" && state.data.length > 0 && (
          <ul className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {state.data.map((doctor) => {
              const isSelected = selected?.id === doctor.id;
              return (
                <li key={doctor.id}>
                  <article
                    className={`${panelClass} flex h-full flex-col ${isSelected ? "border-accent" : ""}`}
                  >
                    <div
                      aria-hidden="true"
                      className="mb-5 grid h-16 w-16 place-items-center rounded-full bg-soft font-serif text-xl text-accent"
                    >
                      {initials(doctor.name)}
                    </div>
                    <h2 className={headingClass}>{doctor.name}</h2>
                    <p className="mt-2 text-xs font-semibold tracking-widest text-accent uppercase">
                      {doctor.specialty}
                    </p>
                    <p className="mt-4 flex-1 text-sm leading-6 text-muted">{doctor.bio}</p>
                    <p className="mt-4 text-xs text-muted">{doctor.clinic.name}</p>
                    <button
                      type="button"
                      onClick={() => checkAvailability(doctor)}
                      className={`${isSelected ? btnPrimary : btnSecondary} mt-5 w-full`}
                    >
                      Check availability
                    </button>
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {selected && (
        <section aria-labelledby="booking-title" className={`${panelClass} mt-10`}>
          <p className={eyebrowClass}>Availability</p>
          <h2 id="booking-title" className={headingClass}>
            Book with {selected.name}
          </h2>

          {booking.status === "booked" && (
            <p role="status" className="mt-5 rounded-[3px] bg-soft p-4 text-sm text-accent">
              {booking.message}
            </p>
          )}

          <div className="mt-6">
            {slotState.status === "loading" && <Skeleton lines={4} />}
            {slotState.status === "error" && (
              <ErrorState
                message={slotState.error.message}
                onRetry={() => loadSlots(selected)}
              />
            )}
            {slotState.status === "ready" && slotState.slots.length === 0 && (
              <EmptyState
                title="No free times"
                body="There are no openings in the next 14 days. Try another doctor."
              />
            )}
            {slotState.status === "ready" && slotState.slots.length > 0 && (
              <>
                <SlotPicker
                  slots={slotState.slots}
                  selectedId={slotId}
                  onSelect={setSlotId}
                  disabled={booking.status === "submitting"}
                />
                <div className="mt-8 grid gap-2">
                  <label htmlFor="booking-reason" className="text-sm font-medium">
                    Reason for visit
                  </label>
                  <textarea
                    id="booking-reason"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    disabled={booking.status === "submitting"}
                    rows={4}
                    className="w-full resize-y rounded-[4px] border border-line bg-panel p-3 text-ink"
                  />
                </div>
                {booking.status === "error" && (
                  <p role="alert" className="mt-4 text-sm text-danger">
                    {booking.message}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => book(selected)}
                  disabled={slotId === null || booking.status === "submitting"}
                  className={`${btnPrimary} mt-6`}
                >
                  {booking.status === "submitting" ? "Booking..." : "Book appointment"}
                </button>
              </>
            )}
          </div>
        </section>
      )}

      <LiveRegion message={toast} />
    </div>
  );
}
