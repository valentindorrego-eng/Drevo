import { Link, useLocation } from "wouter";
import { ShoppingBag, Menu, X, Plug, UserCircle, Bookmark, Fingerprint, Package } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/hooks/useAuth";

export function Navigation() {
  const [location] = useLocation();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { totalItems } = useCart();
  const { user, isAuthenticated } = useAuth();

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
    ...(isAuthenticated ? [{ href: "/collections", label: "Guardados" }] : []),
    ...(isAuthenticated ? [{ href: "/orders", label: "Mis Compras" }] : []),
    ...(isAuthenticated ? [{ href: "/style-passport", label: "Style Passport" }] : []),
    { href: "/connect", label: "Conectar tienda" },
    { href: "/cart", label: `Carrito${totalItems > 0 ? ` (${totalItems})` : ""}` },
    { href: isAuthenticated ? "/profile" : "/auth", label: isAuthenticated ? (user?.displayName || "Mi cuenta") : "Entrar" },
  ];

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-500 border-b border-transparent",
        isScrolled ? "bg-black/60 backdrop-blur-xl backdrop-saturate-150 border-white/[0.06] py-3 shadow-2xl shadow-black/20" : "bg-transparent py-5"
      )}
    >
      <div className="container mx-auto px-4 flex items-center justify-between">
        <Link href="/" className="text-2xl font-display font-bold tracking-tighter z-50 relative" data-testid="link-logo">
          <span className="text-white">DRE</span><span className="text-[#C8FF00]">VO</span>
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          <Link href="/search" data-testid="link-nav-search" className={cn(
            "text-sm font-medium transition-colors hover:text-white",
            location === "/search" ? "text-white" : "text-neutral-400"
          )}>
            Búsqueda AI
          </Link>
          <Link href="/connect" data-testid="link-nav-connect" className={cn(
            "text-sm font-medium transition-colors hover:text-white flex items-center gap-1.5",
            location === "/connect" ? "text-white" : "text-neutral-400"
          )}>
            <Plug className="w-3.5 h-3.5" />
            <span>Conectar tienda</span>
          </Link>
          {isAuthenticated && (
            <Link href="/collections" data-testid="link-nav-collections" className={cn(
              "text-sm font-medium transition-colors hover:text-white flex items-center gap-1.5",
              location === "/collections" ? "text-white" : "text-neutral-400"
            )}>
              <Bookmark className="w-3.5 h-3.5" />
              <span>Guardados</span>
            </Link>
          )}
          {isAuthenticated && (
            <Link href="/orders" data-testid="link-nav-orders" className={cn(
              "text-sm font-medium transition-colors hover:text-white flex items-center gap-1.5",
              location === "/orders" ? "text-white" : "text-neutral-400"
            )}>
              <Package className="w-3.5 h-3.5" />
              <span>Mis Compras</span>
            </Link>
          )}
          {isAuthenticated && (
            <Link href="/style-passport" data-testid="link-nav-style-passport" className={cn(
              "text-sm font-medium transition-colors hover:text-white flex items-center gap-1.5 relative",
              location === "/style-passport" ? "text-white" : "text-neutral-400"
            )}>
              <Fingerprint className="w-3.5 h-3.5" />
              <span>Style Passport</span>
              {user && !user.stylePassportCompleted && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-[#C8FF00] rounded-full animate-pulse" />
              )}
            </Link>
          )}
          <Link href="/cart" data-testid="link-nav-cart" className={cn(
            "text-sm font-medium transition-colors hover:text-white flex items-center gap-2 relative",
            location === "/cart" ? "text-white" : "text-neutral-400"
          )}>
            <span>Carrito</span>
            <div className="relative">
              <ShoppingBag className="w-4 h-4" />
              {totalItems > 0 && (
                <span className="absolute -top-2 -right-2 bg-[#C8FF00] text-black text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center" data-testid="text-cart-badge">
                  {totalItems > 9 ? "9+" : totalItems}
                </span>
              )}
            </div>
          </Link>
          <Link
            href={isAuthenticated ? "/profile" : "/auth"}
            data-testid="link-nav-auth"
            className={cn(
              "text-sm font-medium transition-colors hover:text-white flex items-center gap-1.5",
              (location === "/auth" || location === "/profile") ? "text-white" : "text-neutral-400"
            )}
          >
            {isAuthenticated && user?.profileImageUrl ? (
              <img src={user.profileImageUrl} alt="" className="w-5 h-5 rounded-full" />
            ) : (
              <UserCircle className="w-4 h-4" />
            )}
            <span>{isAuthenticated ? (user?.displayName || "Mi cuenta") : "Entrar"}</span>
          </Link>
        </nav>

        <button
          className="md:hidden text-white z-50 relative"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          data-testid="button-mobile-menu"
        >
          {mobileMenuOpen ? <X /> : <Menu />}
        </button>

        {mobileMenuOpen && (
          <div className="fixed inset-0 bg-black z-40 flex flex-col justify-center items-center gap-8 md:hidden">
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
        )}
      </div>
    </header>
  );
}
