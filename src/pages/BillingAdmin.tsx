import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { CalendarClock, Mail, Receipt, Settings2, ShieldAlert, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/services/apiClient";
import { useAuth } from "@/contexts/AuthContext";
import type { BillingSettings, DemoRequest, PaymentMethod, SubscriptionEmailLog, SubscriptionPlan, SubscriptionStatus, SubscriptionSummary } from "@/types/data";
import { PLAN_DEFINITIONS, PLAN_ORDER, formatMoney } from "../../shared/billing.js";

function toDateInput(timestamp: number | null | undefined) {
  if (!timestamp) return "";
  return format(new Date(timestamp), "yyyy-MM-dd");
}

function fromDateInput(value: string) {
  return value ? new Date(`${value}T00:00:00`).getTime() : Date.now();
}

const emptySettings: BillingSettings = {
  calendlyUrl: "",
  resendFromEmail: "",
  billingReplyToEmail: "",
};

export default function BillingAdmin() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<SubscriptionSummary[]>([]);
  const [settings, setSettings] = useState<BillingSettings>(emptySettings);
  const [demoRequests, setDemoRequests] = useState<DemoRequest[]>([]);
  const [emailLogs, setEmailLogs] = useState<SubscriptionEmailLog[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [subscriptionForm, setSubscriptionForm] = useState({
    contactEmail: "",
    planType: "monthly" as SubscriptionPlan,
    status: "active" as SubscriptionStatus,
    startDate: toDateInput(Date.now()),
    notes: "",
  });
  const [paymentForm, setPaymentForm] = useState({
    amountDollars: "20",
    paymentMethod: "cash",
    reference: "",
    notes: "",
    paidDate: toDateInput(Date.now()),
  });

  const isSuperAdmin = currentUser?.roles?.includes("super_admin");
  const selectedUser = useMemo(() => users.find((entry) => entry.userId === selectedUserId) || null, [users, selectedUserId]);
  const selectedUserLogs = useMemo(() => emailLogs.filter((entry) => entry.userId === selectedUserId), [emailLogs, selectedUserId]);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const overview = await apiClient.billing.getOverview();
      setUsers(overview.users);
      setSettings(overview.settings);
      setDemoRequests(overview.demoRequests);
      setEmailLogs(overview.emailLogs);
      if (!selectedUserId && overview.users[0]) {
        setSelectedUserId(overview.users[0].userId);
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Failed to load billing dashboard",
        description: error instanceof Error ? error.message : "Please refresh and try again.",
      });
    } finally {
      setLoading(false);
    }
  }, [selectedUserId, toast]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    loadOverview();
    apiClient.billing.processLifecycleEmails().catch(() => undefined);
  }, [isSuperAdmin, loadOverview]);

  useEffect(() => {
    if (!selectedUser) return;
    setSubscriptionForm({
      contactEmail: selectedUser.subscription?.contactEmail || "",
      planType: selectedUser.subscription?.planType || "monthly",
      status: selectedUser.subscription?.status || "active",
      startDate: toDateInput(selectedUser.subscription?.startAt || Date.now()),
      notes: selectedUser.subscription?.notes || "",
    });
  }, [selectedUserId, selectedUser]);

  if (!currentUser) {
    return (
      <div className="app-page px-4 py-10">
        <div className="mx-auto max-w-2xl">
          <Card className="rounded-[2rem]">
            <CardHeader>
              <CardTitle>Login required</CardTitle>
              <CardDescription>Open the app login first, then return to the billing dashboard.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => navigate("/app")}>Go to App Login</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="app-page px-4 py-10">
        <div className="mx-auto max-w-2xl">
          <Card className="rounded-[2rem]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-destructive" />
                Super admin access required
              </CardTitle>
              <CardDescription>This dashboard is only available to the billing super admin.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => navigate("/app")}>Back to Dashboard</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const saveSettings = async () => {
    try {
      await apiClient.billing.updateSettings(settings);
      toast({ title: "Settings saved", description: "Calendly and sender email settings were updated." });
      await loadOverview();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not save settings",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    }
  };

  const saveSubscription = async () => {
    if (!selectedUser) return;
    try {
      await apiClient.billing.updateSubscription(selectedUser.userId, {
        contactEmail: subscriptionForm.contactEmail,
        planType: subscriptionForm.planType,
        status: subscriptionForm.status,
        startAt: fromDateInput(subscriptionForm.startDate),
        notes: subscriptionForm.notes,
      });
      toast({ title: "Subscription updated", description: `Access for ${selectedUser.username} has been refreshed.` });
      await loadOverview();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not update subscription",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    }
  };

  const submitPayment = async () => {
    if (!selectedUser) return;
    try {
      await apiClient.billing.recordPayment({
        userId: selectedUser.userId,
        amountCents: Math.round(Number(paymentForm.amountDollars) * 100),
        paymentMethod: paymentForm.paymentMethod as PaymentMethod,
        reference: paymentForm.reference,
        notes: paymentForm.notes,
        paidAt: fromDateInput(paymentForm.paidDate),
      });
      toast({ title: "Payment recorded", description: "The receipt email was queued and the ledger was updated." });
      await loadOverview();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not record payment",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    }
  };

  const updateDemoStatus = async (id: string, status: string) => {
    try {
      await apiClient.billing.updateDemoRequest(id, status);
      await loadOverview();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not update demo request",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    }
  };

  const resendLatestEmail = async () => {
    const latest = selectedUserLogs[0];
    if (!latest) return;
    try {
      await apiClient.billing.resendEmail({
        userId: latest.userId,
        emailType: latest.emailType,
        paymentRecordId: latest.paymentRecordId || null,
      });
      toast({ title: "Email resent", description: "The latest subscription email was sent again." });
      await loadOverview();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not resend email",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    }
  };

  return (
    <div className="app-page px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="surface-card flex flex-col gap-4 rounded-[2rem] border border-border/70 p-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="eyebrow">Super Admin Billing</p>
            <h1 className="mt-2 text-[2.8rem]">Subscriptions, accounting, and subscription emails</h1>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => navigate("/app")}>Back to App</Button>
            <Button onClick={loadOverview} disabled={loading}>Refresh</Button>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
          <div className="space-y-6">
            <Card className="rounded-[2rem]">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Users className="h-5 w-5" />
                  Customer Accounts
                </CardTitle>
                <CardDescription>Select a user to manage access and payments.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((user) => (
                      <SelectItem key={user.userId} value={user.userId}>
                        {user.username}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="space-y-2">
                  {users.map((user) => (
                    <button
                      key={user.userId}
                      className={`w-full rounded-[1.5rem] border px-4 py-3 text-left transition ${selectedUserId === user.userId ? "border-foreground/15 bg-[hsl(var(--stone)/0.7)]" : "border-border/70 bg-background/70 hover:border-foreground/15"}`}
                      onClick={() => setSelectedUserId(user.userId)}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium">{user.username}</p>
                          <p className="text-xs text-muted-foreground">{user.subscription?.planType || "No plan assigned"}</p>
                        </div>
                        <Badge variant={user.activeAccess ? "default" : "secondary"}>
                          {user.activeAccess ? "Active" : "Locked"}
                        </Badge>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">Due: {formatMoney(user.amountDueCents)}</p>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[2rem]">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Settings2 className="h-5 w-5" />
                  Public and Email Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Calendly URL</Label>
                  <Input value={settings.calendlyUrl} onChange={(event) => setSettings((prev) => ({ ...prev, calendlyUrl: event.target.value }))} placeholder="https://calendly.com/..." />
                </div>
                <div className="space-y-2">
                  <Label>Resend From Email</Label>
                  <Input value={settings.resendFromEmail} onChange={(event) => setSettings((prev) => ({ ...prev, resendFromEmail: event.target.value }))} placeholder="billing@yourdomain.com" />
                </div>
                <div className="space-y-2">
                  <Label>Billing Reply-To Email</Label>
                  <Input value={settings.billingReplyToEmail} onChange={(event) => setSettings((prev) => ({ ...prev, billingReplyToEmail: event.target.value }))} placeholder="support@yourdomain.com" />
                </div>
                <Button className="w-full" onClick={saveSettings}>Save Settings</Button>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            {selectedUser ? (
              <>
                <div className="grid gap-4 md:grid-cols-4">
                  <Card className="rounded-[1.6rem]">
                    <CardHeader className="pb-2">
                      <CardDescription>Current Plan</CardDescription>
                      <CardTitle className="text-2xl capitalize">{selectedUser.subscription?.planType || "None"}</CardTitle>
                    </CardHeader>
                  </Card>
                  <Card className="rounded-[1.6rem]">
                    <CardHeader className="pb-2">
                      <CardDescription>Amount Due</CardDescription>
                      <CardTitle className="text-2xl">{formatMoney(selectedUser.amountDueCents)}</CardTitle>
                    </CardHeader>
                  </Card>
                  <Card className="rounded-[1.6rem]">
                    <CardHeader className="pb-2">
                      <CardDescription>Total Paid</CardDescription>
                      <CardTitle className="text-2xl">{formatMoney(selectedUser.totalPaidCents)}</CardTitle>
                    </CardHeader>
                  </Card>
                  <Card className="rounded-[1.6rem]">
                    <CardHeader className="pb-2">
                      <CardDescription>Next Billing</CardDescription>
                      <CardTitle className="text-lg">{selectedUser.nextBillingDate ? format(new Date(selectedUser.nextBillingDate), "MMM d, yyyy") : "Lifetime / N/A"}</CardTitle>
                    </CardHeader>
                  </Card>
                </div>

                <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
                  <Card className="rounded-[2rem]">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <CalendarClock className="h-5 w-5" />
                        Subscription Assignment
                      </CardTitle>
                      <CardDescription>Assign plan, billing start date, and subscriber email.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4">
                      <div className="space-y-2">
                        <Label>Billing Contact Email</Label>
                        <Input value={subscriptionForm.contactEmail} onChange={(event) => setSubscriptionForm((prev) => ({ ...prev, contactEmail: event.target.value }))} placeholder="customer@company.com" />
                      </div>
                      <div className="grid gap-4 sm:grid-cols-3">
                        <div className="space-y-2">
                          <Label>Plan</Label>
                          <Select value={subscriptionForm.planType} onValueChange={(value) => setSubscriptionForm((prev) => ({ ...prev, planType: value as SubscriptionPlan }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {PLAN_ORDER.map((planType) => (
                                <SelectItem key={planType} value={planType}>
                                  {PLAN_DEFINITIONS[planType].label} - {formatMoney(PLAN_DEFINITIONS[planType].priceCents)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Status</Label>
                          <Select value={subscriptionForm.status} onValueChange={(value) => setSubscriptionForm((prev) => ({ ...prev, status: value as SubscriptionStatus }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="active">Active</SelectItem>
                              <SelectItem value="expired">Expired</SelectItem>
                              <SelectItem value="canceled">Canceled</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Start Date</Label>
                          <Input type="date" value={subscriptionForm.startDate} onChange={(event) => setSubscriptionForm((prev) => ({ ...prev, startDate: event.target.value }))} />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Notes</Label>
                        <Textarea rows={4} value={subscriptionForm.notes} onChange={(event) => setSubscriptionForm((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Cash arrangement, manual renewal note, or special instructions." />
                      </div>
                      <Button onClick={saveSubscription}>Save Subscription</Button>
                    </CardContent>
                  </Card>

                  <Card className="rounded-[2rem]">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Receipt className="h-5 w-5" />
                        Payment Ledger
                      </CardTitle>
                      <CardDescription>Record manual payments and keep the due amount current.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Amount (USD)</Label>
                          <Input type="number" min="0" step="0.01" value={paymentForm.amountDollars} onChange={(event) => setPaymentForm((prev) => ({ ...prev, amountDollars: event.target.value }))} />
                        </div>
                        <div className="space-y-2">
                          <Label>Payment Method</Label>
                          <Select value={paymentForm.paymentMethod} onValueChange={(value) => setPaymentForm((prev) => ({ ...prev, paymentMethod: value }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="cash">Cash</SelectItem>
                              <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                              <SelectItem value="card">Card</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Reference</Label>
                          <Input value={paymentForm.reference} onChange={(event) => setPaymentForm((prev) => ({ ...prev, reference: event.target.value }))} placeholder="Receipt number / bank transfer code" />
                        </div>
                        <div className="space-y-2">
                          <Label>Paid Date</Label>
                          <Input type="date" value={paymentForm.paidDate} onChange={(event) => setPaymentForm((prev) => ({ ...prev, paidDate: event.target.value }))} />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Notes</Label>
                        <Textarea rows={3} value={paymentForm.notes} onChange={(event) => setPaymentForm((prev) => ({ ...prev, notes: event.target.value }))} />
                      </div>
                      <Button onClick={submitPayment}>Record Payment</Button>

                      <div className="surface-card space-y-2 rounded-[1.5rem] border border-border/70 p-4">
                        <p className="text-sm font-medium">Recent Payments</p>
                        <div className="space-y-2">
                          {selectedUser.payments.slice(0, 5).map((payment) => (
                            <div key={payment.id} className="flex items-center justify-between gap-3 text-sm">
                              <div>
                                <p className="font-medium">{formatMoney(payment.amountCents)}</p>
                                <p className="text-xs text-muted-foreground">{payment.paymentMethod} • {format(new Date(payment.paidAt), "MMM d, yyyy")}</p>
                              </div>
                              <span className="text-xs text-muted-foreground">{payment.reference || "No ref"}</span>
                            </div>
                          ))}
                          {selectedUser.payments.length === 0 && (
                            <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
                  <Card className="rounded-[2rem]">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Mail className="h-5 w-5" />
                        Subscription Email Activity
                      </CardTitle>
                      <CardDescription>Recent subscription emails for the selected user.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <Button variant="outline" onClick={resendLatestEmail} disabled={selectedUserLogs.length === 0}>
                        Resend Latest Email
                      </Button>
                      <div className="space-y-3">
                        {selectedUserLogs.slice(0, 6).map((log) => (
                          <div key={log.id} className="surface-card rounded-[1.5rem] border border-border/70 p-4 text-sm">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="font-medium">{log.emailType}</p>
                                <p className="text-xs text-muted-foreground">{log.recipientEmail}</p>
                              </div>
                              <Badge variant={log.status === "sent" ? "default" : "destructive"}>{log.status}</Badge>
                            </div>
                            <p className="mt-2 text-xs text-muted-foreground">{format(new Date(log.createdAt), "MMM d, yyyy • h:mm a")}</p>
                            {log.errorMessage && <p className="mt-2 text-xs text-destructive">{log.errorMessage}</p>}
                          </div>
                        ))}
                        {selectedUserLogs.length === 0 && (
                          <p className="text-sm text-muted-foreground">No emails have been logged for this user yet.</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="rounded-[2rem]">
                    <CardHeader>
                      <CardTitle>Demo Request Inbox</CardTitle>
                      <CardDescription>Update status as leads move from request to booking.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {demoRequests.slice(0, 8).map((request) => (
                        <div key={request.id} className="surface-card rounded-[1.5rem] border border-border/70 p-4">
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div>
                              <p className="font-medium">{request.name}</p>
                              <p className="text-sm text-muted-foreground">{request.email}</p>
                              {request.organization && <p className="text-xs text-muted-foreground">{request.organization}</p>}
                              {request.message && <p className="mt-2 text-sm">{request.message}</p>}
                            </div>
                            <Select value={request.status} onValueChange={(value) => updateDemoStatus(request.id, value)}>
                              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="new">New</SelectItem>
                                <SelectItem value="contacted">Contacted</SelectItem>
                                <SelectItem value="booked">Booked</SelectItem>
                                <SelectItem value="closed">Closed</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      ))}
                      {demoRequests.length === 0 && (
                        <p className="text-sm text-muted-foreground">No demo requests yet.</p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </>
            ) : (
              <Card className="rounded-[2rem]">
                <CardHeader>
                  <CardTitle>Select a customer</CardTitle>
                  <CardDescription>Choose a user from the left to manage their subscription and payment ledger.</CardDescription>
                </CardHeader>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
