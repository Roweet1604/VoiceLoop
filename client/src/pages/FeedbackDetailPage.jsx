import { useLocation, useNavigate, useParams } from "react-router";
import FeedbackDetail, { BackLink } from "../components/feedback/FeedbackDetail.jsx";

// Stand-alone page for one feedback item (/app/feedback/:feedbackId). The
// inbox shows the same detail in its right-hand pane.
export default function FeedbackDetailPage() {
  const { feedbackId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const backTo = `/app/feedback${location.state?.fromSearch ?? ""}`;

  return (
    <div className="mx-auto max-w-3xl rounded-card border border-border bg-panel shadow-card">
      <FeedbackDetail
        key={feedbackId}
        feedbackId={feedbackId}
        headingLevel="h1"
        back={<BackLink to={backTo} />}
        onDeleted={() => navigate(backTo, { replace: true, state: { feedbackDeleted: true } })}
      />
    </div>
  );
}
