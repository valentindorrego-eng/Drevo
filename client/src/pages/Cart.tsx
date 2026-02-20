import { Navigation } from "@/components/Navigation";
import { Link } from "wouter";
import { ShoppingBag, ArrowRight } from "lucide-react";

export default function Cart() {
  return (
    <div className="min-h-screen bg-black text-white">
      <Navigation />
      
      <div className="pt-32 px-4 flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
        <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-4">
          <ShoppingBag className="w-10 h-10 text-neutral-400" />
        </div>
        
        <h1 className="text-3xl font-display font-bold">Tu carrito está vacío</h1>
        <p className="text-neutral-400 max-w-md">
          Parece que todavía no agregaste nada. Explorá nuestra colección curada por IA para encontrar tu próximo look.
        </p>
        
        <Link href="/search">
          <a className="mt-8 px-8 py-3 bg-white text-black font-semibold rounded hover:bg-neutral-200 transition-colors inline-flex items-center gap-2">
            Explorar Productos <ArrowRight className="w-4 h-4" />
          </a>
        </Link>
      </div>
    </div>
  );
}
