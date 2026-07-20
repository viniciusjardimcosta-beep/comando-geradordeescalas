import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type UserStatus = "pendente" | "aprovado" | "bloqueado";
export type AppRole = "admin" | "user";
export type SubscriptionStatus = "trial" | "active" | "expired" | "canceled";
export type PlanType = "trial" | "mensal" | "semestral" | "anual";

export interface Profile {
  id: string;
  email: string;
  nome: string | null;
  status: UserStatus;
  trial_start_date: string | null;
  trial_end_date: string | null;
  subscription_status: SubscriptionStatus;
  subscription_end_date: string | null;
  plan_type: PlanType;
  password_temporary?: boolean;
  complimentary_access?: boolean;
  complimentary_access_reason?: string | null;
  complimentary_access_expires_at?: string | null;
}


interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: AppRole | null;
  loading: boolean;
  isAdmin: boolean;
  isApproved: boolean;
  hasAccess: boolean;
  trialDaysLeft: number | null;
  isTrial: boolean;
  isComplimentary: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function computeAccess(profile: Profile | null, isAdmin: boolean): { hasAccess: boolean; daysLeft: number | null; isTrial: boolean; isComplimentary: boolean } {
  if (!profile) return { hasAccess: false, daysLeft: null, isTrial: false, isComplimentary: false };
  if (isAdmin) return { hasAccess: true, daysLeft: null, isTrial: false, isComplimentary: false };
  const now = Date.now();
  if (profile.complimentary_access) {
    if (!profile.complimentary_access_expires_at || new Date(profile.complimentary_access_expires_at).getTime() > now) {
      return { hasAccess: true, daysLeft: null, isTrial: false, isComplimentary: true };
    }
  }
  if (profile.subscription_status === "active") {
    if (!profile.subscription_end_date || new Date(profile.subscription_end_date).getTime() > now) {
      return { hasAccess: true, daysLeft: null, isTrial: false, isComplimentary: false };
    }
  }
  if (profile.subscription_status === "trial" && profile.trial_end_date) {
    const end = new Date(profile.trial_end_date).getTime();
    const ms = end - now;
    if (ms > 0) {
      return { hasAccess: true, daysLeft: Math.ceil(ms / (1000 * 60 * 60 * 24)), isTrial: true, isComplimentary: false };
    }
  }
  return { hasAccess: false, daysLeft: 0, isTrial: profile.subscription_status === "trial", isComplimentary: false };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (userId: string) => {
    const [{ data: prof }, { data: roles }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, email, nome, status, trial_start_date, trial_end_date, subscription_status, subscription_end_date, plan_type, password_temporary")
        .eq("id", userId)
        .maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    setProfile(prof as Profile | null);
    const adminRow = roles?.find((r) => r.role === "admin");
    setRole(adminRow ? "admin" : roles && roles.length > 0 ? "user" : null);
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      if (sess?.user) {
        setLoading(true);
        setTimeout(() => {
          loadProfile(sess.user.id).finally(() => setLoading(false));
        }, 0);
      } else {
        setProfile(null);
        setRole(null);
        setLoading(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      setSession(sess);
      if (sess?.user) {
        loadProfile(sess.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const refresh = async () => {
    if (session?.user) await loadProfile(session.user.id);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setRole(null);
    setSession(null);
  };

  const isAdmin = role === "admin";
  const access = computeAccess(profile, isAdmin);

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    profile,
    role,
    loading,
    isAdmin,
    isApproved: profile?.status === "aprovado",
    hasAccess: access.hasAccess,
    trialDaysLeft: access.daysLeft,
    isTrial: access.isTrial,
    refresh,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de <AuthProvider>");
  return ctx;
}
