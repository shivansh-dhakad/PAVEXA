import { Link } from "react-router-dom";
import { Compass } from "lucide-react";
import ErrorView from "../components/ErrorView";

export default function NotFound() {
  return (
    <ErrorView
      icon={Compass}
      code="404 / ROUTE_NOT_FOUND"
      title="This route is off the survey map"
      body="Nothing exists at this address. Go back to the home page or sign in to a workspace."
      actions={
        <>
          <Link to="/" className="btn btn-primary">Home</Link>
          <Link to="/login" className="btn btn-ghost">Sign in</Link>
        </>
      }
    />
  );
}
