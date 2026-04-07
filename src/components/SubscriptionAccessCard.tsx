import { useEffect, useState } from "react";
import { CalendarDays, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiClient } from "@/services/apiClient";

type SubscriptionAccessCardProps = {
  reason?: string;
  onBackToHome?: () => void;
};

export function SubscriptionAccessCard({ reason, onBackToHome }: SubscriptionAccessCardProps) {
  const [calendlyUrl, setCalendlyUrl] = useState("");

  useEffect(() => {
    apiClient.marketing.getSettings()
      .then((result) => setCalendlyUrl(result.calendlyUrl || ""))
      .catch(() => setCalendlyUrl(""));
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted px-4 py-10">
      <Card className="w-full max-w-xl">
        <CardHeader className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <Lock className="h-7 w-7" />
          </div>
          <CardTitle className="mt-3 text-2xl">Subscription required</CardTitle>
          <CardDescription>
            {reason || "Your account does not currently have active paid access."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          {calendlyUrl ? (
            <Button asChild>
              <a href={calendlyUrl} target="_blank" rel="noreferrer">
                <CalendarDays className="mr-2 h-4 w-4" />
                Book an Appointment
              </a>
            </Button>
          ) : null}
          <Button variant="outline" onClick={onBackToHome}>Back to Landing Page</Button>
        </CardContent>
      </Card>
    </div>
  );
}
