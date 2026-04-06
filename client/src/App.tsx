import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CartProvider } from "@/context/CartContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { AnimatePresence, motion } from "framer-motion";

import Landing from "@/pages/Landing";
import Search from "@/pages/Search";
import ProductDetail from "@/pages/ProductDetail";
import Cart from "@/pages/Cart";
import BrandConnect from "@/pages/BrandConnect";
import Auth from "@/pages/Auth";
import Profile from "@/pages/Profile";
import StylePassport from "@/pages/StylePassport";
import Collections from "@/pages/Collections";
import Checkout from "@/pages/Checkout";
import Order from "@/pages/Order";
import Orders from "@/pages/Orders";
import Stylist from "@/pages/Stylist";
import NotFound from "@/pages/not-found";

const PageTransition = ({ children }: { children: React.ReactNode }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.2 }}
  >
    {children}
  </motion.div>
);

function Router() {
  const [location] = useLocation();
  return (
    <AnimatePresence mode="wait">
      <PageTransition key={location}>
        <Switch location={location}>
          <Route path="/" component={Landing} />
          <Route path="/search" component={Search} />
          <Route path="/product/:id" component={ProductDetail} />
          <Route path="/cart" component={Cart} />
          <Route path="/connect" component={BrandConnect} />
          <Route path="/auth" component={Auth} />
          <Route path="/profile" component={Profile} />
          <Route path="/style-passport" component={StylePassport} />
          <Route path="/collections" component={Collections} />
          <Route path="/checkout" component={Checkout} />
          <Route path="/orders" component={Orders} />
          <Route path="/order/:id" component={Order} />
          <Route path="/stylist" component={Stylist} />
          <Route component={NotFound} />
        </Switch>
      </PageTransition>
    </AnimatePresence>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <CartProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </CartProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
