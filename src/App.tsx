import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import RequireRole from "./components/RequireRole";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import CitizenDashboard from "./pages/CitizenDashboard";
import NewComplaint from "./pages/NewComplaint";
import AuthorityDashboard from "./pages/AuthorityDashboard";
import ModelTesting from "./pages/ModelTesting";
import Batch from "./pages/Batch";
import Robustness from "./pages/Robustness";
import NotFound from "./pages/NotFound";
import ServerError from "./pages/ServerError";

// Old workspace URLs now send people to the login page
const LEGACY = ["dashboard", "predictions", "inspect", "batch", "map"];

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Landing />} />
        <Route path="login" element={<Login />} />

        <Route path="citizen" element={<RequireRole role="citizen"><CitizenDashboard /></RequireRole>} />
        <Route path="citizen/new" element={<RequireRole role="citizen"><NewComplaint /></RequireRole>} />
        <Route path="authority" element={<RequireRole role="authority"><AuthorityDashboard /></RequireRole>} />
        <Route path="lab" element={<RequireRole role="tester"><ModelTesting /></RequireRole>} />
        <Route path="lab/batch" element={<RequireRole role="tester"><Batch /></RequireRole>} />
        <Route path="lab/robustness" element={<RequireRole role="tester"><Robustness /></RequireRole>} />

        {LEGACY.map((p) => (
          <Route key={p} path={p} element={<Navigate to="/login" replace />} />
        ))}
        <Route path="500" element={<ServerError />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
