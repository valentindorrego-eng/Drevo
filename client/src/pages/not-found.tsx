import { Link } from "wouter";
import { Navigation } from "@/components/Navigation";
import { Search, Home, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-black text-white">
      <Navigation />
      <div className="pt-32 pb-20 px-4 flex flex-col items-center justify-center min-h-[70vh] text-center space-y-6">
        <div className="text-8xl font-display font-bold text-neutral-800">404</div>
        <h1 className="text-2xl font-display font-bold text-white">Página no encontrada</h1>
        <p className="text-neutral-500 max-w-md">
          La página que buscás no existe o fue movida. Probá buscando lo que necesitás.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 mt-4">
          <Link href="/search" className="flex items-center justify-center gap-2 px-6 py-3 bg-accent text-black rounded font-bold hover:bg-accent/80 transition-colors">
            <Search className="w-4 h-4" /> Buscar productos
          </Link>
          <Link href="/" className="flex items-center justify-center gap-2 px-6 py-3 border border-white/20 rounded font-medium text-neutral-300 hover:text-white hover:border-white transition-colors">
            <Home className="w-4 h-4" /> Ir al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
