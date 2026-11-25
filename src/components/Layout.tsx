import { Outlet, useLocation } from "react-router-dom";
import TopNav from "./TopNav";
import ErrorBoundary from "./ErrorBoundary";
import PavexaBackground from "./PavexaBackground";

export default function Layout() {
  const { pathname } = useLocation();

  return (
    <div className="relative isolate min-h-screen bg-transparent">
      <PavexaBackground />
      <TopNav />
      <ErrorBoundary key={pathname}>
        <main className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <div key={pathname} className="page-enter">
            <Outlet />
          </div>
        </main>
      </ErrorBoundary>
    </div>
  );
}