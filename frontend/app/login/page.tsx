"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { eyebrowClass, headingClass, panelClass } from "@/components/ui";
import { demoLogin, type Role, toApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const ROLES: { role: Role; title: string; description: string }[] = [
  {
    role: "patient",
    title: "Patient",
    description: "See your own visits, book new ones and read clinic guides.",
  },
  {
    role: "receptionist",
    title: "Receptionist",
    description: "See all visits, book and change them for patients, and open Insights.",
  },
  {
    role: "admin",
    title: "Clinic Admin",
    description: "Full staff access, including Insights and clinic-wide schedules.",
  },
];

export default function LoginPage() {
  const router = useRouter();
  const { state, setUser } = useAuth();
  const [pending, setPending] = useState<Role | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (state.status === "authed") router.replace("/");
  }, [state.status, router]);

  async function signIn(role: Role) {
    setPending(role);
    setError(null);
    try {
      const user = await demoLogin(role);
      setUser(user);
      router.push("/");
    } catch (err) {
      setError(toApiError(err).message);
      setPending(null);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center px-5 py-12">
      <p className={eyebrowClass}>Demo access</p>
      <h1 className="font-serif text-[clamp(2.25rem,4vw,3.5rem)] leading-[1.1] font-normal tracking-[-0.03em]">
        Choose a role to explore Terra
      </h1>
      <p className="mt-4 max-w-xl text-sm leading-7 text-muted">
        Demo sessions use synthetic data. Pick the view you want to see. You can switch roles at
        any time from the header.
      </p>

      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {ROLES.map((item) => {
          const busy = pending === item.role;
          return (
            <button
              key={item.role}
              type="button"
              onClick={() => signIn(item.role)}
              disabled={pending !== null}
              aria-describedby={`role-${item.role}-desc`}
              className={`${panelClass} flex min-h-44 flex-col text-left transition hover:border-accent disabled:cursor-wait disabled:opacity-60`}
            >
              <span className={headingClass}>{item.title}</span>
              <span id={`role-${item.role}-desc`} className="mt-3 flex-1 text-sm leading-6 text-muted">
                {item.description}
              </span>
              <span className="mt-6 text-sm font-medium text-accent">
                {busy ? "Signing in..." : `Sign in as ${item.title}`}
              </span>
            </button>
          );
        })}
      </div>

      {error && (
        <p role="alert" className="mt-6 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
