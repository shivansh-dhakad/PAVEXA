import { Link } from "react-router-dom";
import { Compass } from "lucide-react";
import ErrorView from "../components/ErrorView";

export default function NotFound() {
  return (
    <ErrorView
      icon={Compass}
      code="404 / ROUTE_NOT_FOUND"
      title="Page not found"
      body="This address does not match the project dashboard or prediction testing page."
      actions={
        <>
          <Link to="/" className="btn btn-primary">Home</Link>
          <Link to="/predict" className="btn btn-ghost">Predictions</Link>
        </>
      }
    />
  );
}
