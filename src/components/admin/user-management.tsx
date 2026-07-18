"use client";

import { useActionState } from "react";
import type { ReactNode } from "react";
import { KeyRound, Save, ShieldCheck, UserPlus, Users } from "lucide-react";

import {
  createUserAction,
  resetUserAccessAction,
  updateUserAction,
} from "@/lib/admin-users/actions";
import { getRoleLabel } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";
import { useActionToast } from "@/hooks/use-action-toast";
import type { AdminUser, UserRole } from "@/types/auth";
import { USER_ROLES } from "@/types/auth";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ActionState = {
  success: boolean;
  message?: string;
};

type UserManagementProps = {
  users: AdminUser[];
  currentUserId: string;
  error?: string;
  serviceRoleConfigured: boolean;
};

const initialState: ActionState = { success: false };

function NativeSelect({
  name,
  defaultValue,
  children,
}: {
  name: string;
  defaultValue?: string;
  children: ReactNode;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      className="flex h-10 w-full rounded-xl border border-input bg-white/75 px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
    >
      {children}
    </select>
  );
}

function FormMessage({ state }: { state: ActionState }) {
  if (!state.message) return null;

  return (
    <p
      className={cn(
        "rounded-xl px-3 py-2 text-sm",
        state.success ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700",
      )}
    >
      {state.message}
    </p>
  );
}

function UserStatusBadge({ active }: { active: boolean }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full",
        active
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-slate-100 text-slate-600",
      )}
    >
      {active ? "Activo" : "Inactivo"}
    </Badge>
  );
}

function RoleBadge({ role }: { role: UserRole }) {
  return (
    <Badge variant="outline" className="rounded-full border-slate-200 bg-white/80">
      {getRoleLabel(role)}
    </Badge>
  );
}

function formatDate(value: string | null) {
  if (!value) return "N/D";

  return new Intl.DateTimeFormat("es-BO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function CreateUserForm({ disabled }: { disabled: boolean }) {
  const [state, formAction, pending] = useActionState(createUserAction, initialState);
  useActionToast(state);

  return (
    <form action={formAction} className="space-y-4">
      <FormMessage state={state} />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <Label>Email</Label>
          <Input name="email" type="email" required placeholder="usuario@empresa.com" />
        </div>
        <div className="space-y-2">
          <Label>Nombre completo</Label>
          <Input name="full_name" required placeholder="Nombre del usuario" />
        </div>
        <div className="space-y-2">
          <Label>Rol</Label>
          <NativeSelect name="role" defaultValue="ventas">
            {USER_ROLES.map((role) => (
              <option key={role} value={role}>
                {getRoleLabel(role)}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={disabled || pending} className="rounded-xl">
          <UserPlus className="size-4" />
          {pending ? "Enviando..." : "Invitar usuario"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function EditUserForm({
  user,
  currentUserId,
  disabled,
}: {
  user: AdminUser;
  currentUserId: string;
  disabled: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateUserAction, initialState);
  useActionToast(state);
  const isCurrentUser = user.id === currentUserId;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={user.id} />
      <FormMessage state={state} />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <Label>Email</Label>
          <Input value={user.email ?? "Sin email visible"} disabled />
        </div>
        <div className="space-y-2">
          <Label>Nombre completo</Label>
          <Input name="full_name" defaultValue={user.full_name ?? ""} required />
        </div>
        <div className="space-y-2">
          <Label>Rol</Label>
          <NativeSelect name="role" defaultValue={user.role}>
            {USER_ROLES.map((role) => (
              <option key={role} value={role}>
                {getRoleLabel(role)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label>Estado</Label>
          <NativeSelect name="is_active" defaultValue={String(user.is_active)}>
            <option value="true">Activo</option>
            <option value="false">Inactivo</option>
          </NativeSelect>
        </div>
      </div>
      {isCurrentUser ? (
        <Alert>
          <ShieldCheck className="size-4" />
          <AlertTitle>Proteccion del usuario actual</AlertTitle>
          <AlertDescription>
            El servidor bloqueara cambios de tu propio rol o desactivacion de tu cuenta.
          </AlertDescription>
        </Alert>
      ) : null}
      <DialogFooter>
        <Button type="submit" disabled={disabled || pending} className="rounded-xl">
          <Save className="size-4" />
          {pending ? "Guardando..." : "Guardar cambios"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function ResetAccessForm({
  userId,
  disabled,
}: {
  userId: string;
  disabled: boolean;
}) {
  const [state, formAction, pending] = useActionState(resetUserAccessAction, initialState);
  useActionToast(state);

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={userId} />
      <Button type="submit" variant="outline" size="icon-sm" disabled={disabled || pending}>
        <KeyRound className="size-4" />
        <span className="sr-only">Restablecer acceso</span>
      </Button>
    </form>
  );
}

export function UserManagement({
  users,
  currentUserId,
  error,
  serviceRoleConfigured,
}: UserManagementProps) {
  const activeAdmins = users.filter(
    (user) => user.role === "administrador" && user.is_active,
  ).length;

  return (
    <Card className="border-white/60 bg-card/92 shadow-sm">
      <CardHeader className="gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-5" />
              Administracion interna de usuarios
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Alta, roles, activacion y restablecimiento de acceso solo para administradores.
            </p>
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <Button disabled={!serviceRoleConfigured} className="rounded-xl">
                <UserPlus className="size-4" />
                Invitar usuario
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Invitar usuario</DialogTitle>
                <DialogDescription>
                  Se creará el perfil y la persona recibirá un enlace para definir su propia contraseña.
                </DialogDescription>
              </DialogHeader>
              <CreateUserForm disabled={!serviceRoleConfigured} />
            </DialogContent>
          </Dialog>
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Atencion requerida</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-3 text-sm md:grid-cols-3">
          <span className="rounded-xl bg-muted/50 px-3 py-2">Usuarios: {users.length}</span>
          <span className="rounded-xl bg-muted/50 px-3 py-2">Admins activos: {activeAdmins}</span>
          <span className="rounded-xl bg-muted/50 px-3 py-2">
            Service role: {serviceRoleConfigured ? "Configurado" : "Pendiente"}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-2xl border border-border/70">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Usuario</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Ultimo acceso</TableHead>
                <TableHead>Creado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">
                        {user.full_name || user.email || user.id.slice(0, 8)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {user.email ?? "Email no disponible sin service role"}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <RoleBadge role={user.role} />
                  </TableCell>
                  <TableCell>
                    <UserStatusBadge active={user.is_active} />
                  </TableCell>
                  <TableCell>{formatDate(user.last_sign_in_at)}</TableCell>
                  <TableCell>{formatDate(user.auth_created_at ?? user.created_at)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" disabled={!serviceRoleConfigured}>
                            Editar
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
                          <DialogHeader>
                            <DialogTitle>Editar usuario</DialogTitle>
                            <DialogDescription>
                              Cambia nombre, rol o estado. Las reglas criticas se validan en servidor.
                            </DialogDescription>
                          </DialogHeader>
                          <EditUserForm
                            user={user}
                            currentUserId={currentUserId}
                            disabled={!serviceRoleConfigured}
                          />
                        </DialogContent>
                      </Dialog>
                      <ResetAccessForm userId={user.id} disabled={!serviceRoleConfigured} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!users.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    No se pudieron cargar usuarios o aun no existen perfiles.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
