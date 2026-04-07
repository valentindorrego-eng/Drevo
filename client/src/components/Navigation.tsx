import { Link, useLocation } from "wouter";
import { ShoppingBag, Menu, X, Plug, UserCircle, Bookmark, Fingerprint, Package, Sun, Moon, Sparkles, BarChart3 } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/context/ThemeContext";

export function Navigation() {
  const [location] = useLocation();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { totalItems } = useCart();
  const { user, isAuthenticated } = useAuth();
  const { theme, toggleTheme } = useTheme();

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
    ...(isAuthenticated ? [{ href: "/stylist", label: "Mi Estilista" }] : []),
    { href: "/connect", label: "Conectar tienda" },
    { href: "/brand", label: "Dashboard" },
    { href: "/cart", label: `Carrito${totalItems > 0 ? ` (${totalItems})` : ""}` },
    { href: isAuthenticated ? "/profile" : "/auth", label: isAuthenticated ? (user?.displayName || "Mi cuenta") : "Entrar" },
  ];

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-500 border-b border-transparent",
        mobileMenuOpen ? "bg-background py-3" : isScrolled ? "bg-background/60 backdrop-blur-xl backdrop-saturate-150 border-border/50 py-3 shadow-2xl" : "bg-transparent py-5"
      )}
    >
      <div className="container mx-auto px-4 flex items-center justify-between">
        <Link href="/" className="text-2xl font-display font-bold tracking-tighter z-50 relative" data-testid="link-logo">
          <span className="text-foreground">DRE</span><span className="text-accent">VO</span>
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          <Link href="/search" data-testid="link-nav-search" className={cn(
            "text-sm font-medium transition-colors hover:text-foreground",
            location === "/search" ? "text-foreground" : "text-muted-foreground"
          )}>
            Búsqueda AI
          </Link>
          <Link href="/connect" data-testid="link-nav-connect" className={cn(
            "text-sm font-medium transition-colors hover:text-foreground flex items-center gap-1.5",
            location === "/connect" ? "text-foreground" : "text-muted-foreground"
          )}>
            <Plug className="w-3.5 h-3.5" />
            <span>Conectar tienda</span>
          </Link>
          {isAuthenticated && (
            <Link href="/collections" data-testid="link-nav-collections" className={cn(
              "text-sm font-medium transition-colors hover:text-foreground flex items-center gap-1.5",
              location === "/collections" ? "text-foreground" : "text-muted-foreground"
            )}>
              <Bookmark className="w-3.5 h-3.5" />
              <span>Guardados</span>
            </Link>
          )}
          {isAuthenticated && (
            <Link href="/orders" data-testid="link-nav-orders" className={cn(
              "text-sm font-medium transition-colors hover:text-foreground flex items-center gap-1.5",
              location === "/orders" ? "text-foreground" : "text-muted-foreground"
            )}>
              <Package className="w-3.5 h-3.5" />
              <span>Mis Compras</span>
            </Link>
          )}
          {isAuthenticated && (
            <Link href="/stylist" data-testid="link-nav-stylist" className={cn(
              "text-sm font-medium transition-colors hover:text-foreground flex items-center gap-1.5",
              location === "/stylist" ? "text-foreground" : "text-muted-foreground"
            )}>
              <Sparkles className="w-3.5 h-3.5" />
              <span>Mi Estilista</span>
            </Link>
          )}
          {isAuthenticated && (
            <Link href="/style-passport" data-testid="link-nav-style-passport" className={cn(
              "text-sm font-medium transition-colors hover:text-foreground flex items-center gap-1.5 relative",
              location === "/style-passport" ? "text-foreground" : "text-muted-foreground"
            )}>
              <Fingerprint className="w-3.5 h-3.5" />
              <span>Style Passport</span>
              {user && !user.stylePassportCompleted && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-accent rounded-full animate-pulse" />
              )}
            </Link>
          )}
          <Link href="/brand" data-testid="link-nav-brand" className={cn(
            "text-sm font-medium transition-colors hover:text-foreground flex items-center gap-1.5",
            location === "/brand" ? "text-foreground" : "text-muted-foreground"
          )}>
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Dashboard</span>
          </Link>
          <button
            onClick={toggleTheme}
            className="text-muted-foreground hover:text-foreground transition-colors p-1"
            aria-label={theme === "dark" ? "Modo claro" : "Modo oscuro"}
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <Link href="/cart" data-testid="link-nav-cart" className={cn(
            "text-sm font-medium transition-colors hover:text-foreground flex items-center gap-2 relative",
            location === "/cart" ? "text-foreground" : "text-muted-foreground"
          )}>
            <span>Carrito</span>
            <div className="relative">
              <ShoppingBag className="w-4 h-4" />
              {totalItems > 0 && (
                <span className="absolute -top-2 -right-2 bg-accent text-black text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center" data-testid="text-cart-badge">
                  {totalItems > 9 ? "9+" : totalItems}
                </span>
              )}
            </div>
          </Link>
          <Link
            href={isAuthenticated ? "/profile" : "/auth"}
            data-testid="link-nav-auth"
            className={cn(
              "text-sm font-medium transition-colors hover:text-foreground flex items-center gap-1.5",
              (location === "/auth" || location === "/profile") ? "text-foreground" : "text-muted-foreground"
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

        <div className="md:hidden flex items-center gap-4 z-50 relative">
          <button
            onClick={toggleTheme}
            className="text-muted-foreground hover:text-foreground transition-colors p-1"
            aria-label={theme === "dark" ? "Modo claro" : "Modo oscuro"}
          >
            {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <Link href="/cart" className="relative" aria-label="Carrito">
            <ShoppingBag className="w-5 h-5 text-foreground" />
            {totalItems > 0 && (
              <span className="absolute -top-2 -right-2 bg-accent text-black text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                {totalItems > 9 ? "9+" : totalItems}
              </span>
            )}
          </Link>
          <button
            className="text-foreground"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={mobileMenuOpen}
            data-testid="button-mobile-menu"
          >
            {mobileMenuOpen ? <X /> : <Menu />}
          </button>
        </div>

        <div className={cn(
          "fixed inset-0 bg-background z-40 flex flex-col justify-center items-center gap-6 transition-all duration-300 md:hidden overflow-y-auto",
          mobileMenuOpen ? "opacity-100 translate-x-0" : "opacity-0 translate-x-full pointer-events-none"
        )}>
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "text-2xl font-display font-medium transition-colors",
                location === link.href ? "text-accent" : "text-foreground"
              )}
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
