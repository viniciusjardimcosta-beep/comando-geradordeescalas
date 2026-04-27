import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Check, Ban, Trash2, Loader2, Users as UsersIcon } from "lucide-react";
import { toast } from "sonner";
import type { UserStatus } from "@/lib/auth-context";

export const Route = createFileRoute("/app/usuarios")({
  component: UsuariosPage,
});

interface UserRow {
  id: string;
  email: string;
  nome: string | null;
  status: UserStatus;
  created_at: string;
  is_admin: boolean;
}

function UsuariosPage() {
  const { isAdmin, user } = useAuth();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("id, email, nome, status, created_at")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Erro ao carregar usuários: " + error.message);
      setLoading(false);
      return;
    }
    const { data: roles } = await supabase.from("user_roles").select("user_id, role");
    const adminIds = new Set((roles ?? []).filter((r) => r.role === "admin").map((r) => r.user_id));
    setRows((profiles ?? []).map((p) => ({ ...p, is_admin: adminIds.has(p.id) }) as UserRow));
    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  if (!isAdmin) return <Navigate to="/app/importar" />;

  const updateStatus = async (id: string, status: UserStatus, label: string) => {
    const { error } = await supabase.from("profiles").update({ status }).eq("id", id);
    if (error) {
      toast.error("Erro: " + error.message);
      return;
    }
    toast.success(`Usuário ${label}.`);
    load();
  };

  const deleteUser = async (id: string) => {
    // Apaga o profile (cascade não atinge auth.users; o usuário continua no auth, mas sem profile e role nada acessa)
    const { error: e1 } = await supabase.from("user_roles").delete().eq("user_id", id);
    if (e1) {
      toast.error("Erro ao remover papel: " + e1.message);
      return;
    }
    const { error: e2 } = await supabase.from("profiles").delete().eq("id", id);
    if (e2) {
      toast.error("Erro ao excluir: " + e2.message);
      return;
    }
    toast.success("Usuário excluído.");
    load();
  };

  const statusBadge = (s: UserStatus) => {
    if (s === "aprovado") return <Badge className="bg-success text-success-foreground">Aprovado</Badge>;
    if (s === "pendente") return <Badge className="bg-warning text-warning-foreground">Pendente</Badge>;
    return <Badge variant="destructive">Bloqueado</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary/15 text-primary">
          <UsersIcon className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Gerenciar usuários</h1>
          <p className="text-sm text-muted-foreground">
            Aprove, bloqueie ou exclua contas. Apenas o ADMIN tem acesso a esta aba.
          </p>
        </div>
      </div>

      <div className="panel overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuário</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead>Cadastro</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((u) => {
                const isSelf = u.id === user?.id;
                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="font-medium">{u.nome ?? "—"}</div>
                      <div className="font-mono text-xs text-muted-foreground">{u.email}</div>
                    </TableCell>
                    <TableCell>{statusBadge(u.status)}</TableCell>
                    <TableCell>
                      <Badge variant={u.is_admin ? "default" : "secondary"}>
                        {u.is_admin ? "ADMIN" : "USUÁRIO"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {new Date(u.created_at).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-right">
                      {isSelf ? (
                        <span className="text-xs text-muted-foreground">você</span>
                      ) : (
                        <div className="flex justify-end gap-1">
                          {u.status !== "aprovado" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateStatus(u.id, "aprovado", "aprovado")}
                            >
                              <Check className="h-4 w-4" /> <span className="ml-1">Aprovar</span>
                            </Button>
                          )}
                          {u.status !== "bloqueado" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateStatus(u.id, "bloqueado", "bloqueado")}
                            >
                              <Ban className="h-4 w-4" /> <span className="ml-1">Bloquear</span>
                            </Button>
                          )}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Esta ação remove o perfil e papel de <b>{u.email}</b>.
                                  Não poderá ser desfeito.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteUser(u.id)}>
                                  Excluir
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                    Nenhum usuário cadastrado.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
