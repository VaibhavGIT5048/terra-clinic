// Typed client for the Terra backend. Shapes and routes follow docs/api-contract.md.
// This is the only frontend file that names the default API host.

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type Role = "patient" | "receptionist" | "admin";
export type AppointmentStatus = "booked" | "completed" | "cancelled" | "no_show";

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
}

export interface Clinic {
  id: number;
  name: string;
}

export interface Doctor {
  id: number;
  name: string;
  specialty: string;
  bio: string;
  clinic: Clinic;
}

export interface Slot {
  id: number;
  starts_at: string;
  ends_at: string;
}

export interface Appointment {
  id: number;
  status: AppointmentStatus;
  reason: string;
  patient: { id: number; name: string };
  doctor: { id: number; name: string; specialty: string };
  slot: Slot;
}

export interface ActivityItem {
  kind: string;
  text: string;
  at: string;
}

export interface Dashboard {
  user: User;
  next_appointment: Appointment | null;
  counts: { upcoming: number; completed: number; cancelled: number };
  recent_activity: ActivityItem[];
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  return new ApiError(0, "unknown", "Something went wrong. Please try again.");
}

async function errorFromResponse(response: Response): Promise<ApiError> {
  let code = "http_error";
  let message = `Request failed with status ${response.status}.`;
  if (response.status === 422) {
    code = "validation_error";
    message = "Some details were not accepted. Check the form and try again.";
  }
  try {
    const body: unknown = await response.json();
    const detail = (body as { detail?: unknown } | null)?.detail;
    if (detail && typeof detail === "object" && !Array.isArray(detail)) {
      const d = detail as { code?: unknown; message?: unknown };
      if (typeof d.code === "string") code = d.code;
      if (typeof d.message === "string") message = d.message;
    }
  } catch {
    // Non-JSON error body: keep the status-based defaults above.
  }
  return new ApiError(response.status, code, message);
}

interface RequestInit {
  method?: "GET" | "POST";
  body?: unknown;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const hasBody = init.body !== undefined;
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: init.method ?? "GET",
      credentials: "include",
      cache: "no-store",
      headers: hasBody ? { "Content-Type": "application/json" } : undefined,
      body: hasBody ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(
      0,
      "network_error",
      "Could not reach the clinic service. Check your connection and try again.",
    );
  }
  if (!response.ok) {
    throw await errorFromResponse(response);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export const getMe = () => request<User>("/api/auth/me");

export const demoLogin = (role: Role) =>
  request<User>("/api/auth/demo-login", { method: "POST", body: { role } });

export const logout = () => request<void>("/api/auth/logout", { method: "POST" });

export const getDashboard = () => request<Dashboard>("/api/dashboard");

export const getDoctors = () => request<Doctor[]>("/api/doctors");

export const getDoctorSlots = (doctorId: number, days = 14) =>
  request<Slot[]>(`/api/doctors/${doctorId}/slots?days=${days}`);

export const listAppointments = () => request<Appointment[]>("/api/appointments");

export const bookAppointment = (input: { slot_id: number; reason: string }) =>
  request<Appointment>("/api/appointments", { method: "POST", body: input });

export const rescheduleAppointment = (appointmentId: number, slotId: number) =>
  request<Appointment>(`/api/appointments/${appointmentId}/reschedule`, {
    method: "POST",
    body: { slot_id: slotId },
  });

export const cancelAppointment = (appointmentId: number) =>
  request<Appointment>(`/api/appointments/${appointmentId}/cancel`, { method: "POST" });

export interface Guide {
  slug: string;
  title: string;
  body: string;
}

export const getGuide = (slug: string) =>
  request<Guide>(`/api/guides/${encodeURIComponent(slug)}`);

export interface AssistantCitation {
  slug: string;
  title: string;
}

export type AssistantActionType = "book" | "cancel" | "reschedule";

export interface AssistantProposedAction {
  id: number;
  type: AssistantActionType;
  summary: string;
  params: Record<string, unknown>;
}

export interface AssistantReply {
  reply: string;
  citations: AssistantCitation[];
  proposed_action: AssistantProposedAction | null;
}

export const sendAssistantMessage = (message: string) =>
  request<AssistantReply>("/api/assistant/message", { method: "POST", body: { message } });

export const confirmAssistantAction = (actionId: number) =>
  request<{ status: "confirmed"; appointment: Appointment }>(
    `/api/assistant/actions/${actionId}/confirm`,
    { method: "POST" },
  );

export const dismissAssistantAction = (actionId: number) =>
  request<{ status: "dismissed" }>(`/api/assistant/actions/${actionId}/dismiss`, {
    method: "POST",
  });

export interface InsightsTotals {
  booked: number;
  completed: number;
  cancelled: number;
  no_show: number;
  cancellation_rate: number;
  no_show_rate: number;
}

export interface InsightsHistoryDay {
  day: string;
  booked: number;
  completed: number;
  cancelled: number;
  no_show: number;
}

export interface InsightsForecastPoint {
  day: string;
  predicted_booked: number;
}

export interface Insights {
  totals: InsightsTotals;
  window_days: number;
  history: InsightsHistoryDay[];
  forecast: {
    label: string;
    method: string;
    points: InsightsForecastPoint[];
  };
}

export const getInsights = () => request<Insights>("/api/insights");
