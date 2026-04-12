import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Loader2, UserPlus, AlertCircle, CheckCircle } from "lucide-react";
import { apiClient } from "@/services/apiClient";
import { useAuth } from "@/contexts/AuthContext";
import { BrandLogo } from "@/components/BrandLogo";

export default function Signup() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();

  const token = searchParams.get("token") || "";

  const [validating, setValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [tokenError, setTokenError] = useState("");
  const [assignedRoles, setAssignedRoles] = useState<string[]>([]);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setValidating(false);
      setTokenError("No invite token provided. You need an invite link to sign up.");
      return;
    }

    apiClient.invite
      .validate(token)
      .then((result) => {
        if (result.valid) {
          setTokenValid(true);
          setAssignedRoles(result.roles || ["annotator"]);
        } else {
          setTokenError(result.error || "Invalid invite token");
        }
      })
      .catch((err) => {
        setTokenError(err.message || "Failed to validate invite token");
      })
      .finally(() => {
        setValidating(false);
      });
  }, [token]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!username.trim()) {
      setError("Username is required");
      return;
    }

    if (password.length < 4) {
      setError("Password must be at least 4 characters");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      await apiClient.auth.signup(username.trim(), password, token);
      setSuccess(true);

      setTimeout(async () => {
        await login(username.trim(), password);
        navigate("/app");
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  if (validating) {
    return (
      <div className="app-page flex min-h-screen items-center justify-center px-4 py-8">
        <Card className="w-full max-w-md rounded-[2rem]">
          <CardHeader className="text-center">
            <BrandLogo className="brand-tile mx-auto mb-4 h-16 w-16 rounded-[1.2rem] p-2.5" />
            <p className="eyebrow">Invite Signup</p>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4 pt-2">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Validating invite link...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!tokenValid) {
    return (
      <div className="app-page flex min-h-screen items-center justify-center px-4 py-8">
        <Card className="w-full max-w-md rounded-[2rem]">
          <CardHeader className="text-center">
            <BrandLogo className="brand-tile mx-auto mb-4 h-16 w-16 rounded-[1.2rem] p-2.5" />
            <p className="eyebrow">Invite Signup</p>
            <CardTitle>Invalid Invite Link</CardTitle>
            <CardDescription className="body-airy mt-2">{tokenError}</CardDescription>
          </CardHeader>
          <CardContent className="pt-2 text-center">
            <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <p className="mb-4 text-sm text-muted-foreground">Please contact your administrator to get a valid invite link.</p>
            <Button variant="outline" onClick={() => navigate("/app")}>
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="app-page flex min-h-screen items-center justify-center px-4 py-8">
        <Card className="w-full max-w-md rounded-[2rem]">
          <CardHeader className="text-center">
            <BrandLogo className="brand-tile mx-auto mb-4 h-16 w-16 rounded-[1.2rem] p-2.5" />
            <p className="eyebrow">Invite Signup</p>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4 pt-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[hsl(var(--stone)/0.9)]">
              <CheckCircle className="h-6 w-6 text-foreground" />
            </div>
            <CardTitle>Account Created</CardTitle>
            <CardDescription>Redirecting you to the dashboard...</CardDescription>
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="app-page flex min-h-screen items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md rounded-[2rem]">
        <CardHeader className="text-center">
          <BrandLogo className="brand-tile mx-auto mb-4 h-16 w-16 rounded-[1.2rem] p-2.5" />
          <p className="eyebrow">Invite Signup</p>
          <CardTitle>Create Your Account</CardTitle>
          <CardDescription className="body-airy mt-2">You&apos;ve been invited to join Tawjeeh Qalam.</CardDescription>
          <div className="mt-4 flex justify-center gap-2">
            {assignedRoles.map((role) => (
              <Badge key={role} variant="secondary" className="capitalize tracking-[0.08em]">
                {role}
              </Badge>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignup} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                placeholder="Choose a username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Choose a password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating Account...
                </>
              ) : (
                <>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Create Account
                </>
              )}
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              Already have an account?{" "}
              <Button variant="link" className="h-auto p-0" onClick={() => navigate("/app")}>
                Log in
              </Button>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
