import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { modelManagementService } from "@/services/modelManagementService";
import { projectService } from "@/services/projectService";
import { AVAILABLE_PROVIDERS } from "@/services/aiProviders";
import { getAuthToken } from "@/services/apiClient";
import type { ModelProfile, Project, ProjectModelPolicy, ProviderConnection } from "@/types/data";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { UserMenu } from "@/components/UserMenu";
import { ThemeToggle } from "@/components/ThemeToggle";
import { toast } from "@/components/ui/use-toast";
import { Loader2 } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { SubscriptionAccessCard } from "@/components/SubscriptionAccessCard";

type RuntimeModelOption = {
  id: string;
  name: string;
  description?: string;
};

const ModelManagement = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const isManager = currentUser?.roles?.includes("manager") || currentUser?.roles?.includes("admin");
  const isSuperAdmin = currentUser?.roles?.includes("super_admin");

  const [connections, setConnections] = useState<ProviderConnection[]>([]);
  const [profiles, setProfiles] = useState<ModelProfile[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  const [editingConnectionId, setEditingConnectionId] = useState<string | null>(null);
  const [connectionProviderId, setConnectionProviderId] = useState<string>("");
  const [connectionName, setConnectionName] = useState("");
  const [connectionApiKey, setConnectionApiKey] = useState("");
  const [connectionBaseUrl, setConnectionBaseUrl] = useState("");
  const [connectionIsActive, setConnectionIsActive] = useState(true);
  const [editingConnectionHasStoredKey, setEditingConnectionHasStoredKey] = useState(false);

  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [profileConnectionId, setProfileConnectionId] = useState("");
  const [profileModelId, setProfileModelId] = useState("");
  const [profileDisplayName, setProfileDisplayName] = useState("");
  const [profileDefaultPrompt, setProfileDefaultPrompt] = useState("");
  const [profileTemperature, setProfileTemperature] = useState("");
  const [profileMaxTokens, setProfileMaxTokens] = useState("");
  const [profileInputPrice, setProfileInputPrice] = useState("");
  const [profileOutputPrice, setProfileOutputPrice] = useState("");
  const [profileIsActive, setProfileIsActive] = useState(true);

  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [allowedProfiles, setAllowedProfiles] = useState<string[]>([]);
  const [defaultProfiles, setDefaultProfiles] = useState<string[]>([]);
  const [testingProfileId, setTestingProfileId] = useState<string | null>(null);
  const [remoteModelsByConnection, setRemoteModelsByConnection] = useState<Record<string, RuntimeModelOption[]>>({});
  const [isLoadingRemoteModels, setIsLoadingRemoteModels] = useState(false);
  const [remoteModelsError, setRemoteModelsError] = useState<string | null>(null);
  const syncModelManagementState = useCallback(() => {
    setConnections(modelManagementService.getConnections());
    setProfiles(modelManagementService.getProfiles());
  }, []);
  const isOfficialProvider = useCallback((providerId: string) =>
    providerId === "openai"
    || providerId === "anthropic"
    || providerId === "openrouter"
    || providerId === "gemini", []);

  useEffect(() => {
    const init = async () => {
      await Promise.all([
        projectService.initialize(),
        modelManagementService.initialize()
      ]);

      const loadedProjects = await projectService.getAll();
      setProjects(loadedProjects);
      syncModelManagementState();
    };
    const unsubscribe = modelManagementService.subscribe(syncModelManagementState);
    init();
    return unsubscribe;
  }, [syncModelManagementState]);

  useEffect(() => {
    if (!selectedProjectId) {
      setAllowedProfiles([]);
      setDefaultProfiles([]);
      return;
    }
    const policy = modelManagementService.getProjectPolicy(selectedProjectId);
    setAllowedProfiles(policy?.allowedModelProfileIds ?? []);
    setDefaultProfiles(policy?.defaultModelProfileIds ?? []);
  }, [selectedProjectId]);

  const connectionOptions = useMemo(() => connections.filter(c => c.isActive), [connections]);
  const providerLookup = useMemo(() => new Map(AVAILABLE_PROVIDERS.map(p => [p.id, p])), []);
  const connectionLookup = useMemo(() => new Map(connections.map(c => [c.id, c])), [connections]);
  const selectedProfileConnection = profileConnectionId ? connectionLookup.get(profileConnectionId) : undefined;
  const staticModelsForConnection = selectedProfileConnection
    ? (providerLookup.get(selectedProfileConnection.providerId)?.models ?? [])
    : [];
  const baseModelsForSelectedConnection = selectedProfileConnection
    && isOfficialProvider(selectedProfileConnection.providerId)
    ? (remoteModelsByConnection[selectedProfileConnection.id] ?? [])
    : staticModelsForConnection;
  const modelsForSelectedConnection = useMemo(() => {
    if (!profileModelId) return baseModelsForSelectedConnection;
    const exists = baseModelsForSelectedConnection.some(model => model.id === profileModelId);
    if (exists) return baseModelsForSelectedConnection;
    return [{ id: profileModelId, name: `${profileModelId} (current)` }, ...baseModelsForSelectedConnection];
  }, [baseModelsForSelectedConnection, profileModelId]);

  const profileOptions = useMemo(() => {
    return profiles.filter(profile => profile.isActive);
  }, [profiles]);

  const fetchOfficialModels = useCallback(async (connection: ProviderConnection, force = false) => {
    if (!isOfficialProvider(connection.providerId)) return;
    if (!connection.apiKey && !connection.hasApiKey) {
      setRemoteModelsError("API key is required to load official provider models.");
      return;
    }
    if (!force && remoteModelsByConnection[connection.id]?.length) return;

    const endpoint =
      connection.providerId === "openai"
        ? "/api/openai/models"
        : connection.providerId === "anthropic"
          ? "/api/anthropic/models"
          : connection.providerId === "openrouter"
            ? "/api/openrouter/models"
            : "/api/gemini/models";
    setIsLoadingRemoteModels(true);
    setRemoteModelsError(null);
    try {
      const response = await fetch(endpoint, {
        headers: {
          ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}),
          ...(connection.apiKey ? { "X-Provider-Api-Key": connection.apiKey } : {}),
          "X-Connection-Id": connection.id
        }
      });
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error("API route returned HTML. Start the backend server and verify /api proxy.");
      }
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error?.message || payload?.error || "Failed to load models");
      }
      const list = Array.isArray(payload?.data) ? payload.data : [];
      const mapped: RuntimeModelOption[] = list
        .map((item: unknown) => {
          const record = item as {
            id?: string;
            name?: string;
            display_name?: string;
            architecture?: {
              input_modalities?: string[];
              output_modalities?: string[];
            };
          };
          if (!record.id) return null;
          if (connection.providerId === "openrouter") {
            const inputModalities = record.architecture?.input_modalities || [];
            const outputModalities = record.architecture?.output_modalities || [];
            const textEligible = inputModalities.includes("text") && outputModalities.includes("text");
            if (!textEligible) return null;
          }
          return {
            id: record.id,
            name: record.display_name || record.name || record.id
          };
        })
        .filter((item): item is RuntimeModelOption => !!item);

      setRemoteModelsByConnection(prev => ({ ...prev, [connection.id]: mapped }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load provider models";
      setRemoteModelsError(message);
    } finally {
      setIsLoadingRemoteModels(false);
    }
  }, [isOfficialProvider, remoteModelsByConnection]);

  useEffect(() => {
    if (!profileConnectionId) return;
    const connection = connectionLookup.get(profileConnectionId);
    if (!connection) return;
    if (!isOfficialProvider(connection.providerId)) {
      setRemoteModelsError(null);
      return;
    }
    fetchOfficialModels(connection, false);
  }, [profileConnectionId, connectionLookup, fetchOfficialModels, isOfficialProvider]);

  useEffect(() => {
    if (editingProfileId) return;
    if (!profileModelId) return;
    const isStillAvailable = modelsForSelectedConnection.some(model => model.id === profileModelId);
    if (!isStillAvailable) {
      setProfileModelId("");
    }
  }, [editingProfileId, profileModelId, modelsForSelectedConnection]);

  const handleTestProfile = async (profile: ModelProfile) => {
    const connection = connectionLookup.get(profile.providerConnectionId);
    if (!connection) {
      toast({ title: t("models.missingConnection"), description: t("models.connectionNotFound") });
      return;
    }
    if (!connection.isActive) {
      toast({ title: t("models.connectionInactive"), description: t("models.activateConnection") });
      return;
    }
    if (!profile.isActive) {
      toast({ title: t("models.profileInactive"), description: t("models.activateProfile") });
      return;
    }
    const providerInfo = providerLookup.get(connection.providerId);
    if (!providerInfo) {
      toast({ title: t("models.unknownProvider"), description: t("models.providerNotAvailable") });
      return;
    }
    if (providerInfo.requiresApiKey && !connection.apiKey && !connection.hasApiKey) {
      toast({ title: t("models.missingApiKey"), description: t("models.addApiKeyFirst") });
      return;
    }

    try {
      setTestingProfileId(profile.id);
      const { getAIProvider } = await import("@/services/aiProviders");
      const provider = getAIProvider(connection.providerId);
      const baseUrl = connection.baseUrl?.trim() || (connection.providerId === "local" ? "http://localhost:11434" : undefined);
      const result = await provider.processText(
        "Say 'pong' if you can read this.",
        "Respond with a single word.",
        connection.apiKey,
        profile.modelId,
        baseUrl,
        "text",
        {
          connectionId: connection.id,
          temperature: profile.temperature,
          maxTokens: profile.maxTokens
        }
      );
      toast({
        title: t("models.profileOK"),
        description: `Response: ${result.slice(0, 120)}`
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast({ title: t("models.profileTestFailed"), description: message, variant: "destructive" });
    } finally {
      setTestingProfileId(null);
    }
  };

  if (currentUser?.hasActiveAccess === false && !isSuperAdmin) {
    return <SubscriptionAccessCard reason={currentUser.accessReason} onBackToHome={() => navigate("/")} />;
  }

  if (!isManager) {
    return (
      <div className="app-page p-6">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BrandLogo className="brand-tile h-12 w-12 rounded-[1rem] p-2" />
              <div>
                <h1 className="text-xl font-semibold text-foreground">{t("models.accessDenied")}</h1>
                <p className="text-sm text-muted-foreground">{t("models.managerRoleRequired")}</p>
              </div>
            </div>
            <ThemeToggle />
            <UserMenu />
          </div>
          <Card className="rounded-[1.75rem] p-6">
            <p className="text-sm text-muted-foreground">
              {t("models.askAdminManager")}
            </p>
            <div className="mt-4 flex gap-2">
              <Button variant="outline" onClick={() => navigate("/app")}>
                {t("models.backToDashboard")}
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  const resetConnectionForm = () => {
    setEditingConnectionId(null);
    setConnectionProviderId("");
    setConnectionName("");
    setConnectionApiKey("");
    setConnectionBaseUrl("");
    setConnectionIsActive(true);
    setEditingConnectionHasStoredKey(false);
  };

  const resetProfileForm = () => {
    setEditingProfileId(null);
    setProfileConnectionId("");
    setProfileModelId("");
    setProfileDisplayName("");
    setProfileDefaultPrompt("");
    setProfileTemperature("");
    setProfileMaxTokens("");
    setProfileInputPrice("");
    setProfileOutputPrice("");
    setProfileIsActive(true);
  };

  const handleSaveConnection = () => {
    if (!connectionProviderId || !connectionName.trim()) {
      toast({ title: t("models.missingFields"), description: t("models.providerNameRequired") });
      return;
    }
    const now = Date.now();
    const connection: ProviderConnection = {
      id: editingConnectionId ?? crypto.randomUUID(),
      providerId: connectionProviderId as ProviderConnection["providerId"],
      name: connectionName.trim(),
      apiKey: connectionApiKey.trim() || undefined,
      hasApiKey: editingConnectionHasStoredKey || !!connectionApiKey.trim(),
      baseUrl: connectionBaseUrl.trim() || undefined,
      isActive: connectionIsActive,
      createdAt: now,
      updatedAt: now
    };
    modelManagementService.saveConnection(connection);
    resetConnectionForm();
  };

  const handleEditConnection = (connection: ProviderConnection) => {
    setEditingConnectionId(connection.id);
    setConnectionProviderId(connection.providerId);
    setConnectionName(connection.name);
    setConnectionApiKey("");
    setConnectionBaseUrl(connection.baseUrl ?? "");
    setConnectionIsActive(connection.isActive);
    setEditingConnectionHasStoredKey(!!connection.hasApiKey);
  };

  const handleDeleteConnection = (id: string) => {
    modelManagementService.deleteConnection(id);
  };

  const handleSaveProfile = () => {
    if (!profileConnectionId || !profileModelId || !profileDisplayName.trim()) {
      toast({ title: t("models.missingFields"), description: t("models.connectionModelNameRequired") });
      return;
    }
    const now = Date.now();
    const profile: ModelProfile = {
      id: editingProfileId ?? crypto.randomUUID(),
      providerConnectionId: profileConnectionId,
      modelId: profileModelId,
      displayName: profileDisplayName.trim(),
      defaultPrompt: profileDefaultPrompt.trim() || undefined,
      temperature: profileTemperature ? Number(profileTemperature) : undefined,
      maxTokens: profileMaxTokens ? Number(profileMaxTokens) : undefined,
      inputPricePerMillion: profileInputPrice ? Number(profileInputPrice) : undefined,
      outputPricePerMillion: profileOutputPrice ? Number(profileOutputPrice) : undefined,
      isActive: profileIsActive,
      createdAt: now,
      updatedAt: now
    };
    modelManagementService.saveProfile(profile);
    resetProfileForm();
  };

  const handleEditProfile = (profile: ModelProfile) => {
    setEditingProfileId(profile.id);
    setProfileConnectionId(profile.providerConnectionId);
    setProfileModelId(profile.modelId);
    setProfileDisplayName(profile.displayName);
    setProfileDefaultPrompt(profile.defaultPrompt ?? "");
    setProfileTemperature(profile.temperature !== undefined ? String(profile.temperature) : "");
    setProfileMaxTokens(profile.maxTokens !== undefined ? String(profile.maxTokens) : "");
    setProfileInputPrice(profile.inputPricePerMillion !== undefined ? String(profile.inputPricePerMillion) : "");
    setProfileOutputPrice(profile.outputPricePerMillion !== undefined ? String(profile.outputPricePerMillion) : "");
    setProfileIsActive(profile.isActive);
  };

  const handleDeleteProfile = (id: string) => {
    modelManagementService.deleteProfile(id);
  };

  const handleSavePolicy = () => {
    if (!selectedProjectId) return;
    const policy: ProjectModelPolicy = {
      projectId: selectedProjectId,
      allowedModelProfileIds: allowedProfiles,
      defaultModelProfileIds: defaultProfiles.filter(id => allowedProfiles.includes(id)),
      updatedAt: Date.now()
    };
    modelManagementService.saveProjectPolicy(policy);
    toast({ title: t("models.policySaved"), description: t("models.projectPolicyUpdated") });
  };

  return (
    <div className="app-page p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="surface-card flex flex-col gap-4 rounded-[2rem] border border-border/70 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="eyebrow">Model Governance</p>
            <h1 className="mt-2 text-[2.5rem]">{t("models.title")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{t("models.pageSubtitle")}</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => navigate("/app")}>{t("models.backToDashboard")}</Button>
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>

        <Card className="rounded-[2rem] p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">{t("models.providerConnections")}</h2>
              <p className="text-xs text-muted-foreground">{t("models.storeAPIKeys")}</p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <Label>{t("models.provider")}</Label>
              <Select value={connectionProviderId} onValueChange={setConnectionProviderId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("models.selectProvider")} />
                </SelectTrigger>
                <SelectContent>
                  {AVAILABLE_PROVIDERS.map(provider => (
                    <SelectItem key={provider.id} value={provider.id}>{provider.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-3">
              <Label>{t("models.connectionName")}</Label>
              <Input value={connectionName} onChange={(e) => setConnectionName(e.target.value)} placeholder="OpenAI Prod" />
            </div>
            <div className="space-y-3">
              <Label>{t("models.apiKey")}</Label>
              <Input
                type="password"
                value={connectionApiKey}
                onChange={(e) => setConnectionApiKey(e.target.value)}
                placeholder={editingConnectionHasStoredKey ? "Stored securely. Enter a new key to replace it." : "sk-..."}
              />
            </div>
            <div className="space-y-3">
              <Label>{t("models.baseUrlOptional")}</Label>
              <Input value={connectionBaseUrl} onChange={(e) => setConnectionBaseUrl(e.target.value)} placeholder="http://localhost:11434" />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="connection-active"
                checked={connectionIsActive}
                onCheckedChange={(checked) => setConnectionIsActive(!!checked)}
              />
              <Label htmlFor="connection-active" className="text-sm font-normal">{t("models.active")}</Label>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSaveConnection}>
              {editingConnectionId ? t("models.updateConnection") : t("models.addConnection")}
            </Button>
            {editingConnectionId && (
              <Button variant="outline" onClick={resetConnectionForm}>{t("common.cancel")}</Button>
            )}
          </div>

          <Separator />

          <div className="space-y-3">
            {connections.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("models.noProviderConnections")}</p>
            ) : (
              connections.map(connection => (
                <div key={connection.id} className="surface-card flex items-center justify-between rounded-[1.25rem] border border-border/70 p-4">
                  <div>
                    <div className="font-medium">{connection.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {providerLookup.get(connection.providerId)?.name} · {connection.isActive ? t("models.active") : t("models.inactive")}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => handleEditConnection(connection)}>{t("common.edit")}</Button>
                    <Button size="sm" variant="destructive" onClick={() => handleDeleteConnection(connection.id)}>{t("common.delete")}</Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="rounded-[2rem] p-6 space-y-6">
          <div>
            <h2 className="text-lg font-semibold">{t("models.modelProfiles")}</h2>
            <p className="text-xs text-muted-foreground">{t("models.bundleModel")}</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <Label>{t("models.connections")}</Label>
              <Select value={profileConnectionId} onValueChange={setProfileConnectionId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("models.selectConnection")} />
                </SelectTrigger>
                <SelectContent>
                  {connectionOptions.map(connection => (
                    <SelectItem key={connection.id} value={connection.id}>{connection.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>{t("models.model")}</Label>
                {selectedProfileConnection && (
                  isOfficialProvider(selectedProfileConnection.providerId)
                ) && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => fetchOfficialModels(selectedProfileConnection, true)}
                      disabled={isLoadingRemoteModels}
                    >
                      {isLoadingRemoteModels ? t("models.loading") : t("models.refresh")}
                    </Button>
                  )}
              </div>
              <Select value={profileModelId} onValueChange={setProfileModelId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("models.selectModel")} />
                </SelectTrigger>
                <SelectContent>
                  {modelsForSelectedConnection.map(model => (
                    <SelectItem key={model.id} value={model.id}>{model.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedProfileConnection && (
                isOfficialProvider(selectedProfileConnection.providerId)
              ) && (
                  <p className="text-xs text-muted-foreground">
                    {remoteModelsError
                      ? t("models.couldNotLoadModels", { error: remoteModelsError })
                      : modelsForSelectedConnection.length === 0
                        ? t("models.noModelsLoaded")
                        : t("models.loadedFromProvider")}
                  </p>
                )}
            </div>
            <div className="space-y-3">
              <Label>{t("models.displayName")}</Label>
              <Input value={profileDisplayName} onChange={(e) => setProfileDisplayName(e.target.value)} placeholder={t("models.displayNamePlaceholder")} />
            </div>
            <div className="space-y-3">
              <Label>{t("models.defaultPromptOptional")}</Label>
              <Textarea value={profileDefaultPrompt} onChange={(e) => setProfileDefaultPrompt(e.target.value)} rows={3} />
            </div>
            <div className="space-y-3">
              <Label>{t("models.temperatureOptional")}</Label>
              <Input value={profileTemperature} onChange={(e) => setProfileTemperature(e.target.value)} placeholder="0.2" />
            </div>
            <div className="space-y-3">
              <Label>{t("models.maxTokensOptional")}</Label>
              <Input value={profileMaxTokens} onChange={(e) => setProfileMaxTokens(e.target.value)} placeholder="1024" />
            </div>
            <div className="space-y-3">
              <Label>{t("models.inputPriceOptional")}</Label>
              <Input value={profileInputPrice} onChange={(e) => setProfileInputPrice(e.target.value)} placeholder="0.15" />
            </div>
            <div className="space-y-3">
              <Label>{t("models.outputPriceOptional")}</Label>
              <Input value={profileOutputPrice} onChange={(e) => setProfileOutputPrice(e.target.value)} placeholder="0.60" />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="profile-active"
                checked={profileIsActive}
                onCheckedChange={(checked) => setProfileIsActive(!!checked)}
              />
              <Label htmlFor="profile-active" className="text-sm font-normal">{t("models.active")}</Label>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSaveProfile}>
              {editingProfileId ? t("models.updateProfile") : t("models.addProfileBtn")}
            </Button>
            {editingProfileId && (
              <Button variant="outline" onClick={resetProfileForm}>{t("common.cancel")}</Button>
            )}
          </div>

          <Separator />

          <div className="space-y-3">
            {profiles.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("models.noModelProfiles")}</p>
            ) : (
              profiles.map(profile => {
                const connection = connectionLookup.get(profile.providerConnectionId);
                const providerName = connection ? providerLookup.get(connection.providerId)?.name : "Unknown";
                return (
                  <div key={profile.id} className="surface-card flex items-center justify-between rounded-[1.25rem] border border-border/70 p-4">
                    <div>
                      <div className="font-medium">{profile.displayName}</div>
                      <div className="text-xs text-muted-foreground">
                        {providerName} · {profile.modelId} · {profile.isActive ? t("models.active") : t("models.inactive")}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleTestProfile(profile)}
                        disabled={testingProfileId === profile.id}
                      >
                        {testingProfileId === profile.id ? (
                          <>
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                            {t("models.testing")}
                          </>
                        ) : (
                          t("models.test")
                        )}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleEditProfile(profile)}>{t("common.edit")}</Button>
                      <Button size="sm" variant="destructive" onClick={() => handleDeleteProfile(profile.id)}>{t("common.delete")}</Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>

        <Card className="rounded-[2rem] p-6 space-y-6">
          <div>
            <h2 className="text-lg font-semibold">{t("models.projectModelPolicy")}</h2>
            <p className="text-xs text-muted-foreground">{t("models.chooseProfiles")}</p>
          </div>
          <div className="space-y-3">
            <Label>{t("models.project")}</Label>
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger>
                <SelectValue placeholder={t("models.selectProject")} />
              </SelectTrigger>
              <SelectContent>
                {projects.map(project => (
                  <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedProjectId && (
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("models.allowedProfiles")}</Label>
                <div className="rounded-[1.25rem] border border-border/70 p-3 max-h-64 overflow-y-auto">
                  {profileOptions.length === 0 && (
                    <p className="text-xs text-muted-foreground">{t("models.noActiveProfiles")}</p>
                  )}
                  {profileOptions.map(profile => {
                    const checked = allowedProfiles.includes(profile.id);
                    return (
                      <div key={profile.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`allowed-${profile.id}`}
                          checked={checked}
                          onCheckedChange={(value) => {
                            if (value) {
                              setAllowedProfiles(prev => [...prev, profile.id]);
                            } else {
                              setAllowedProfiles(prev => prev.filter(id => id !== profile.id));
                              setDefaultProfiles(prev => prev.filter(id => id !== profile.id));
                            }
                          }}
                        />
                        <Label htmlFor={`allowed-${profile.id}`} className="text-sm font-normal">
                          {profile.displayName}
                        </Label>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("models.defaultProfiles")}</Label>
                <div className="rounded-[1.25rem] border border-border/70 p-3 max-h-64 overflow-y-auto">
                  {allowedProfiles.length === 0 && (
                    <p className="text-xs text-muted-foreground">{t("models.selectAllowedFirst")}</p>
                  )}
                  {allowedProfiles.map(profileId => {
                    const profile = profiles.find(item => item.id === profileId);
                    if (!profile) return null;
                    const checked = defaultProfiles.includes(profileId);
                    return (
                      <div key={profileId} className="flex items-center gap-2">
                        <Checkbox
                          id={`default-${profileId}`}
                          checked={checked}
                          onCheckedChange={(value) => {
                            if (value) {
                              setDefaultProfiles(prev => [...prev, profileId]);
                            } else {
                              setDefaultProfiles(prev => prev.filter(id => id !== profileId));
                            }
                          }}
                        />
                        <Label htmlFor={`default-${profileId}`} className="text-sm font-normal">
                          {profile.displayName}
                        </Label>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <Button onClick={handleSavePolicy} disabled={!selectedProjectId}>{t("models.savePolicy")}</Button>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default ModelManagement;
