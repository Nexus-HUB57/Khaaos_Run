import { lazy, Suspense, type ComponentType } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { LayoutShell } from "@/components/layout-shell";
import { Loader2 } from "lucide-react";

const Dashboard = lazy(() => import("@/pages/dashboard"));
const Bank = lazy(() => import("@/pages/bank"));
const Inventory = lazy(() => import("@/pages/inventory"));
const Market = lazy(() => import("@/pages/market"));
const Profile = lazy(() => import("@/pages/profile"));
const Mundos = lazy(() => import("@/pages/mundos"));
const Zona = lazy(() => import("@/pages/zona"));
const Loot = lazy(() => import("@/pages/loot"));
const Batalha = lazy(() => import("@/pages/batalha"));
const Lobby = lazy(() => import("@/pages/lobby"));
const Ranking = lazy(() => import("@/pages/ranking"));
const Landing = lazy(() => import("@/pages/landing"));
const NotFound = lazy(() => import("@/pages/not-found"));
import { BattleRoomProvider } from "@/hooks/battle-room-context";
import { MatchResultsModal } from "@/components/match-results-modal";
import { BattleFlowNavigator } from "@/components/battle-flow-navigator";

function ProtectedRoute({ component: Component }: { component: ComponentType }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-black text-primary">
        <Loader2 className="w-10 h-10 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Landing />;
  }

  return (
    <LayoutShell>
      <Component />
    </LayoutShell>
  );
}

function Router() {
  const { user, isLoading } = useAuth();

  if (isLoading) return null;

  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-screen bg-black text-primary">
        <Loader2 className="w-10 h-10 animate-spin" />
      </div>
    }>
    <Switch>
      <Route path="/" component={user ? () => <ProtectedRoute component={Dashboard} /> : Landing} />
      <Route path="/bank">
        <ProtectedRoute component={Bank} />
      </Route>
      <Route path="/inventory">
        <ProtectedRoute component={Inventory} />
      </Route>
      <Route path="/market">
        <ProtectedRoute component={Market} />
      </Route>
      <Route path="/profile">
        <ProtectedRoute component={Profile} />
      </Route>
      <Route path="/mundos">
        <ProtectedRoute component={Mundos} />
      </Route>
      <Route path="/zona">
        <ProtectedRoute component={Zona} />
      </Route>
      <Route path="/loot">
        <ProtectedRoute component={Loot} />
      </Route>
      <Route path="/lobby">
        <ProtectedRoute component={Lobby} />
      </Route>
      <Route path="/ranking">
        <ProtectedRoute component={Ranking} />
      </Route>
      <Route path="/batalha">
        <ProtectedRoute component={Batalha} />
      </Route>
      <Route component={NotFound} />
    </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <BattleRoomProvider>
          <Toaster />
          <BattleFlowNavigator />
          <MatchResultsModal />
          <Router />
        </BattleRoomProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
