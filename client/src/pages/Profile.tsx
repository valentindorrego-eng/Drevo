import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Navigation } from "@/components/Navigation";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { User, Ruler, Weight, Save, LogOut } from "lucide-react";

export default function Profile() {
  const [, setLocation] = useLocation();
  const { user, isLoading, isAuthenticated, updateProfile, logout } = useAuth();
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black text-white">
        <Navigation />
        <div className="pt-32 flex justify-center">
          <div className="animate-pulse text-neutral-400">Cargando perfil...</div>
        </div>
      </div>
    );
  }

  useEffect(() => {
    if (!isLoading && !isAuthenticated) setLocation("/auth");
  }, [isLoading, isAuthenticated, setLocation]);

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
    <div className="min-h-screen bg-black text-white">
      <Navigation />
      <div className="pt-32 pb-20 px-4 flex justify-center">
        <div className="w-full max-w-lg">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-display font-bold" data-testid="text-profile-title">Mi perfil</h1>
              <p className="text-neutral-400 text-sm mt-1">{user?.email}</p>
            </div>
            {user?.profileImageUrl && (
              <img
                src={user.profileImageUrl}
                alt="Perfil"
                className="w-14 h-14 rounded-full border-2 border-neutral-700"
                data-testid="img-profile-avatar"
              />
            )}
          </div>

          <form onSubmit={handleSave} className="space-y-6">
            <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-6 space-y-4">
              <h2 className="text-lg font-display font-semibold flex items-center gap-2">
                <User className="w-5 h-5 text-[#C8FF00]" />
                Datos personales
              </h2>

              <div>
                <Label htmlFor="name" className="text-neutral-300 text-sm">Nombre</Label>
                <Input
                  id="name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Tu nombre"
                  className="mt-1 bg-neutral-900 border-neutral-700 text-white placeholder:text-neutral-500"
                  data-testid="input-profile-name"
                />
              </div>
            </div>

            <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-6 space-y-4">
              <h2 className="text-lg font-display font-semibold flex items-center gap-2">
                <Ruler className="w-5 h-5 text-[#C8FF00]" />
                Medidas corporales
              </h2>
              <p className="text-neutral-500 text-sm">Estos datos mejoran las recomendaciones de talle y el probador virtual.</p>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="height" className="text-neutral-300 text-sm">Altura (cm)</Label>
                  <Input
                    id="height"
                    type="number"
                    min={100}
                    max={250}
                    value={heightCm}
                    onChange={(e) => setHeightCm(e.target.value)}
                    placeholder="170"
                    className="mt-1 bg-neutral-900 border-neutral-700 text-white placeholder:text-neutral-500"
                    data-testid="input-height"
                  />
                </div>
                <div>
                  <Label htmlFor="weight" className="text-neutral-300 text-sm">Peso (kg)</Label>
                  <Input
                    id="weight"
                    type="number"
                    min={30}
                    max={300}
                    value={weightKg}
                    onChange={(e) => setWeightKg(e.target.value)}
                    placeholder="70"
                    className="mt-1 bg-neutral-900 border-neutral-700 text-white placeholder:text-neutral-500"
                    data-testid="input-weight"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="bodyType" className="text-neutral-300 text-sm">Tipo de cuerpo</Label>
                <Select value={bodyType} onValueChange={setBodyType}>
                  <SelectTrigger className="mt-1 bg-neutral-900 border-neutral-700 text-white" data-testid="select-body-type">
                    <SelectValue placeholder="Seleccioná tu tipo" />
                  </SelectTrigger>
                  <SelectContent className="bg-neutral-900 border-neutral-700">
                    <SelectItem value="ectomorph">Ectomorfo (delgado)</SelectItem>
                    <SelectItem value="mesomorph">Mesomorfo (atlético)</SelectItem>
                    <SelectItem value="endomorph">Endomorfo (robusto)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="size" className="text-neutral-300 text-sm">Talle preferido</Label>
                <Select value={preferredSize} onValueChange={setPreferredSize}>
                  <SelectTrigger className="mt-1 bg-neutral-900 border-neutral-700 text-white" data-testid="select-size">
                    <SelectValue placeholder="Seleccioná tu talle" />
                  </SelectTrigger>
                  <SelectContent className="bg-neutral-900 border-neutral-700">
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
                className="border-neutral-700 text-neutral-300 hover:text-white hover:bg-neutral-800"
                data-testid="button-logout"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Salir
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
