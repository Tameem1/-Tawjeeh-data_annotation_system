import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ExternalLink, Trash2, Save, Upload, AlertTriangle, Layers, Code2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { projectService } from "@/services/projectService";
import { parseAnnotationConfigXML } from "@/services/xmlConfigService";
import apiClient from "@/services/apiClient";
import { AnnotationFormPreview } from "@/components/AnnotationFormPreview";
import { TemplatePickerModal } from "@/components/TemplatePickerModal";
import { FormBuilder } from "@/components/FormBuilder";
import { toast } from "@/components/ui/use-toast";
import type { Project } from "@/types/data";
import { SubscriptionAccessCard } from "@/components/SubscriptionAccessCard";
import { buildDefaultProjectAIPrompt } from "@/utils/aiPromptUtils";

export default function ProjectSettings() {
    const { projectId } = useParams<{ projectId: string }>();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { currentUser } = useAuth();

    const [project, setProject] = useState<Project | null>(null);
    const [allUsers, setAllUsers] = useState<{ id: string; username: string; roles: string[] }[]>([]);
    const [loading, setLoading] = useState(true);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    // Section state — mirrors project fields
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [managerId, setManagerId] = useState<string | null>(null);
    const [annotatorIds, setAnnotatorIds] = useState<string[]>([]);
    const [guidelines, setGuidelines] = useState("");
    const [aiPrompt, setAiPrompt] = useState("");
    const [xmlConfig, setXmlConfig] = useState("");
    const [xmlError, setXmlError] = useState("");
    const [iaaEnabled, setIaaEnabled] = useState(false);
    const [iaaPortion, setIaaPortion] = useState(20);
    const [iaaAnnotatorsPerItem, setIaaAnnotatorsPerItem] = useState(2);

    const xmlFileRef = useRef<HTMLInputElement>(null);
    const [showTemplatePicker, setShowTemplatePicker] = useState(false);
    const [builderMode, setBuilderMode] = useState<'visual' | 'xml'>('visual');

    const isAdmin = currentUser?.roles?.includes("admin");
    const isSuperAdmin = currentUser?.roles?.includes("super_admin");

    // ── Load data ────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!projectId) return;
        Promise.all([
            projectService.getById(projectId),
            apiClient.users.getAll(),
        ]).then(([proj, users]) => {
            if (!proj) { navigate("/app"); return; }

            const userIsAdmin = currentUser?.roles?.includes("admin");
            const userIsManager = proj.managerId === currentUser?.id;
            if (!userIsAdmin && !userIsManager) { navigate("/app"); return; }

            setProject(proj);
            setAllUsers(users);
            setName(proj.name);
            setDescription(proj.description || "");
            setManagerId(proj.managerId ?? null);
            setAnnotatorIds(proj.annotatorIds ?? []);
            setGuidelines(proj.guidelines || "");
            setAiPrompt(proj.uploadPrompt || "");
            setXmlConfig(proj.xmlConfig || "");
            setIaaEnabled(proj.iaaConfig?.enabled ?? false);
            setIaaPortion(proj.iaaConfig?.portionPercent ?? 20);
            setIaaAnnotatorsPerItem(proj.iaaConfig?.annotatorsPerIAAItem ?? 2);
        }).finally(() => setLoading(false));
    }, [projectId, currentUser, navigate]);

    if (currentUser?.hasActiveAccess === false && !isSuperAdmin) {
        return <SubscriptionAccessCard reason={currentUser.accessReason} onBackToHome={() => navigate("/")} />;
    }

    // ── Save helpers ─────────────────────────────────────────────────────────
    const saveGeneral = async () => {
        if (!project) return;
        try {
            await projectService.update({ ...project, name, description });
            setProject(p => p ? { ...p, name, description } : p);
            toast({ title: t("common.success"), description: t("projectSettings.savedDetails") });
        } catch {
            toast({ title: t("common.error"), description: t("projectSettings.failedSave"), variant: "destructive" });
        }
    };

    const saveTeam = async () => {
        if (!project) return;
        try {
            await projectService.updateAccess(project.id, {
                managerId: isAdmin ? managerId : project.managerId,
                annotatorIds,
            });
            setProject(p => p ? { ...p, managerId: isAdmin ? managerId : p.managerId, annotatorIds } : p);
            toast({ title: t("common.success"), description: t("projectSettings.savedTeam") });
        } catch {
            toast({ title: t("common.error"), description: t("projectSettings.failedSaveTeam"), variant: "destructive" });
        }
    };

    const saveGuidelines = async () => {
        if (!project) return;
        try {
            await projectService.update({ ...project, guidelines });
            setProject(p => p ? { ...p, guidelines } : p);
            toast({ title: t("common.success"), description: t("projectSettings.savedGuidelines") });
        } catch {
            toast({ title: t("common.error"), description: t("projectSettings.failedSaveGuidelines"), variant: "destructive" });
        }
    };

    const saveAiPrompt = async () => {
        if (!project) return;
        try {
            await projectService.update({ ...project, uploadPrompt: aiPrompt });
            setProject(p => p ? { ...p, uploadPrompt: aiPrompt } : p);
            toast({ title: t("common.success"), description: t("projectSettings.savedAiPrompt") });
        } catch {
            toast({ title: t("common.error"), description: t("projectSettings.failedSaveAiPrompt"), variant: "destructive" });
        }
    };

    const saveXmlConfig = async () => {
        if (!project) return;
        setXmlError("");
        if (xmlConfig.trim()) {
            try {
                parseAnnotationConfigXML(xmlConfig);
            } catch (err) {
                setXmlError(`Invalid XML: ${err instanceof Error ? err.message : "Parse error"}`);
                return;
            }
        }
        try {
            await projectService.update({ ...project, xmlConfig });
            setProject(p => p ? { ...p, xmlConfig } : p);
            toast({ title: t("common.success"), description: t("projectSettings.savedAnnotationForm") });
        } catch {
            toast({ title: t("common.error"), description: t("projectSettings.failedSaveXml"), variant: "destructive" });
        }
    };

    const handleXmlFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const text = await file.text();
        setXmlConfig(text);
        setXmlError("");
        e.target.value = "";
    };

    const saveIaa = async () => {
        if (!project) return;
        try {
            const iaaConfig = { enabled: iaaEnabled, portionPercent: iaaPortion, annotatorsPerIAAItem: iaaAnnotatorsPerItem };
            await projectService.update({ ...project, iaaConfig });
            setProject(p => p ? { ...p, iaaConfig } : p);
            toast({ title: t("common.success"), description: t("projectSettings.savedIAA") });
        } catch {
            toast({ title: t("common.error"), description: t("projectSettings.failedSaveIAA"), variant: "destructive" });
        }
    };

    const deleteProject = async () => {
        if (!project) return;
        try {
            await projectService.delete(project.id);
            navigate("/app");
        } catch {
            toast({ title: t("common.error"), description: t("projectSettings.failedDeleteProject"), variant: "destructive" });
        }
    };

    const toggleAnnotator = (userId: string) => {
        setAnnotatorIds(prev =>
            prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
        );
    };

    // ── Render ───────────────────────────────────────────────────────────────
    if (loading) {
        return (
            <div className="app-page flex h-screen items-center justify-center text-muted-foreground">
                {t("projectSettings.loadingSettings")}
            </div>
        );
    }

    if (!project) return null;

    const adminUsers = allUsers.filter(u => u.roles?.includes("admin") || u.roles?.includes("manager"));
    const annotatorUsers = allUsers.filter(u => u.roles?.includes("annotator"));
    const defaultAiPrompt = (() => {
        try {
            const parsedConfig = xmlConfig.trim() ? parseAnnotationConfigXML(xmlConfig) : null;
            return buildDefaultProjectAIPrompt(parsedConfig, guidelines);
        } catch {
            return buildDefaultProjectAIPrompt(null, guidelines);
        }
    })();

    return (
        <div className="app-page">
            {/* Header */}
            <div className="sticky top-0 z-10 border-b border-border/60 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70">
                <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <Button variant="ghost" size="sm" onClick={() => navigate("/app")}>
                            <ArrowLeft className="w-4 h-4 mr-1.5" />
                            {t("projectSettings.projects")}
                        </Button>
                        <span className="text-muted-foreground">/</span>
                        <span className="font-semibold truncate">{project.name}</span>
                    </div>
                    <Button size="sm" onClick={() => navigate(`/app/project/${projectId}`)}>
                        {t("projectSettings.openWorkspace")}
                        <ExternalLink className="w-4 h-4 ml-1.5" />
                    </Button>
                </div>
            </div>

            <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
                <div>
                    <p className="eyebrow">Project Configuration</p>
                    <h1 className="mt-2 text-[2.5rem]">{t("projectSettings.title")}</h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        {t("projectSettings.pageSubtitle")}
                    </p>
                </div>

                {/* 1 — General */}
                <Card className="rounded-[2rem]">
                    <CardHeader>
                        <CardTitle>{t("projectSettings.general")}</CardTitle>
                        <CardDescription>{t("projectSettings.generalDescription")}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="proj-name">{t("projectSettings.projectName")}</Label>
                            <Input id="proj-name" value={name} onChange={e => setName(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="proj-desc">{t("projectSettings.description")}</Label>
                            <Textarea id="proj-desc" value={description} onChange={e => setDescription(e.target.value)} rows={3} />
                        </div>
                        <div className="flex justify-end">
                            <Button size="sm" onClick={saveGeneral} disabled={!name.trim()}>
                                <Save className="w-4 h-4 mr-1.5" />
                                {t("common.save")}
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* 2 — Annotation Form */}
                <TemplatePickerModal
                    open={showTemplatePicker}
                    onClose={() => setShowTemplatePicker(false)}
                    onApply={xml => { setXmlConfig(xml); setXmlError(""); }}
                    currentXml={xmlConfig}
                />
                <Card className="rounded-[2rem]">
                    <CardHeader>
                        <div className="flex items-start justify-between">
                            <div>
                                <CardTitle>{t("projectSettings.annotationFormTitle")}</CardTitle>
                                        <CardDescription>
                                    {t("projectSettings.annotationFormDescription")}
                                </CardDescription>
                            </div>
                            <Button variant="outline" size="sm" onClick={() => setShowTemplatePicker(true)}>
                                <Layers className="w-4 h-4 mr-1.5" />
                                {t("projectSettings.useTemplate")}
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* Mode toggle */}
                        <div className="surface-card flex w-fit items-center gap-1 rounded-full border border-border/70 p-1">
                            <Button
                                variant={builderMode === 'visual' ? 'secondary' : 'ghost'}
                                size="sm"
                                className="h-7 text-xs gap-1.5"
                                onClick={() => {
                                    if (builderMode === 'xml' && xmlConfig.trim()) {
                                        try {
                                            // Validate XML before switching to visual
                                            parseAnnotationConfigXML(xmlConfig);
                                        } catch {
                                            toast({ title: t("projectSettings.cannotSwitchToVisual"), description: t("projectSettings.fixXmlError"), variant: "destructive" });
                                            return;
                                        }
                                    }
                                    setBuilderMode('visual');
                                }}
                            >
                                <Eye className="w-3.5 h-3.5" /> {t("projectSettings.visual")}
                            </Button>
                            <Button
                                variant={builderMode === 'xml' ? 'secondary' : 'ghost'}
                                size="sm"
                                className="h-7 text-xs gap-1.5"
                                onClick={() => setBuilderMode('xml')}
                            >
                                <Code2 className="w-3.5 h-3.5" /> {t("projectSettings.xml")}
                            </Button>
                        </div>

                        {builderMode === 'visual' ? (
                            /* Visual builder + preview side-by-side on desktop */
                            <div className="hidden md:grid md:grid-cols-2 md:gap-6">
                                <div className="space-y-3">
                                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("projectSettings.builder")}</p>
                                    <FormBuilder
                                        xmlConfig={xmlConfig}
                                        onChange={xml => { setXmlConfig(xml); setXmlError(""); }}
                                    />
                                </div>
                                <div className="space-y-3">
                                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("projectSettings.preview")}</p>
                                    <AnnotationFormPreview xmlConfig={xmlConfig} className="min-h-[200px]" />
                                </div>
                            </div>
                        ) : (
                            /* XML editor + preview side-by-side on desktop */
                            <div className="hidden md:grid md:grid-cols-2 md:gap-6">
                                <div className="space-y-3">
                                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("projectSettings.xmlEditor")}</p>
                                    <Textarea
                                        value={xmlConfig}
                                        onChange={e => { setXmlConfig(e.target.value); setXmlError(""); }}
                                        rows={12}
                                        className="font-mono text-sm"
                                        placeholder="<annotation-config>&#10;  <!-- paste your XML here -->&#10;</annotation-config>"
                                    />
                                    {xmlError && <p className="text-sm text-destructive">{xmlError}</p>}
                                </div>
                                <div className="space-y-3">
                                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("projectSettings.preview")}</p>
                                    <AnnotationFormPreview xmlConfig={xmlConfig} className="min-h-[272px]" />
                                </div>
                            </div>
                        )}

                        {/* Mobile: always stacked */}
                        <div className="md:hidden space-y-3">
                            {builderMode === 'visual' ? (
                                <FormBuilder
                                    xmlConfig={xmlConfig}
                                    onChange={xml => { setXmlConfig(xml); setXmlError(""); }}
                                />
                            ) : (
                                <>
                                    <Textarea
                                        value={xmlConfig}
                                        onChange={e => { setXmlConfig(e.target.value); setXmlError(""); }}
                                        rows={10}
                                        className="font-mono text-sm"
                                        placeholder="<annotation-config>&#10;  <!-- paste your XML here -->&#10;</annotation-config>"
                                    />
                                    {xmlError && <p className="text-sm text-destructive">{xmlError}</p>}
                                </>
                            )}
                            <div className="space-y-1.5">
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("projectSettings.preview")}</p>
                                <AnnotationFormPreview xmlConfig={xmlConfig} />
                            </div>
                        </div>

                        <div className="flex items-center justify-between">
                            <Button variant="outline" size="sm" onClick={() => xmlFileRef.current?.click()}>
                                <Upload className="w-4 h-4 mr-1.5" />
                                {t("projectSettings.uploadXmlFile")}
                            </Button>
                            <input
                                ref={xmlFileRef}
                                type="file"
                                accept=".xml"
                                className="hidden"
                                onChange={handleXmlFileUpload}
                            />
                            <Button size="sm" onClick={saveXmlConfig}>
                                <Save className="w-4 h-4 mr-1.5" />
                                {t("common.save")}
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* 4 — Team */}
                <Card className="rounded-[2rem]">
                    <CardHeader>
                        <CardTitle>{t("projectSettings.team")}</CardTitle>
                        <CardDescription>{t("projectSettings.teamDescription")}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
                        {isAdmin && (
                            <div className="space-y-1.5">
                                <Label>{t("projectSettings.manager")}</Label>
                                <Select value={managerId ?? ""} onValueChange={v => setManagerId(v || null)}>
                                    <SelectTrigger>
                                        <SelectValue placeholder={t("projectSettings.selectManager")} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {adminUsers.map(u => (
                                            <SelectItem key={u.id} value={u.id}>{u.username}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                        <div className="space-y-1.5">
                            <Label>{t("projectSettings.annotatorsLabel")}</Label>
                            <div className="max-h-56 overflow-y-auto rounded-[1.25rem] border border-border/70 divide-y">
                                {annotatorUsers.length === 0 && (
                                    <p className="text-sm text-muted-foreground p-3">{t("projectSettings.noAnnotatorAccounts")}</p>
                                )}
                                {annotatorUsers.map(u => (
                                    <label key={u.id} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-secondary/70">
                                        <Checkbox
                                            checked={annotatorIds.includes(u.id)}
                                            onCheckedChange={() => toggleAnnotator(u.id)}
                                        />
                                        <span className="text-sm">{u.username}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                        <div className="flex justify-end">
                            <Button size="sm" onClick={saveTeam}>
                                <Save className="w-4 h-4 mr-1.5" />
                                {t("common.save")}
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* 5 — Guidelines */}
                <Card className="rounded-[2rem]">
                    <CardHeader>
                        <CardTitle>{t("projectSettings.annotationGuidelines")}</CardTitle>
                        <CardDescription>{t("projectSettings.guidelinesDescription")}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Textarea
                            value={guidelines}
                            onChange={e => setGuidelines(e.target.value)}
                            rows={12}
                            className="font-mono text-sm"
                            placeholder="# Guidelines&#10;&#10;Describe how annotators should label items..."
                        />
                        <div className="flex justify-end">
                            <Button size="sm" onClick={saveGuidelines}>
                                <Save className="w-4 h-4 mr-1.5" />
                                {t("common.save")}
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* 6 — AI Prompt */}
                <Card className="rounded-[2rem]">
                    <CardHeader>
                        <CardTitle>{t("projectSettings.aiPromptTitle")}</CardTitle>
                        <CardDescription>{t("projectSettings.aiPromptDescription")}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Textarea
                            value={aiPrompt}
                            onChange={e => setAiPrompt(e.target.value)}
                            rows={12}
                            className="font-mono text-sm"
                            placeholder={defaultAiPrompt}
                        />
                        <p className="text-sm text-muted-foreground">
                            {t("projectSettings.aiPromptHelp")}
                        </p>
                        <div className="rounded-[1.25rem] border border-border/70 bg-muted/30 p-4 space-y-2">
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                {t("projectSettings.aiPromptDefaultPreview")}
                            </p>
                            <pre className="whitespace-pre-wrap break-words text-xs text-muted-foreground font-mono">
                                {defaultAiPrompt}
                            </pre>
                        </div>
                        <div className="flex justify-end">
                            <Button size="sm" onClick={saveAiPrompt}>
                                <Save className="w-4 h-4 mr-1.5" />
                                {t("common.save")}
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* 7 — IAA */}
                <Card className="rounded-[2rem]">
                    <CardHeader>
                        <CardTitle>{t("projectSettings.iaaTitle")}</CardTitle>
                        <CardDescription>
                            {t("projectSettings.iaaDescription")}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
                        <div className="flex items-center gap-3">
                            <Switch checked={iaaEnabled} onCheckedChange={setIaaEnabled} id="iaa-toggle" />
                            <Label htmlFor="iaa-toggle">{t("projectSettings.enableIAA")}</Label>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="iaa-portion">{t("projectSettings.iaaPortion")}</Label>
                                <Input
                                    id="iaa-portion"
                                    type="number"
                                    min={0} max={100}
                                    value={iaaPortion}
                                    onChange={e => setIaaPortion(Number(e.target.value))}
                                    disabled={!iaaEnabled}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="iaa-count">{t("projectSettings.annotatorsPerIAA")}</Label>
                                <Input
                                    id="iaa-count"
                                    type="number"
                                    min={2} max={10}
                                    value={iaaAnnotatorsPerItem}
                                    onChange={e => setIaaAnnotatorsPerItem(Number(e.target.value))}
                                    disabled={!iaaEnabled}
                                />
                            </div>
                        </div>
                        <div className="flex justify-end">
                            <Button size="sm" onClick={saveIaa}>
                                <Save className="w-4 h-4 mr-1.5" />
                                {t("common.save")}
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* 8 — Danger Zone (admin only) */}
                {isAdmin && (
                    <Card className="rounded-[2rem] border-destructive/25">
                        <CardHeader>
                            <CardTitle className="text-destructive flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5" />
                                {t("projectSettings.dangerZoneTitle")}
                            </CardTitle>
                            <CardDescription>
                                {t("projectSettings.irreversibleActions")}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center justify-between rounded-[1.25rem] border border-destructive/25 bg-destructive/5 px-4 py-4">
                                <div>
                                    <p className="text-sm font-medium">{t("projectSettings.deleteThisProject")}</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        {t("projectSettings.deleteProjectWarning")}
                                    </p>
                                </div>
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => setShowDeleteConfirm(true)}
                                >
                                    <Trash2 className="w-4 h-4 mr-1.5" />
                                    {t("common.delete")}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Delete confirmation dialog */}
            <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t("projectSettings.deleteConfirmTitle", { name: project.name })}</DialogTitle>
                        <DialogDescription>
                            {t("projectSettings.deleteConfirmDescription")}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
                            {t("common.cancel")}
                        </Button>
                        <Button variant="destructive" onClick={deleteProject}>
                            <Trash2 className="w-4 h-4 mr-1.5" />
                            {t("projectSettings.deleteProject")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
