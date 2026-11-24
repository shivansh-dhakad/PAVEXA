import { Outlet, useLocation } from "react-router-dom";
import TopNav from "./TopNav";
import ErrorBoundary from "./ErrorBoundary";

export default function Layout() {
  const { pathname } = useLocation();
  const isBarePage = pathname === "/" || pathname === "/login";
  const mainClassName = isBarePage
    ? "w-full"
    : "mx-auto w-full max-w-[1440px] px-6 py-8 lg:px-8";

  return (
    <div className="min-h-screen bg-canvas">
      {!isBarePage && <TopNav />}
      <ErrorBoundary key={pathname}>
        <main className={mainClassName}>
          <Outlet />
        </main>
      </ErrorBoundary>
    </div>
  );
}