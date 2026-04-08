import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Bot,
  CalendarDays,
  CheckCircle2,
  FileStack,
  Globe2,
  Sparkles,
  Languages,
  LayoutDashboard,
  ShieldCheck,
  Users2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { BrandLogo } from "@/components/BrandLogo";
import { apiClient } from "@/services/apiClient";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageSwitcherInline } from "@/components/LanguageSwitcher";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { UserMenu } from "@/components/UserMenu";

export default function LandingPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { currentUser, refreshCurrentUser } = useAuth();
  const [calendlyUrl, setCalendlyUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [demoForm, setDemoForm] = useState({
    name: "",
    email: "",
    organization: "",
    phone: "",
    message: "",
  });

  useEffect(() => {
    apiClient.marketing
      .getSettings()
      .then((result) => setCalendlyUrl(result.calendlyUrl || ""))
      .catch(() => setCalendlyUrl(""));
  }, []);

  useEffect(() => {
    refreshCurrentUser().catch(() => undefined);
  }, [refreshCurrentUser]);

  const handleDemoSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      const result = await apiClient.marketing.createDemoRequest(demoForm);
      toast({
        title: t("landing.demo.toastReceivedTitle"),
        description: result.redirectUrl ? t("landing.demo.toastRedirecting") : t("landing.demo.toastSaved"),
      });
      if (result.redirectUrl) {
        window.location.href = result.redirectUrl;
        return;
      }
      setDemoForm({
        name: "",
        email: "",
        organization: "",
        phone: "",
        message: "",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: t("landing.demo.toastFailedTitle"),
        description: error instanceof Error ? error.message : t("landing.demo.toastFailedDescription"),
      });
    } finally {
      setLoading(false);
    }
  };

  const highlights = [
    {
      icon: Bot,
      title: t("landing.highlights.ai.title"),
      description: t("landing.highlights.ai.description"),
    },
    {
      icon: ShieldCheck,
      title: t("landing.highlights.qa.title"),
      description: t("landing.highlights.qa.description"),
    },
    {
      icon: Languages,
      title: t("landing.highlights.languages.title"),
      description: t("landing.highlights.languages.description"),
    },
  ];

  const productModules = [
    {
      icon: LayoutDashboard,
      title: t("landing.modules.workspace.title"),
      description: t("landing.modules.workspace.description"),
    },
    {
      icon: FileStack,
      title: t("landing.modules.configuration.title"),
      description: t("landing.modules.configuration.description"),
    },
    {
      icon: Users2,
      title: t("landing.modules.team.title"),
      description: t("landing.modules.team.description"),
    },
    {
      icon: Globe2,
      title: t("landing.modules.importExport.title"),
      description: t("landing.modules.importExport.description"),
    },
  ];

  const workflowSteps = t("landing.workflow.steps", { returnObjects: true }) as string[];
  const aiCapabilities = t("landing.aiMatters.items", { returnObjects: true }) as string[];
  const snapshotCards = t("landing.snapshot.cards", { returnObjects: true }) as Array<{
    label: string;
    value: string;
    description: string;
  }>;
  const systemFitItems = t("landing.systemFit.items", { returnObjects: true }) as string[];
  const includedItems = t("landing.included.items", { returnObjects: true }) as string[];
  const aiWorkflowSteps = t("landing.aiWorkflow.steps", { returnObjects: true }) as string[];

  return (
    <div className="app-page">
      <div className="mx-auto flex max-w-7xl flex-col gap-20 px-4 py-6 sm:px-6 lg:px-8 lg:gap-24 lg:py-10">
        <header className="surface-card sticky top-4 z-20 rounded-[2rem] border border-border/70 px-5 py-4 backdrop-blur md:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <BrandLogo className="brand-tile h-12 w-12 rounded-[1rem] p-2" />
              <div>
                <p className="eyebrow">{t("landing.header.brand")}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t("landing.header.tagline")}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <LanguageSwitcherInline />
              <ThemeToggle />
              {currentUser ? (
                <>
                  <Button variant="outline" onClick={() => navigate("/app")}>
                    {t("user.profile")}
                  </Button>
                  <UserMenu />
                </>
              ) : (
                <Button variant="outline" onClick={() => navigate("/app")}>
                  {t("common.login")}
                </Button>
              )}
              <Button variant="secondary" onClick={() => document.getElementById("demo-request")?.scrollIntoView({ behavior: "smooth" })}>
                {t("landing.hero.requestDemo")}
              </Button>
            </div>
          </div>
        </header>

        <section className="grid gap-10 py-6 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:gap-16">
          <div className="space-y-10 motion-fade-up">
            <div className="space-y-5">
              <p className="eyebrow">{t("landing.hero.eyebrow")}</p>
              <h1 className="display-hero max-w-4xl">
                {t("landing.hero.title")}
              </h1>
              <p className="max-w-2xl text-[1.12rem] text-muted-foreground body-airy">
                {t("landing.hero.description")}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button size="lg" onClick={() => document.getElementById("demo-request")?.scrollIntoView({ behavior: "smooth" })}>
                {t("landing.hero.requestDemo")}
              </Button>
              <Button size="lg" variant="secondary" onClick={() => navigate("/app")}>
                {t("landing.hero.enterApp")}
              </Button>
            </div>

            <div className="grid gap-5 pt-4 md:grid-cols-3">
              {highlights.map(({ icon: Icon, title, description }) => (
                <Card key={title} className="rounded-[1.5rem] motion-fade-up">
                  <CardHeader className="pb-3">
                    <div className="surface-warm flex h-11 w-11 items-center justify-center rounded-full">
                      <Icon className="h-5 w-5" />
                    </div>
                    <CardTitle className="text-[1.55rem]">{title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-6 text-muted-foreground">{description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <div className="relative motion-fade-up">
            <div className="absolute inset-x-10 inset-y-12 -z-10 rounded-[2rem] bg-[radial-gradient(circle_at_top,hsl(var(--ai-primary)/0.16),transparent_45%),linear-gradient(135deg,hsl(var(--stone)),transparent_60%)] blur-3xl" />
            <div className="surface-card overflow-hidden rounded-[2rem] border border-border/70 p-6 sm:p-8">
              <div className="flex items-start justify-between gap-5">
                <div>
                  <p className="eyebrow">{t("landing.aiWorkflow.eyebrow")}</p>
                  <h2 className="mt-3 text-[2.35rem] leading-[0.98]">{t("landing.aiWorkflow.title")}</h2>
                </div>
                <div className="surface-warm motion-float rounded-full px-4 py-2 text-right">
                  <p className="text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">{t("landing.aiWorkflow.coverageLabel")}</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{t("landing.aiWorkflow.coverageValue")}</p>
                </div>
              </div>

              <div className="mt-8 grid gap-3">
                {aiWorkflowSteps.map((item, index) => (
                  <div key={item} className="surface-warm motion-fade-up flex items-center gap-4 rounded-[1.35rem] px-4 py-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                      {index + 1}
                    </div>
                    <p className="text-sm leading-6 text-foreground">{item}</p>
                  </div>
                ))}
              </div>

              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                <div className="surface-warm rounded-[1.5rem] p-5">
                  <p className="eyebrow">{t("landing.aiWorkflow.humanControlLabel")}</p>
                  <p className="mt-3 text-[1.55rem] leading-tight">{t("landing.aiWorkflow.humanControlValue")}</p>
                </div>
                <div className="surface-warm rounded-[1.5rem] p-5">
                  <p className="eyebrow">{t("landing.aiWorkflow.operationalValueLabel")}</p>
                  <p className="mt-3 text-[1.55rem] leading-tight">{t("landing.aiWorkflow.operationalValueValue")}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-8 py-2 lg:grid-cols-[0.95fr_1.05fr] lg:gap-10">
          <Card className="rounded-[2rem]">
            <CardHeader className="pb-4">
              <p className="eyebrow">{t("landing.aiMatters.eyebrow")}</p>
              <CardTitle className="mt-3">{t("landing.aiMatters.title")}</CardTitle>
              <CardDescription className="body-airy max-w-2xl text-base">
                {t("landing.aiMatters.description")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {aiCapabilities.map((item) => (
                <div key={item} className="surface-warm flex items-start gap-4 rounded-[1.4rem] px-5 py-5">
                  <div className="surface-card flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/70">
                    <Bot className="h-5 w-5" />
                  </div>
                  <p className="text-sm leading-7 text-foreground">{item}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-[2rem]">
            <CardHeader className="pb-4">
              <p className="eyebrow">{t("landing.systemFit.eyebrow")}</p>
              <CardTitle className="mt-3">{t("landing.systemFit.title")}</CardTitle>
              <CardDescription className="body-airy text-base">
                {t("landing.systemFit.description")}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {systemFitItems.map((item) => (
                <div key={item} className="surface-card rounded-[1.4rem] border border-border/70 p-5">
                  <p className="text-sm leading-7 text-muted-foreground">{item}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <section className="py-2">
          <div className="space-y-6 motion-fade-up">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <p className="eyebrow">{t("landing.snapshot.eyebrow")}</p>
                <h2 className="display-section mt-3">{t("landing.snapshot.title")}</h2>
                <p className="mt-3 text-base text-muted-foreground body-airy">
                  {t("landing.snapshot.description")}
                </p>
              </div>
              <div className="surface-warm inline-flex w-fit items-center gap-2 rounded-full px-4 py-2">
                <Sparkles className="h-4 w-4" />
                <span className="text-sm text-foreground">{t("landing.snapshot.badge")}</span>
              </div>
            </div>

            <div className="snapshot-shell relative overflow-hidden rounded-[2.25rem] border border-border/70 p-6 sm:p-8">
              <div className="absolute right-10 top-10 h-24 w-24 rounded-full bg-[radial-gradient(circle,hsl(var(--ai-primary)/0.22),transparent_68%)] blur-2xl" />
              <div className="absolute bottom-8 left-10 h-20 w-20 rounded-full bg-[radial-gradient(circle,hsl(var(--stone)/0.95),transparent_72%)] blur-2xl" />

              <div className="relative grid gap-6 lg:grid-cols-[0.92fr_1.08fr] lg:gap-8">
                <div className="space-y-4">
                  <p className="eyebrow">{t("landing.snapshot.messageLabel")}</p>
                  <h3 className="text-[2.6rem] leading-[0.98]">{t("landing.snapshot.messageTitle")}</h3>
                  <p className="text-base text-muted-foreground body-airy">
                    {t("landing.snapshot.messageDescription")}
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  {snapshotCards.map((card, index) => (
                    <div
                      key={card.label}
                      className="snapshot-card motion-fade-up rounded-[1.6rem] p-5"
                      style={{ animationDelay: `${index * 120}ms` }}
                    >
                      <p className="text-sm text-muted-foreground">{card.label}</p>
                      <p className="mt-3 font-display text-[2rem] leading-none">{card.value}</p>
                      <p className="mt-4 text-sm leading-6 text-muted-foreground">{card.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="relative mt-8 rounded-[1.8rem] border border-border/70 bg-card/85 p-5 sm:p-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="eyebrow">{t("landing.workflow.eyebrow")}</p>
                    <p className="mt-2 text-base text-muted-foreground">{t("landing.workflow.description")}</p>
                  </div>
                  <ArrowRight className="h-5 w-5 motion-slide-x" />
                </div>
                <div className="mt-5 grid gap-3 lg:grid-cols-4">
                  {workflowSteps.map((step, index) => (
                    <div
                      key={step}
                      className="snapshot-step motion-fade-up flex items-start gap-4 rounded-[1.35rem] px-4 py-4"
                      style={{ animationDelay: `${160 + index * 100}ms` }}
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                        {index + 1}
                      </div>
                      <p className="text-sm leading-6 text-foreground">{step}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-8 py-2 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="rounded-[2rem]">
            <CardHeader>
              <p className="eyebrow">{t("landing.coreProduct.eyebrow")}</p>
              <CardTitle className="mt-3">{t("landing.coreProduct.title")}</CardTitle>
              <CardDescription className="body-airy max-w-2xl text-base">
                {t("landing.coreProduct.description")}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2">
              {productModules.map(({ icon: Icon, title, description }) => (
                <div key={title} className="surface-card rounded-[1.5rem] border border-border/70 p-5">
                  <div className="surface-warm flex h-11 w-11 items-center justify-center rounded-full">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-5 text-[1.85rem]">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-[2rem]">
            <CardHeader>
              <p className="eyebrow">{t("landing.included.eyebrow")}</p>
              <CardTitle className="mt-3">{t("landing.included.title")}</CardTitle>
              <CardDescription className="body-airy text-base">
                {t("landing.included.description")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {includedItems.map((item) => (
                <div key={item} className="surface-warm flex items-start gap-3 rounded-[1.25rem] px-4 py-4 text-sm">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="leading-6">{item}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <section id="demo-request" className="surface-warm rounded-[2rem] border border-border/70 px-5 py-8 sm:px-8 sm:py-10">
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-12">
            <div className="space-y-4">
              <p className="eyebrow">{t("landing.demo.eyebrow")}</p>
              <h2 className="display-section max-w-lg">{t("landing.demo.title")}</h2>
              <p className="max-w-lg text-base text-muted-foreground body-airy">
                {t("landing.demo.description")}
              </p>
              {calendlyUrl ? (
                <Button asChild variant="outline">
                  <a href={calendlyUrl} target="_blank" rel="noreferrer">
                    <CalendarDays className="mr-2 h-4 w-4" />
                    {t("landing.demo.openCalendar")}
                  </a>
                </Button>
              ) : (
                <p className="rounded-[1.25rem] border border-border/70 bg-card/80 px-4 py-3 text-sm text-muted-foreground">
                  {t("landing.demo.calendarFallback")}
                </p>
              )}
            </div>

            <form onSubmit={handleDemoSubmit} className="surface-card rounded-[1.75rem] border border-border/70 p-5 sm:p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="demo-name">{t("common.name")}</Label>
                  <Input id="demo-name" value={demoForm.name} onChange={(event) => setDemoForm((prev) => ({ ...prev, name: event.target.value }))} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="demo-email">{t("common.email")}</Label>
                  <Input id="demo-email" type="email" value={demoForm.email} onChange={(event) => setDemoForm((prev) => ({ ...prev, email: event.target.value }))} required />
                </div>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="demo-organization">{t("landing.demo.organization")}</Label>
                  <Input id="demo-organization" value={demoForm.organization} onChange={(event) => setDemoForm((prev) => ({ ...prev, organization: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="demo-phone">{t("landing.demo.phone")}</Label>
                  <Input id="demo-phone" value={demoForm.phone} onChange={(event) => setDemoForm((prev) => ({ ...prev, phone: event.target.value }))} />
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <Label htmlFor="demo-message">{t("landing.demo.message")}</Label>
                <Textarea
                  id="demo-message"
                  rows={5}
                  value={demoForm.message}
                  onChange={(event) => setDemoForm((prev) => ({ ...prev, message: event.target.value }))}
                  placeholder={t("landing.demo.messagePlaceholder")}
                />
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">{t("landing.demo.existingSubscribers")}</p>
                <Button type="submit" disabled={loading}>
                  {loading ? t("landing.demo.submitting") : t("landing.demo.submit")}
                </Button>
              </div>
            </form>
          </div>
        </section>

        <footer className="surface-card flex flex-col gap-3 rounded-[1.75rem] border border-border/70 px-5 py-5 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
          <p>{t("landing.footer.copy")}</p>
          <div className="flex items-center gap-4">
            <Link to="/signup" className="transition-colors hover:text-foreground">
              {t("landing.footer.inviteSignup")}
            </Link>
            <button className="transition-colors hover:text-foreground" onClick={() => navigate("/app")}>
              {t("landing.footer.appLogin")}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
