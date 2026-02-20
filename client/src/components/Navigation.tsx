import { Link, useLocation } from "wouter";
import { ShoppingBag, Search, Menu, X } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

export function Navigation() {
  const [location] = useLocation();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const links = [
    { href: "/", label: "Explorar" },
    { href: "/search", label: "Buscar" },
    { href: "/cart", label: "Carrito" },
  ];

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300 border-b border-transparent",
        isScrolled ? "bg-black/80 backdrop-blur-md border-white/10 py-3" : "bg-transparent py-5"
      )}
    >
      <div className="container mx-auto px-4 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="text-2xl font-display font-bold tracking-tighter text-white z-50 relative">
          DREVO
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-8">
          <Link href="/search" className={cn(
            "text-sm font-medium transition-colors hover:text-white",
            location === "/search" ? "text-white" : "text-neutral-400"
          )}>
            Búsqueda AI
          </Link>
          <Link href="/cart" className={cn(
            "text-sm font-medium transition-colors hover:text-white flex items-center gap-2",
            location === "/cart" ? "text-white" : "text-neutral-400"
          )}>
            <span>Carrito</span>
            <ShoppingBag className="w-4 h-4" />
          </Link>
        </nav>

        {/* Mobile Menu Toggle */}
        <button 
          className="md:hidden text-white z-50 relative"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X /> : <Menu />}
        </button>

        {/* Mobile Nav Overlay */}
        <div className={cn(
          "fixed inset-0 bg-black z-40 flex flex-col justify-center items-center gap-8 transition-transform duration-300 md:hidden",
          mobileMenuOpen ? "translate-x-0" : "translate-x-full"
        )}>
          {links.map((link) => (
            <Link 
              key={link.href} 
              href={link.href} 
              className="text-2xl font-display font-medium text-white"
              onClick={() => setMobileMenuOpen(false)}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </header>
  );
}
