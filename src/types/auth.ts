export const USER_ROLES = [
  "administrador",
  "ventas",
  "inventario",
  "entregador",
  "finanzas",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export type Profile = {
  id: string;
  full_name: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AuthUser = {
  id: string;
  email: string | null;
};

export type SessionUser = AuthUser & {
  fullName: string | null;
  role: UserRole | null;
  isActive: boolean;
};

export type AdminUser = Profile & {
  email: string | null;
  auth_created_at: string | null;
  last_sign_in_at: string | null;
};
