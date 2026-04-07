import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const NotFound = () => {
  const location = useLocation();
  const { t } = useTranslation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="app-page flex min-h-screen items-center justify-center px-4 py-8">
      <Card className="w-full max-w-xl rounded-[2rem] text-center">
        <CardHeader>
          <p className="eyebrow">404</p>
          <CardTitle className="text-[3rem]">This page doesn&apos;t exist.</CardTitle>
          <CardDescription className="body-airy mx-auto max-w-md text-base">{t("notFound.message")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <a href="/">{t("notFound.returnHome")}</a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default NotFound;
