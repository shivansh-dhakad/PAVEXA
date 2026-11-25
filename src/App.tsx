import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Prediction from "./pages/Prediction";
import NotFound from "./pages/NotFound";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="predict" element={<Prediction />} />
        <Route path="dashboard" element={<Navigate to="/" replace />} />
        <Route path="predictions" element={<Navigate to="/predict" replace />} />
        <Route path="lab/*" element={<Navigate to="/predict" replace />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
