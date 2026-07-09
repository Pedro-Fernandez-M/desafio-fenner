"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Loader2, UserPlus, KeyRound } from "lucide-react"

import {
  createUser,
  setUserRole,
  setUserActive,
  resetUserPassword,
} from "@/lib/actions/admin"
import { ROLE_LABELS, type Role } from "@/lib/constants"

/** Roles que se asignan desde el panel (los demás quedan reservados). */
const ASSIGNABLE_ROLES: Role[] = ["profesor", "convivencia", "administrador"]
const ROLE_ITEMS = ASSIGNABLE_ROLES.map((r) => ({
  value: r,
  label: ROLE_LABELS[r],
}))
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export type UserRow = {
  id: string
  full_name: string
  email: string | null
  role: Role
  active: boolean
}

export function UsersManager({ users }: { users: UserRow[] }) {
  const [pending, startTransition] = useTransition()

  // --- crear usuario ---
  const [open, setOpen] = useState(false)
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState<Role>("profesor")

  // --- reset clave ---
  const [pwUser, setPwUser] = useState<UserRow | null>(null)
  const [newPw, setNewPw] = useState("")

  function handleCreate() {
    if (!fullName.trim() || !email.trim() || password.length < 6) {
      toast.error("Completa nombre, usuario y una clave de mínimo 6 caracteres.")
      return
    }
    startTransition(async () => {
      const res = await createUser({
        email,
        password,
        fullName: fullName.trim(),
        role,
      })
      if (res.ok) {
        toast.success("Usuario creado.")
        setOpen(false)
        setFullName("")
        setEmail("")
        setPassword("")
        setRole("profesor")
      } else {
        toast.error(res.error)
      }
    })
  }

  function handleRole(user: UserRow, newRole: Role) {
    startTransition(async () => {
      const res = await setUserRole(user.id, newRole)
      if (res.ok) toast.success(`${user.full_name}: rol actualizado.`)
      else toast.error(res.error)
    })
  }

  function handleActive(user: UserRow) {
    startTransition(async () => {
      const res = await setUserActive(user.id, !user.active)
      if (res.ok)
        toast.success(
          `${user.full_name}: ${user.active ? "desactivado" : "activado"}.`
        )
      else toast.error(res.error)
    })
  }

  function handleResetPw() {
    if (!pwUser || newPw.length < 6) {
      toast.error("La clave debe tener al menos 6 caracteres.")
      return
    }
    startTransition(async () => {
      const res = await resetUserPassword(pwUser.id, newPw)
      if (res.ok) {
        toast.success(`Clave de ${pwUser.full_name} actualizada.`)
        setPwUser(null)
        setNewPw("")
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger
            className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
          >
            <UserPlus className="size-4" /> Nuevo usuario
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Crear usuario</DialogTitle>
              <DialogDescription>
                Si escribes un usuario sin @, se creará como
                usuario@fenner.local.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="nu-name">Nombre completo</Label>
                <Input
                  id="nu-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ej: María Pérez"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nu-email">Usuario o correo</Label>
                <Input
                  id="nu-email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="mperez  ·  o  ·  mperez@industrialfenner.cl"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nu-pw">Contraseña</Label>
                <Input
                  id="nu-pw"
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Rol</Label>
                <Select
                  items={ROLE_ITEMS}
                  value={role}
                  onValueChange={(v) => v && setRole(v as Role)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_ITEMS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                className="w-full"
                onClick={handleCreate}
                disabled={pending}
              >
                {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
                Crear usuario
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Usuario</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.full_name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {u.email?.replace("@fenner.local", "") ?? "—"}
                </TableCell>
                <TableCell>
                  <Select
                    items={ROLE_ITEMS}
                    value={u.role}
                    onValueChange={(v) => v && handleRole(u, v as Role)}
                  >
                    <SelectTrigger className="h-8 w-44">
                      <SelectValue>
                        {ROLE_LABELS[u.role] ?? u.role}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_ITEMS.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Badge variant={u.active ? "default" : "secondary"}>
                    {u.active ? "Activo" : "Inactivo"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPwUser(u)}
                    >
                      <KeyRound className="mr-1 size-3.5" /> Clave
                    </Button>
                    <Button
                      variant={u.active ? "outline" : "default"}
                      size="sm"
                      onClick={() => handleActive(u)}
                      disabled={pending}
                    >
                      {u.active ? "Desactivar" : "Activar"}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Dialog reset clave */}
      <Dialog open={pwUser !== null} onOpenChange={(o) => !o && setPwUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva clave para {pwUser?.full_name}</DialogTitle>
            <DialogDescription>
              El usuario podrá ingresar de inmediato con la nueva contraseña.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              type="text"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              placeholder="Mínimo 6 caracteres"
            />
            <Button className="w-full" onClick={handleResetPw} disabled={pending}>
              {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Guardar clave
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
