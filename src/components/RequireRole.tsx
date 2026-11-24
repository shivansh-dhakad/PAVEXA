import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { ROLE_HOME, useSession, type Role } from "../lib/auth";

export default function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const session = useSession();
  if (!session) return <Navigate to={`/login?role=${role}`} replace />;
  if (session.role !== role) return <Navigate to={ROLE_HOME[session.role]} replace />;
  return <>{children}</>;
}
