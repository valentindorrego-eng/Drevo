import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Navigation } from "@/components/Navigation";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { User, Ruler, Save, LogOut, Camera, Sparkles, Upload, Package, ChevronRight } from "lucide-react";
import { Link } from "wouter";

export default function Profile() {
  const [, setLocation] = useLocation();
  const { user, isLoading, isAuthenticated, updateProfile, logout, uploadAvatar, uploadFullBody } = useAuth();
  const { toast } = useToast();

  const [displayName, setDisplayName] = useState("");
  const [preferredSize, setPreferredSize] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [bodyType, setBodyType] = useState("");

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || "");
      setPreferredSize(user.preferredSize || "");
      setHeightCm(user.heightCm ? String(user.heightCm) : "");
      setWeightKg(user.weightKg ? String(user.weightKg) : "");
      setBodyType(user.bodyType || "");
    }
  }, [user]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) setLocation("/auth");
  }, [isLoading, isAuthenticated, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <Navigation />
        <div className="pt-32 flex justify-center">
          <div className="animate-pulse text-muted-foreground">Cargando perfil...</div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateProfile.mutateAsync({
        displayName: displayName || undefined,
        preferredSize: preferredSize || undefined,
        heightCm: heightCm ? Number(heightCm) : null,
        weightKg: weightKg ? Number(weightKg) : null,
        bodyType: bodyType || undefined,
      });
      toast({ title: "Perfil actualizado" });
    } catch (error: any) {
      toast({ title: "Error", description: "No se pudo actualizar el perfil", variant: "destructive" });
    }
  };

  const handleLogout = async () => {
    await logout.mutateAsync();
    setLocation("/");
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navigation />
      <div className="pt-32 pb-20 px-4 flex justify-center">
        <div className="w-full max-w-lg">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-display font-bold" data-testid="text-profile-title">Mi perfil</h1>
              <p className="text-muted-foreground text-sm mt-1">{user?.email}</p>
            </div>
            <div className="relative group">
              {user?.profileImageUrl ? (
                <img
                  src={user.profileImageUrl}
                  alt="Perfil"
                  className="w-16 h-16 rounded-full border-2 border-border object-cover"
                  data-testid="img-profile-avatar"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-secondary border-2 border-border flex items-center justify-center" data-testid="img-profile-avatar-placeholder">
                  <User className="w-8 h-8 text-muted-foreground" />
</div>
              )}
              <label className="absolute inset-0 flex items-center justify-center rounded-full bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer" data-testid="button-upload-avatar">
                <Camera className="w-5 h-5 text-foreground" />
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      await uploadAvatar.mutateAsync(file);
                      toast({ title: "Foto actualizada" });
                    } catch {
                      toast({ title: "Error", description: "No se pudo subir la foto", variant: "destructive" });
                    }
                  }}
                  data-testid="input-avatar-file"
                />
              </label>
            </div>
          </div>

          <form onSubmit={handleSave} className="space-y-6">
            <div className="bg-card/50 border border-border rounded-xl p-6 space-y-4">
              <h2 className="text-lg font-display font-semibold flex items-center gap-2">
                <User className="w-5 h-5 text-[#C8FF00]" />
                Datos personales
              </h2>

              <div>
                <Label htmlFor="name" className="text-muted-foreground text-sm">Nombre</Label>
                <Input
                  id="name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Tu nombre"
                  className="mt-1 bg-card border-border text-foreground placeholder:text-muted-foreground"
                  data-testid="input-profile-name"
                />
              </div>
            </div>

            <div className="bg-card/50 border border-border rounded-xl p-6 space-y-4">
              <h2 className="text-lg font-display font-semibold flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#C8FF00]" />
                Foto para probador virtual
              </h2>
              <p className="text-muted-foreground text-sm">Subí una foto de cuerpo completo para usar en el probador virtual. De frente, con buena luz.</p>

              <div className="flex items-start gap-4">
                <div className="w-32 h-44 rounded-lg overflow-hidden border border-border bg-secondary flex-shrink-0">
                  {user?.fullBodyImageUrl ? (
                    <img
                      src={user.fullBodyImageUrl}
                      alt="Cuerpo completo"
                      className="w-full h-full object-cover"
                      data-testid="img-fullbody"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                      <User className="w-8 h-8 mb-1" />
                      <span className="text-xs">Sin foto</span>
                    </div>
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <label className="flex items-center justify-center gap-2 py-3 px-4 bg-card hover:bg-secondary border border-border rounded-lg text-muted-foreground text-sm cursor-pointer transition-colors" data-testid="button-upload-fullbody">
                    <Upload className="w-4 h-4" />
                    {user?.fullBodyImageUrl ? "Cambiar foto" : "Subir foto"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          await uploadFullBody.mutateAsync(file);
                          toast({ title: "Foto de cuerpo completo actualizada" });
                        } catch {
                          toast({ title: "Error", description: "No se pudo subir la foto", variant: "destructive" });
                        }
                      }}
                      data-testid="input-fullbody-file"
                    />
                  </label>
                  <p className="text-[11px] text-muted-foreground leading-tight">Esta foto se usa en el probador virtual para mostrarte cómo te queda cada prenda. Max 10MB.</p>
                </div>
              </div>
            </div>

            <div className="bg-card/50 border border-border rounded-xl p-6 space-y-4">
              <h2 className="text-lg font-display font-semibold flex items-center gap-2">
                <Ruler className="w-5 h-5 text-[#C8FF00]" />
                Medidas corporales
              </h2>
              <p className="text-muted-foreground text-sm">Estos datos mejoran las recomendaciones de talle y el probador virtual.</p>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="height" className="text-muted-foreground text-sm">Altura (cm)</Label>
                  <Input
                    id="height"
                    type="number"
                    min={100}
                    max={250}
                    value={heightCm}
                    onChange={(e) => setHeightCm(e.target.value)}
                    placeholder="170"
                    className="mt-1 bg-card border-border text-foreground placeholder:text-muted-foreground"
                    data-testid="input-height"
                  />
                </div>
                <div>
                  <Label htmlFor="weight" className="text-muted-foreground text-sm">Peso (kg)</Label>
                  <Input
                    id="weight"
                    type="number"
                    min={30}
                    max={300}
                    value={weightKg}
                    onChange={(e) => setWeightKg(e.target.value)}
                    placeholder="70"
                    className="mt-1 bg-card border-border text-foreground placeholder:text-muted-foreground"
                    data-testid="input-weight"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="bodyType" className="text-muted-foreground text-sm">Tipo de cuerpo</Label>
                <Select value={bodyType} onValueChange={setBodyType}>
                  <SelectTrigger className="mt-1 bg-card border-border text-foreground" data-testid="select-body-type">
                    <SelectValue placeholder="Seleccioná tu tipo" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="ectomorph">Ectomorfo (delgado)</SelectItem>
                    <SelectItem value="mesomorph">Mesomorfo (atlético)</SelectItem>
                    <SelectItem value="endomorph">Endomorfo (robusto)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="size" className="text-muted-foreground text-sm">Talle preferido</Label>
                <Select value={preferredSize} onValueChange={setPreferredSize}>
                  <SelectTrigger className="mt-1 bg-card border-border text-foreground" data-testid="select-size">
                    <SelectValue placeholder="Seleccioná tu talle" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="XS">XS</SelectItem>
                    <SelectItem value="S">S</SelectItem>
                    <SelectItem value="M">M</SelectItem>
                    <SelectItem value="L">L</SelectItem>
                    <SelectItem value="XL">XL</SelectItem>
                    <SelectItem value="XXL">XXL</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                type="submit"
                disabled={updateProfile.isPending}
                className="flex-1 bg-[#C8FF00] text-black font-bold hover:bg-[#b8ef00] h-11"
                data-testid="button-save-profile"
              >
                <Save className="w-4 h-4 mr-2" />
                {updateProfile.isPending ? "Guardando..." : "Guardar cambios"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleLogout}
                className="border-border text-muted-foreground hover:text-foreground hover:bg-secondary"
                data-testid="button-logout"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Salir
              </Button>
            </div>
          </form>

          <Link href="/orders">
            <div className="mt-6 border border-border rounded-xl p-5 bg-card hover:border-border transition-colors cursor-pointer flex items-center justify-between group" data-testid="link-my-orders">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-[#C8FF00]/10 rounded-lg flex items-center justify-center">
                  <Package className="w-5 h-5 text-[#C8FF00]" />
                </div>
                <div>
                  <p className="font-semibold">Mis Compras</p>
                  <p className="text-xs text-muted-foreground">Historial de pedidos y seguimiento</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
