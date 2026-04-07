/**
 * API client for communicating with the backend server
 */

import { ProjectIAAConfig } from "@/types/data";
import type {
    ProjectDataStatusCounts,
    AnnotatorStatsResponse,
    TaskTemplate,
    IAAStats,
    ImportJobStatus,
    BillingSettings,
    DemoRequest,
    PaymentMethod,
    SubscriptionEmailLog,
    SubscriptionPlan,
    SubscriptionStatus,
    SubscriptionSummary,
} from "@/types/data";

export interface AppNotification {
    id: string;
    userId: string;
    type: 'comment' | 'assignment' | 'review_request' | string;
    title: string;
    body: string;
    data: { projectId?: string; dataPointId?: string; [key: string]: unknown };
    isRead: boolean;
    createdAt: number;
}

export interface AuthResponse {
    token: string;
    id: string;
    username: string;
    roles: string[];
    mustChangePassword?: boolean;
    hasActiveAccess: boolean;
    accessStatus: string;
    accessReason?: string;
    subscriptionSummary?: SubscriptionSummary | null;
}

export interface CurrentUserResponse {
    id: string;
    username: string;
    roles: string[];
    mustChangePassword?: boolean;
    hasActiveAccess: boolean;
    accessStatus: string;
    accessReason?: string;
    subscriptionSummary?: SubscriptionSummary | null;
}

const API_BASE = '/api';
const SESSION_TOKEN_KEY = 'tawjeeh_token';

// Module-level token store — set by AuthContext after login
let _authToken: string | null = null;

export function setAuthToken(token: string | null): void {
    _authToken = token;
}

export function getAuthToken(): string | null {
    if (_authToken) return _authToken;
    if (typeof window !== 'undefined' && typeof sessionStorage !== 'undefined') {
        const storedToken = sessionStorage.getItem(SESSION_TOKEN_KEY);
        if (storedToken) {
            _authToken = storedToken;
            return storedToken;
        }
    }
    return null;
}

async function request<T>(
    endpoint: string,
    options: RequestInit = {}
): Promise<T> {
    const url = `${API_BASE}${endpoint}`;
    const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
    const headers: Record<string, string> = {
        ...(options.headers as Record<string, string>),
    };

    if (!isFormData && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
    }

    // Attach JWT Bearer token if available
    const authToken = getAuthToken();
    if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
    }

    const response = await fetch(url, {
        ...options,
        headers,
        credentials: 'include',
    });

    if (response.status === 401) {
        // Token expired or invalid — clear stored token
        _authToken = null;
        sessionStorage.removeItem(SESSION_TOKEN_KEY);
        throw new Error('Session expired. Please log in again.');
    }

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(error.error || error.message || 'Request failed');
    }

    return response.json();
}

export const apiClient = {
    // Projects
    projects: {
        getAll: () => request<any[]>('/projects'),

        getById: (id: string) => request<any>(`/projects/${id}`),

        create: (data: {
            name: string;
            description?: string;
            managerId?: string;
            annotatorIds?: string[];
            iaaConfig?: ProjectIAAConfig;
            guidelines?: string;
        }) => request<any>('/projects', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

        update: (id: string, data: any) => request<any>(`/projects/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        }),

        importData: (id: string, data: { dataPoints: any[]; stats: any }) => request<any>(`/projects/${id}/import`, {
            method: 'POST',
            body: JSON.stringify(data),
        }),

        importFile: (id: string, data: FormData) => request<any>(`/projects/${id}/import-file`, {
            method: 'POST',
            body: data,
        }),

        initImportUpload: (id: string, data: { fileName: string; fileType: string; fileSize: number }) =>
            request<{ uploadUrl: string; objectKey: string; expiresAt: number; maxFileSizeBytes: number }>(`/projects/${id}/import-uploads`, {
                method: 'POST',
                body: JSON.stringify(data),
            }),

        createImportJob: (id: string, data: {
            objectKey: string;
            fileName: string;
            fileType: string;
            selectedContentColumn?: string;
            selectedDisplayColumns?: string[];
            prompt?: string;
            customFieldName?: string;
            importMode?: 'replace';
        }) => request<{ jobId: string; status: ImportJobStatus['status'] }>(`/projects/${id}/import-jobs`, {
            method: 'POST',
            body: JSON.stringify(data),
        }),

        getImportJob: (jobId: string) => request<ImportJobStatus>(`/import-jobs/${jobId}`),

        getData: (projectId: string, page: number = 1, limit?: number) => {
            const params = new URLSearchParams();
            if (page > 0) params.set('page', String(page));
            if (typeof limit === 'number' && limit > 0) params.set('limit', String(limit));
            return request<{ dataPoints: any[]; pagination: any; statusCounts?: ProjectDataStatusCounts }>(
                `/projects/${projectId}/data${params.toString() ? `?${params.toString()}` : ''}`
            );
        },

        updateDataPoint: (projectId: string, dataId: string, updates: any) =>
            request<void>(`/projects/${projectId}/data/${dataId}`, {
                method: 'PATCH',
                body: JSON.stringify(updates),
            }),

        delete: (id: string) => request<{ success: boolean }>(`/projects/${id}`, {
            method: 'DELETE',
        }),

        addAuditLog: (id: string, action: string, details?: any) =>
            request<{ id: string; timestamp: number }>(`/projects/${id}/audit`, {
                method: 'POST',
                body: JSON.stringify({ action, details }),
            }),

        getAnnotatorStats: (projectId: string) =>
            request<AnnotatorStatsResponse>(`/projects/${projectId}/annotator-stats`),
    },

    // Snapshots
    snapshots: {
        getAll: (projectId: string) => request<any[]>(`/projects/${projectId}/snapshots`),

        create: (projectId: string, data: {
            name: string;
            description?: string;
            dataPoints: any[];
            stats: any;
        }) => request<{ id: string; createdAt: number }>(`/projects/${projectId}/snapshots`, {
            method: 'POST',
            body: JSON.stringify(data),
        }),

        delete: (projectId: string, snapshotId: string) =>
            request<{ success: boolean }>(`/projects/${projectId}/snapshots/${snapshotId}`, {
                method: 'DELETE',
            }),
    },

    // Comments
    comments: {
        getByDataPoint: (projectId: string, dataId: string, page: number = 1, limit: number = 20) => {
            const params = new URLSearchParams();
            if (page > 0) params.set('page', String(page));
            if (limit > 0) params.set('limit', String(limit));
            return request<{ comments: any[]; pagination: { total: number; page: number; limit: number; totalPages: number } }>(
                `/projects/${projectId}/data/${dataId}/comments${params.toString() ? `?${params.toString()}` : ''}`
            );
        },

        create: (projectId: string, dataId: string, data: { body: string; parentCommentId?: string | null }) =>
            request<any>(`/projects/${projectId}/data/${dataId}/comments`, {
                method: 'POST',
                body: JSON.stringify(data),
            }),

        update: (projectId: string, commentId: string, data: { body: string }) =>
            request<any>(`/projects/${projectId}/comments/${commentId}`, {
                method: 'PATCH',
                body: JSON.stringify(data),
            }),

        delete: (projectId: string, commentId: string) =>
            request<{ success: boolean }>(`/projects/${projectId}/comments/${commentId}`, {
                method: 'DELETE',
            }),
    },

    // Users
    users: {
        getAll: () => request<any[]>('/users'),

        getById: (id: string) => request<any>(`/users/${id}`),

        create: (data: {
            username: string;
            password: string;
            roles?: string[];
            mustChangePassword?: boolean;
        }) => request<any>('/users', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

        update: (id: string, data: {
            password?: string;
            roles?: string[];
            mustChangePassword?: boolean;
        }) => request<any>(`/users/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        }),

        delete: (id: string) => request<{ success: boolean }>(`/users/${id}`, {
            method: 'DELETE',
        }),
    },

    // Auth
    auth: {
        login: (username: string, password: string) =>
            request<AuthResponse>('/auth/login', {
                method: 'POST',
                body: JSON.stringify({ username, password }),
            }),

        signup: (username: string, password: string, token: string) =>
            request<AuthResponse>('/auth/signup', {
                method: 'POST',
                body: JSON.stringify({ username, password, token }),
            }),

        me: () => request<CurrentUserResponse>('/auth/me'),
    },

    // Invite tokens
    invite: {
        getAll: () => request<any[]>('/invite'),

        create: (data: {
            roles?: string[];
            maxUses?: number;
            expiresInDays?: number;
        }) => request<any>('/invite', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

        validate: (token: string) => request<{ valid: boolean; roles?: string[]; error?: string }>(`/invite/${token}/validate`),

        toggle: (id: string, isActive: boolean) => request<any>(`/invite/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ isActive }),
        }),

        delete: (id: string) => request<{ success: boolean }>(`/invite/${id}`, {
            method: 'DELETE',
        }),
    },

    // Provider Connections
    connections: {
        getAll: () => request<any[]>('/connections'),

        save: (data: any) => request<any>('/connections', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

        delete: (id: string) => request<{ success: boolean }>(`/connections/${id}`, {
            method: 'DELETE',
        }),
    },

    // Model Profiles
    profiles: {
        getAll: () => request<any[]>('/profiles'),

        save: (data: any) => request<any>('/profiles', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

        delete: (id: string) => request<{ success: boolean }>(`/profiles/${id}`, {
            method: 'DELETE',
        }),
    },

    // Project Model Policies
    policies: {
        get: (projectId: string) => request<any>(`/policies/${projectId}`),

        save: (projectId: string, data: {
            allowedModelProfileIds: string[];
            defaultModelProfileIds: string[];
        }) => request<any>(`/policies/${projectId}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        }),
    },

    // Notifications
    notifications: {
        getAll: (params?: { unread?: boolean; limit?: number }) => {
            const query = new URLSearchParams();
            if (params?.unread) query.set('unread', 'true');
            if (params?.limit) query.set('limit', String(params.limit));
            const qs = query.toString();
            return request<{ notifications: AppNotification[]; unreadCount: number }>(
                `/notifications${qs ? `?${qs}` : ''}`
            );
        },
        markRead: (ids: string[]) =>
            request<{ success: boolean; unreadCount: number }>('/notifications/read', {
                method: 'POST',
                body: JSON.stringify({ ids }),
            }),
        markAllRead: () =>
            request<{ success: boolean; unreadCount: number }>('/notifications/read', {
                method: 'POST',
                body: JSON.stringify({ all: true }),
            }),
        delete: (id: string) =>
            request<{ success: boolean }>(`/notifications/${id}`, { method: 'DELETE' }),
    },

    marketing: {
        getSettings: () => request<{ calendlyUrl: string }>('/public/marketing-settings'),
        createDemoRequest: (data: {
            name: string;
            email: string;
            organization?: string;
            phone?: string;
            message?: string;
        }) => request<{ id: string; redirectUrl?: string }>('/demo-requests', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    },

    billing: {
        getOverview: () => request<{
            users: SubscriptionSummary[];
            settings: BillingSettings;
            demoRequests: DemoRequest[];
            emailLogs: SubscriptionEmailLog[];
        }>('/billing/overview'),
        getUsers: () => request<SubscriptionSummary[]>('/billing/users'),
        getSubscription: (userId: string) => request<SubscriptionSummary>(`/billing/subscriptions/${userId}`),
        updateSubscription: (userId: string, data: {
            planType: SubscriptionPlan;
            status: SubscriptionStatus;
            startAt: number;
            billingAnchorAt?: number;
            notes?: string;
            contactEmail?: string;
        }) => request<SubscriptionSummary>(`/billing/subscriptions/${userId}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        }),
        recordPayment: (data: {
            userId: string;
            amountCents: number;
            paymentMethod: PaymentMethod;
            reference?: string;
            notes?: string;
            paidAt?: number;
        }) => request<{ payment: any; summary: SubscriptionSummary }>('/billing/payments', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
        getSettings: () => request<BillingSettings>('/billing/settings'),
        updateSettings: (data: BillingSettings) => request<BillingSettings>('/billing/settings', {
            method: 'PUT',
            body: JSON.stringify(data),
        }),
        getDemoRequests: () => request<DemoRequest[]>('/billing/demo-requests'),
        updateDemoRequest: (id: string, status: string) => request<DemoRequest>(`/billing/demo-requests/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status }),
        }),
        getEmailLogs: (userId?: string) => request<SubscriptionEmailLog[]>(`/billing/email-logs${userId ? `?userId=${encodeURIComponent(userId)}` : ''}`),
        processLifecycleEmails: () => request<{ processed: number }>('/billing/emails/process-lifecycle', {
            method: 'POST',
            body: JSON.stringify({}),
        }),
        resendEmail: (data: { userId: string; emailType: string; paymentRecordId?: string | null }) =>
            request<{ success: boolean }>('/billing/emails/resend', {
                method: 'POST',
                body: JSON.stringify(data),
            }),
    },

    // Task Templates
    templates: {
        getAll: () => request<TaskTemplate[]>('/templates'),
        create: (data: { name: string; description?: string; category?: string; xmlConfig: string }) =>
            request<TaskTemplate>('/templates', { method: 'POST', body: JSON.stringify(data) }),
        delete: (id: string) => request<{ success: boolean }>(`/templates/${id}`, { method: 'DELETE' }),
    },

    // IAA stats
    iaa: {
        getStats: (projectId: string, threshold?: number) =>
            request<IAAStats>(`/projects/${projectId}/iaa${threshold !== undefined ? `?threshold=${threshold}` : ''}`),
    },


    // Hugging Face dataset import
    huggingFace: {
        importDataset: (data: {
            dataset: string;
            config?: string;
            split?: string;
            maxRows?: number;
        }) => request<{
            dataset: string;
            config: string;
            split: string;
            columns: string[];
            totalRows: number | null;
            rowCount: number;
            rows: Array<Record<string, unknown>>;
        }>('/huggingface/datasets/import', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    },
};

export default apiClient;
