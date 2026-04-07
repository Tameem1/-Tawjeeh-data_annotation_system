import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Bot,
  CalendarDays,
  CheckCircle2,
  FileStack,
  Globe2,
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

const highlights = [
  {
    icon: Bot,
    title: "AI-assisted review loops",
    description: "Run model suggestions, compare outputs, and approve or edit annotations without breaking focus.",
  },
  {
    icon: ShieldCheck,
    title: "Operational QA visibility",
    description: "Track agreement, throughput, audit activity, and annotator quality from one measured surface.",
  },
  {
    icon: Languages,
    title: "Arabic and English ready",
    description: "Support bilingual teams with RTL-aware workflows and localized interface coverage.",
  },
];

const productModules = [
  {
    icon: LayoutDashboard,
    title: "Annotation workspace",
    description: "Move between focused record review and high-volume browsing while keeping metadata and comments close to the work.",
  },
  {
    icon: FileStack,
    title: "Task configuration",
    description: "Use XML forms, templates, and structured custom fields to tailor each project to its annotation protocol.",
  },
  {
    icon: Users2,
    title: "Team orchestration",
    description: "Assign managers and annotators, publish guidelines, and keep collaboration grounded in project context.",
  },
  {
    icon: Globe2,
    title: "Import and export flow",
    description: "Bring in files or Hugging Face datasets, then export clean outputs for downstream production pipelines.",
  },
];

const workflowSteps = [
  "Import text, image, audio, or dataset-driven tasks into a structured project.",
  "Define labels, custom fields, guidelines, and model policies for the workflow.",
  "Let annotators work with AI assistance, comments, filters, and progress tracking.",
  "Review quality through IAA, dashboards, audit logs, and export-ready outputs.",
];

export default function LandingPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
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

  const handleDemoSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      const result = await apiClient.marketing.createDemoRequest(demoForm);
      toast({
        title: "Demo request received",
        description: result.redirectUrl ? "Redirecting you to Calendly." : "Your request was saved successfully.",
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
        title: "Could not submit demo request",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-page">
      <div className="mx-auto flex max-w-7xl flex-col gap-12 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        <header className="surface-card sticky top-4 z-20 rounded-[2rem] border border-border/70 px-5 py-4 backdrop-blur md:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <BrandLogo className="brand-tile h-12 w-12 rounded-[1rem] p-2" />
              <div>
                <p className="eyebrow">Tawjeeh Annotation</p>
                <p className="mt-1 text-sm text-muted-foreground">Annotation infrastructure for teams that need speed, quality, and control.</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <LanguageSwitcherInline />
              <ThemeToggle />
              <Button variant="outline" onClick={() => navigate("/app")}>
                Login
              </Button>
              <Button variant="secondary" onClick={() => document.getElementById("demo-request")?.scrollIntoView({ behavior: "smooth" })}>
                Request Demo
              </Button>
            </div>
          </div>
        </header>

        <section className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-12">
          <div className="space-y-7">
            <div className="space-y-4">
              <p className="eyebrow">ElevenLabs-inspired system</p>
              <h1 className="display-hero max-w-4xl">
                A quieter, sharper annotation platform for bilingual production teams.
              </h1>
              <p className="max-w-2xl text-[1.12rem] text-muted-foreground body-airy">
                Tawjeeh brings AI-assisted labeling, structured workflows, team assignment, and quality oversight into a premium self-hosted product designed to feel calm under real operational load.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button size="lg" onClick={() => document.getElementById("demo-request")?.scrollIntoView({ behavior: "smooth" })}>
                Request a Demo
              </Button>
              <Button size="lg" variant="secondary" onClick={() => navigate("/app")}>
                Enter the App
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {highlights.map(({ icon: Icon, title, description }) => (
                <Card key={title} className="rounded-[1.5rem]">
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

          <div className="relative">
            <div className="absolute inset-x-10 inset-y-12 -z-10 rounded-[2rem] bg-[linear-gradient(135deg,hsl(var(--stone)),transparent_60%)] blur-3xl" />
            <Card className="overflow-hidden rounded-[2rem]">
              <CardContent className="p-0">
                <div className="border-b border-border/70 bg-[linear-gradient(180deg,hsl(var(--background)),hsl(var(--secondary)))] px-6 py-6 sm:px-8">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="eyebrow">Platform Snapshot</p>
                      <h2 className="mt-3 text-[2.5rem] leading-[1]">Everything your subscribers need to annotate at scale.</h2>
                    </div>
                    <div className="surface-warm rounded-full px-4 py-2 text-right">
                      <p className="text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">Coverage</p>
                      <p className="mt-1 text-sm font-medium text-foreground">Text, image, audio, QA</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 p-6 sm:p-8">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="surface-card rounded-[1.5rem] border border-border/70 p-5">
                      <p className="text-sm text-muted-foreground">Workspace modes</p>
                      <p className="mt-3 font-display text-[2.2rem] leading-none">Record + List</p>
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">Switch between deep review and broad browsing without changing context.</p>
                    </div>
                    <div className="surface-card rounded-[1.5rem] border border-border/70 p-5">
                      <p className="text-sm text-muted-foreground">Interface coverage</p>
                      <p className="mt-3 font-display text-[2.2rem] leading-none">Arabic + English</p>
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">RTL-aware localization built for regional operations, not added as an afterthought.</p>
                    </div>
                  </div>

                  <div className="surface-card rounded-[1.75rem] border border-border/70 p-5">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="eyebrow">Operational Flow</p>
                        <p className="mt-2 text-base text-muted-foreground">From project setup to export-ready annotations</p>
                      </div>
                      <ArrowRight className="h-5 w-5" />
                    </div>
                    <div className="mt-5 grid gap-3">
                      {workflowSteps.map((step, index) => (
                        <div key={step} className="surface-warm flex items-start gap-4 rounded-[1.25rem] px-4 py-4">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                            {index + 1}
                          </div>
                          <p className="text-sm leading-6 text-foreground">{step}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="rounded-[2rem]">
            <CardHeader>
              <p className="eyebrow">Core Product</p>
              <CardTitle className="mt-3">The platform now reflects the actual product surface.</CardTitle>
              <CardDescription className="body-airy max-w-2xl text-base">
                The redesign keeps the interface restrained and confident while showing the tools subscriber teams actually use day to day.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
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
              <p className="eyebrow">Included</p>
              <CardTitle className="mt-3">Subscriber value stays front and center.</CardTitle>
              <CardDescription className="body-airy text-base">
                The experience speaks in clear outcomes rather than implementation details.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                "AI suggestions with accept, edit, and reject review loops",
                "Role-based access for admins, managers, and annotators",
                "Annotation guidelines, comments, and in-app notifications",
                "Custom task templates and structured field configuration",
                "IAA dashboards, audit logs, and annotator performance views",
                "Dataset import and export for production-ready pipelines",
              ].map((item) => (
                <div key={item} className="surface-warm flex items-start gap-3 rounded-[1.25rem] px-4 py-4 text-sm">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="leading-6">{item}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <section id="demo-request" className="surface-warm rounded-[2rem] border border-border/70 px-5 py-6 sm:px-8 sm:py-8">
          <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-8">
            <div className="space-y-4">
              <p className="eyebrow">Demo & Access</p>
              <h2 className="display-section max-w-lg">See the workflow in action.</h2>
              <p className="max-w-lg text-base text-muted-foreground body-airy">
                Tell us what kind of annotation operation you run and we’ll guide you through the right setup, review, QA, and export flow.
              </p>
              {calendlyUrl ? (
                <Button asChild variant="outline">
                  <a href={calendlyUrl} target="_blank" rel="noreferrer">
                    <CalendarDays className="mr-2 h-4 w-4" />
                    Open Calendar
                  </a>
                </Button>
              ) : (
                <p className="rounded-[1.25rem] border border-border/70 bg-card/80 px-4 py-3 text-sm text-muted-foreground">
                  Demo requests will still be saved even if the calendar link has not been configured yet.
                </p>
              )}
            </div>

            <form onSubmit={handleDemoSubmit} className="surface-card rounded-[1.75rem] border border-border/70 p-5 sm:p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="demo-name">Name</Label>
                  <Input id="demo-name" value={demoForm.name} onChange={(event) => setDemoForm((prev) => ({ ...prev, name: event.target.value }))} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="demo-email">Email</Label>
                  <Input id="demo-email" type="email" value={demoForm.email} onChange={(event) => setDemoForm((prev) => ({ ...prev, email: event.target.value }))} required />
                </div>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="demo-organization">Organization</Label>
                  <Input id="demo-organization" value={demoForm.organization} onChange={(event) => setDemoForm((prev) => ({ ...prev, organization: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="demo-phone">Phone</Label>
                  <Input id="demo-phone" value={demoForm.phone} onChange={(event) => setDemoForm((prev) => ({ ...prev, phone: event.target.value }))} />
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <Label htmlFor="demo-message">Message</Label>
                <Textarea
                  id="demo-message"
                  rows={5}
                  value={demoForm.message}
                  onChange={(event) => setDemoForm((prev) => ({ ...prev, message: event.target.value }))}
                  placeholder="Tell us about your annotation workflow, data types, or team setup."
                />
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">Existing subscribers can also use direct app access for ongoing work.</p>
                <Button type="submit" disabled={loading}>
                  {loading ? "Submitting..." : "Submit Request"}
                </Button>
              </div>
            </form>
          </div>
        </section>

        <footer className="surface-card flex flex-col gap-3 rounded-[1.75rem] border border-border/70 px-5 py-5 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
          <p>Tawjeeh Annotation helps subscriber teams run AI-assisted annotation workflows with stronger QA and calmer bilingual collaboration.</p>
          <div className="flex items-center gap-4">
            <Link to="/signup" className="transition-colors hover:text-foreground">
              Invite Signup
            </Link>
            <button className="transition-colors hover:text-foreground" onClick={() => navigate("/app")}>
              App Login
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
