import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Navigation } from "@/components/Navigation";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Mail, Lock, User } from "lucide-react";

export default function Auth() {
  const [, setLocation] = useLocation();
  const { login, register, isAuthenticated } = useAuth();
  const { data: authConfig } = useQuery<{ googleEnabled: boolean }>({
    queryKey: ["/api/auth/config"],
    staleTime: Infinity,
  });
  const { toast } = useToast();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (isAuthenticated) setLocation("/profile");
  }, [isAuthenticated, setLocation]);

  if (isAuthenticated) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (mode === "login") {
        await login.mutateAsync({ email, password });
      } else {
        await register.mutateAsync({ email, password, displayName: displayName || undefined });
      }
      toast({ title: mode === "login" ? "Bienvenido/a de vuelta" : "Cuenta creada" });
      setLocation("/profile");
    } catch (error: any) {
      const msg = error.message?.includes(":") ? error.message.split(": ").slice(1).join(": ") : error.message;
      let parsed = msg;
      try { parsed = JSON.parse(msg)?.message || msg; } catch {}
      toast({ title: "Error", description: parsed, variant: "destructive" });
    }
  };

  const isPending = login.isPending || register.isPending;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navigation />
      <div className="pt-32 pb-20 px-4 flex justify-center">
        <div className="w-full max-w-md">
          <h1 className="text-3xl font-display font-bold mb-2 text-center" data-testid="text-auth-title">
            {mode === "login" ? "Iniciar sesión" : "Crear cuenta"}
          </h1>
          <p className="text-muted-foreground text-center mb-8">
            {mode === "login" ? "Ingresá a tu cuenta DREVO" : "Unite a DREVO"}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && (
              <div>
                <Label htmlFor="displayName" className="text-muted-foreground text-sm">Nombre (opcional)</Label>
                <div className="relative mt-1">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="displayName"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Tu nombre"
                    className="pl-10 bg-card border-border text-foreground placeholder:text-muted-foreground"
                    data-testid="input-display-name"
                  />
                </div>
              </div>
            )}

            <div>
              <Label htmlFor="email" className="text-muted-foreground text-sm">Email</Label>
              <div className="relative mt-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  className="pl-10 bg-card border-border text-foreground placeholder:text-muted-foreground"
                  data-testid="input-email"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="password" className="text-muted-foreground text-sm">Contraseña</Label>
              <div className="relative mt-1">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  className="pl-10 pr-10 bg-card border-border text-foreground placeholder:text-muted-foreground"
                  data-testid="input-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  data-testid="button-toggle-password"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={isPending}
              className="w-full bg-[#C8FF00] text-black font-bold hover:bg-[#b8ef00] h-11"
              data-testid="button-submit-auth"
            >
              {isPending ? (mode === "login" ? "Entrando..." : "Creando cuenta...") : mode === "login" ? "Entrar" : "Crear cuenta"}
            </Button>
          </form>

          {authConfig?.googleEnabled && (
            <>
              <div className="my-6 flex items-center gap-3">
                <div className="flex-1 h-px bg-secondary" />
                <span className="text-muted-foreground text-xs">o</span>
                <div className="flex-1 h-px bg-secondary" />
              </div>

              <a
                href="/auth/google"
                className="flex items-center justify-center gap-3 w-full h-11 rounded-md border border-border bg-card text-foreground font-medium hover:bg-secondary transition-colors"
                data-testid="button-google-auth"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Continuar con Google
              </a>
            </>
          )}

          <div className="mt-6 text-center">
            <p className="text-muted-foreground text-sm">
              {mode === "login" ? "¿No tenés cuenta?" : "¿Ya tenés cuenta?"}{" "}
              <button
                onClick={() => setMode(mode === "login" ? "register" : "login")}
                className="text-[#C8FF00] font-medium hover:underline"
                data-testid="button-switch-mode"
              >
                {mode === "login" ? "Registrate" : "Iniciá sesión"}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
