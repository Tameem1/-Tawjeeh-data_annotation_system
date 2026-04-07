import { useNavigate } from "react-router-dom";
import DataLabelingWorkspace from "@/components/DataLabelingWorkspace";
import { useAuth } from "@/contexts/AuthContext";
import { SubscriptionAccessCard } from "@/components/SubscriptionAccessCard";

const Index = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  if (currentUser?.hasActiveAccess === false && !currentUser.roles.includes("super_admin")) {
    return <SubscriptionAccessCard reason={currentUser.accessReason} onBackToHome={() => navigate("/app")} />;
  }

  return <DataLabelingWorkspace />;
};

export default Index;
