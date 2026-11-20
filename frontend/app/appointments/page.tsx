"use client";

import Link from "next/link";
import { useState } from "react";
import { CancelDialog, RescheduleDialog } from "@/components/AppointmentDialogs";
import { LiveRegion, useToast } from "@/components/Toast";
import {
  type Appointment,
  type AppointmentStatus,
  listAppointments,
} from "@/lib/api";
import { formatDate, formatTimeRange } from "@/lib/format";
import { useLoader } from "@/lib/use-loader";
import {
  EmptyState,
  ErrorState,
  Skeleton,
  StatusTag,
  btnPrimary,
  btnSecondary,
  btnDanger,
  eyebrowClass,
  panelClass,
} from "@/components/ui";

type TabId = "upcoming" | "past" | "cancelled";

const TABS: {
  id: TabId;
  label: string;
  statuses: AppointmentStatus[];
  empty: { title: string; body: string };
}[] = [
  {
    id: "upcoming",
    label: "Upcoming",
    statuses: ["booked"],
    empty: {
      title: "No upcoming visits",
      body: "Book a visit with one of our doctors to see it here.",
    },
  },
  {
    id: "past",
    label: "Past",
    statuses: ["completed", "no_show"],
    empty: { title: "No past visits", body: "Completed visits will appear here." },
  },
  {
    id: "cancelled",
    label: "Cancelled",
    statuses: ["cancelled"],
    empty: { title: "No cancelled visits", body: "Visits you cancel will appear here." },
  },
];

type DialogState = { kind: "reschedule" | "cancel"; appointment: Appointment } | null;

const HEADERS = ["Doctor", "Specialty", "Date", "Time", "Reason", "Status"];

export default function AppointmentsPage() {
  const { state, refresh, retry } = useLoader(listAppointments);
  const { message: toast, show: showToast } = useToast();
  const [tab, setTab] = useState<TabId>("upcoming");
  const [dialog, setDialog] = useState<DialogState>(null);

  function finish(message: string) {
    setDialog(null);
    showToast(message);
    refresh();
  }

  const activeTab = TABS.find((item) => item.id === tab) ?? TABS[0];

  return (
    <div>
      <p className={eyebrowClass}>Appointments</p>
      <h1 className="font-serif text-[clamp(2.25rem,4vw,3.25rem)] leading-[1.1] font-normal tracking-[-0.03em]">
        Your visits
      </h1>

      <div role="tablist" aria-label="Appointment groups" className="mt-8 flex gap-1 border-b border-line">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls="appointments-panel"
            onClick={() => setTab(item.id)}
            className={`min-h-11 border-b-2 px-4 text-sm ${
              tab === item.id
                ? "border-accent font-medium text-ink"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id="appointments-panel"
        aria-labelledby={`tab-${activeTab.id}`}
        className="mt-6"
      >
        {state.status === "loading" && (
          <div className={panelClass}>
            <Skeleton lines={5} />
          </div>
        )}
        {state.status === "error" && (
          <ErrorState
            title="Could not load appointments"
            message={state.error.message}
            onRetry={retry}
          />
        )}
        {state.status === "ready" && (
          <AppointmentTable
            appointments={state.data.filter((a) => activeTab.statuses.includes(a.status))}
            tab={activeTab}
            onReschedule={(appointment) => setDialog({ kind: "reschedule", appointment })}
            onCancel={(appointment) => setDialog({ kind: "cancel", appointment })}
          />
        )}
      </div>

      {dialog?.kind === "reschedule" && (
        <RescheduleDialog
          key={`reschedule-${dialog.appointment.id}`}
          appointment={dialog.appointment}
          onClose={() => setDialog(null)}
          onDone={(message) => finish(message)}
        />
      )}
      {dialog?.kind === "cancel" && (
        <CancelDialog
          key={`cancel-${dialog.appointment.id}`}
          appointment={dialog.appointment}
          onClose={() => setDialog(null)}
          onDone={(message) => finish(message)}
        />
      )}

      <LiveRegion message={toast} />
    </div>
  );
}

function AppointmentTable({
  appointments,
  tab,
  onReschedule,
  onCancel,
}: {
  appointments: Appointment[];
  tab: (typeof TABS)[number];
  onReschedule: (appointment: Appointment) => void;
  onCancel: (appointment: Appointment) => void;
}) {
  if (appointments.length === 0) {
    return (
      <div className={panelClass}>
        <EmptyState title={tab.empty.title} body={tab.empty.body}>
          {tab.id === "upcoming" && (
            <Link href="/doctors" className={btnPrimary}>
              Find a doctor
            </Link>
          )}
        </EmptyState>
      </div>
    );
  }

  const isUpcoming = tab.id === "upcoming";
  const headers = isUpcoming ? [...HEADERS, "Actions"] : HEADERS;

  return (
    <div className="overflow-x-auto rounded-[4px] border border-line bg-panel">
      <table className="w-full min-w-[760px] border-collapse text-left text-sm">
        <caption className="sr-only">{tab.label} visits</caption>
        <thead>
          <tr>
            {headers.map((header) => (
              <th
                key={header}
                scope="col"
                className="border-b border-line px-4 py-4 text-[10px] font-medium tracking-[0.06em] text-muted uppercase"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {appointments.map((appointment) => {
            const label = `${appointment.doctor.name}, ${formatDate(appointment.slot.starts_at)}`;
            return (
              <tr key={appointment.id} className="align-top">
                <td className="border-b border-line px-4 py-4 font-medium">{appointment.doctor.name}</td>
                <td className="border-b border-line px-4 py-4 text-muted">
                  {appointment.doctor.specialty}
                </td>
                <td className="border-b border-line px-4 py-4 whitespace-nowrap">
                  {formatDate(appointment.slot.starts_at)}
                </td>
                <td className="border-b border-line px-4 py-4 whitespace-nowrap tabular-nums">
                  {formatTimeRange(appointment.slot.starts_at, appointment.slot.ends_at)}
                </td>
                <td className="border-b border-line px-4 py-4 leading-6">{appointment.reason}</td>
                <td className="border-b border-line px-4 py-4">
                  <StatusTag status={appointment.status} />
                </td>
                {isUpcoming && (
                  <td className="border-b border-line px-4 py-4">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        aria-label={`Reschedule ${label}`}
                        onClick={() => onReschedule(appointment)}
                        className={btnSecondary}
                      >
                        Reschedule
                      </button>
                      <button
                        type="button"
                        aria-label={`Cancel ${label}`}
                        onClick={() => onCancel(appointment)}
                        className={btnDanger}
                      >
                        Cancel
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
