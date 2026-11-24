/**
 * src/lib/auth.ts
 * Authentication supporting one-click Demo accounts and Supabase Auth.
 */
import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { User } from "@supabase/supabase-js";

export type Role = "citizen" | "authority" | "tester";

export interface Session {
  role: Role;
  id: string;
  name: string;
  email: string;
}

export const ROLE_HOME: Record<Role, string> = {
  citizen:   "/citizen",
  authority: "/authority",
  tester:    "/lab",
};

export const ROLE_LABEL: Record<Role, string> = {
  citizen:   "Citizen",
  authority: "Authority",
  tester:    "Model tester",
};

export const DEMO_ACCOUNTS: Record<Role, Session> = {
  citizen: {
    role: "citizen",
    id: "demo-citizen-01",
    name: "Priya Sharma",
    email: "priya.sharma@example.com",
  },
  authority: {
    role: "authority",
    id: "demo-authority-01",
    name: "Rajesh Kumar (Mysuru Division)",
    email: "rajesh.kumar@nhai.gov.in",
  },
  tester: {
    role: "tester",
    id: "demo-tester-01",
    name: "Dr. Anand V (ML Engineer)",
    email: "anand.v@pavexa.ai",
  },
};

const STORAGE_KEY = "pavexa_demo_session";

// In-memory listeners for instantaneous React state updates
const listeners = new Set<(s: Session | null) => void>();

function notify(s: Session | null) {
  listeners.forEach((fn) => fn(s));
}

function getStoredDemoSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

function userToSession(user: User): Session {
  const meta = user.user_metadata ?? {};
  const role: Role = (meta.role as Role) ?? "citizen";
  return {
    role,
    id: user.id,
    name: meta.full_name ?? user.email?.split("@")[0] ?? "User",
    email: user.email ?? "",
  };
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export function useSession(): Session | null {
  const [session, setSession] = useState<Session | null>(() => getStoredDemoSession());

  useEffect(() => {
    // 1. Check Supabase first
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        const s = userToSession(data.session.user);
        setSession(s);
      } else {
        setSession(getStoredDemoSession());
      }
    });

    // 2. Listen for Supabase auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      if (s?.user) {
        setSession(userToSession(s.user));
      } else {
        setSession(getStoredDemoSession());
      }
    });

    // 3. Listen for internal demo login changes
    const onDemoChange = (s: Session | null) => setSession(s);
    listeners.add(onDemoChange);

    return () => {
      subscription.unsubscribe();
      listeners.delete(onDemoChange);
    };
  }, []);

  return session;
}

// ── Auth actions ─────────────────────────────────────────────────────────────

/**
 * Instant one-click demo login by role card.
 */
export function loginAsDemo(role: Role): Session {
  const acc = DEMO_ACCOUNTS[role];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(acc));
  } catch {}
  notify(acc);
  return acc;
}

/** Legacy signature alias */
export const loginAs = loginAsDemo;

/**
 * Sign in with email and password via Supabase.
 */
export async function login(email: string, password: string): Promise<Session> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  if (!data.user) throw new Error("Login failed — no user returned.");
  const s = userToSession(data.user);
  localStorage.removeItem(STORAGE_KEY);
  notify(s);
  return s;
}

/** Sign out the current user (clears demo session & Supabase auth). */
export async function logout(): Promise<void> {
  localStorage.removeItem(STORAGE_KEY);
  notify(null);
  try {
    await supabase.auth.signOut();
  } catch {}
}

/** Sign up a new user via Supabase. */
export async function signUp(
  email: string,
  password: string,
  fullName: string,
  role: Role = "citizen"
): Promise<void> {
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, role } },
  });
  if (error) throw new Error(error.message);
}
