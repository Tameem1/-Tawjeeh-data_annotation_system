import type { ModelProfile, ProjectModelPolicy, ProviderConnection } from "@/types/data";
import { apiClient } from "./apiClient";

// Local cache for synchronous access (loaded from server on init)
let connectionsCache: ProviderConnection[] = [];
let profilesCache: ModelProfile[] = [];
let policiesCache: Record<string, ProjectModelPolicy> = {};
let initialized = false;
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach(listener => listener());
}

// Initialize by loading data from server
async function ensureInitialized(): Promise<void> {
  if (initialized) return;

  try {
    const [connections, profiles] = await Promise.all([
      apiClient.connections.getAll(),
      apiClient.profiles.getAll()
    ]);
    connectionsCache = connections;
    profilesCache = profiles;
    initialized = true;
    notifyListeners();
  } catch (error) {
    console.error('Failed to initialize model management service:', error);
    // Fall back to empty data
    connectionsCache = [];
    profilesCache = [];
    initialized = true;
    notifyListeners();
  }
}

export const modelManagementService = {
  // Async initialization
  initialize: ensureInitialized,

  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  // Connections
  getConnections: (): ProviderConnection[] => [...connectionsCache],

  saveConnection: (connection: ProviderConnection): ProviderConnection => {
    const now = Date.now();
    const updated = { ...connection, updatedAt: now, createdAt: connection.createdAt || now };

    // Update local cache immediately
    const existingIndex = connectionsCache.findIndex(item => item.id === connection.id);
    if (existingIndex >= 0) {
      connectionsCache = connectionsCache.map(item => item.id === connection.id ? updated : item);
    } else {
      connectionsCache = [...connectionsCache, updated];
    }
    notifyListeners();

    // Sync to server in background
    apiClient.connections.save(connection).catch(err => {
      console.error('Failed to save connection to server:', err);
    });

    return updated;
  },

  deleteConnection: (id: string) => {
    // Update local cache immediately
    connectionsCache = connectionsCache.filter(item => item.id !== id);
    notifyListeners();

    // Sync to server in background
    apiClient.connections.delete(id).catch(err => {
      console.error('Failed to delete connection from server:', err);
    });
  },

  // Profiles
  getProfiles: (): ModelProfile[] => [...profilesCache],

  saveProfile: (profile: ModelProfile): ModelProfile => {
    const now = Date.now();
    const updated = { ...profile, updatedAt: now, createdAt: profile.createdAt || now };

    // Update local cache immediately
    const existingIndex = profilesCache.findIndex(item => item.id === profile.id);
    if (existingIndex >= 0) {
      profilesCache = profilesCache.map(item => item.id === profile.id ? updated : item);
    } else {
      profilesCache = [...profilesCache, updated];
    }
    notifyListeners();

    // Sync to server in background
    apiClient.profiles.save(profile).catch(err => {
      console.error('Failed to save profile to server:', err);
    });

    return updated;
  },

  deleteProfile: (id: string) => {
    // Update local cache immediately
    profilesCache = profilesCache.filter(item => item.id !== id);
    notifyListeners();

    // Sync to server in background
    apiClient.profiles.delete(id).catch(err => {
      console.error('Failed to delete profile from server:', err);
    });
  },

  // Policies
  getProjectPolicy: (projectId: string): ProjectModelPolicy | null => {
    return policiesCache[projectId] ?? null;
  },

  loadProjectPolicy: async (projectId: string): Promise<ProjectModelPolicy | null> => {
    try {
      const policy = await apiClient.policies.get(projectId);
      policiesCache[projectId] = policy;
      notifyListeners();
      return policy;
    } catch (error) {
      console.error('Failed to load project policy:', error);
      return null;
    }
  },

  saveProjectPolicy: (policy: ProjectModelPolicy) => {
    const updated = { ...policy, updatedAt: Date.now() };

    // Update local cache immediately
    policiesCache[policy.projectId] = updated;
    notifyListeners();

    // Sync to server in background
    apiClient.policies.save(policy.projectId, {
      allowedModelProfileIds: policy.allowedModelProfileIds,
      defaultModelProfileIds: policy.defaultModelProfileIds
    }).catch(err => {
      console.error('Failed to save policy to server:', err);
    });
  },

  // Refresh from server
  refresh: async () => {
    initialized = false;
    await ensureInitialized();
  }
};

export default modelManagementService;
