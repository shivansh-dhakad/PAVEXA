import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import ErrorView from "../components/ErrorView";

export default function ServerError() {
  return (
    <ErrorView
      icon={AlertTriangle}
      code="500 / INFERENCE_ERROR"
      title="Inference pipeline encountered an error"
      body="The model could not process this request. This can be caused by a corrupted image, an unsupported colour space, or a backend timeout. Try a different file."
      actions={
        <>
          <Link to="/login" className="btn btn-primary">Back to workspaces</Link>
          <Link to="/" className="btn btn-ghost">Home</Link>
        </>
      }
    />
  );
}
