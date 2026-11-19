import { useState } from "react";
import { useNavigate } from "react-router";
import useAuth from "@/hooks/useAuth";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// What "Forgot your password?" says. There is no email reset by design (no
// mail infrastructure — epic #277), so the link tells the truth about the two
// doors that exist instead of pretending to be a third.
const FORGOT_WORDS =
  "There is no email reset. A dispatcher asks the owner, who sets a new " +
  "password under Settings → Team. The owner's own reset is the set-password " +
  "script in the repo.";

const LoginPage = () => {
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState("");
  const [forgot, setForgot] = useState(false);

  // Loading state
  const [submitting, setSubmitting] = useState(false);

  // Access login
  const { login } = useAuth();

  const handleSubmit = async (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage("");
    const credentials = {
      email: event.target.email.value,
      password: event.target.password.value,
    };
    const result = await login(credentials);
    if (result.success) {
      setSubmitting(false);
      navigate("/dashboard");
    } else {
      setSubmitting(false);
      setErrorMessage(result.error);
    }
  };

  return (
    <div className="flex justify-center items-center h-screen bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Login to your account</CardTitle>
          <CardDescription>
            Enter your email below to login to your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  name="email"
                  placeholder="m@example.com"
                  autoComplete="username"
                  required
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center">
                  <Label htmlFor="password">Password</Label>
                  <button
                    type="button"
                    onClick={() => setForgot((v) => !v)}
                    aria-expanded={forgot}
                    className="ml-auto inline-block text-sm underline-offset-4 hover:underline"
                  >
                    Forgot your password?
                  </button>
                </div>
                <Input
                  id="password"
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  required
                />
                {forgot && (
                  <p
                    className="text-xs text-muted-text leading-relaxed"
                    data-testid="forgot-words"
                  >
                    {FORGOT_WORDS}
                  </p>
                )}
              </div>
              <Button
                type="submit"
                className="w-full bg-primary text-primary-foreground"
                disabled={submitting ? true : false}
              >
                {submitting ? "Submitting" : "Login"}
              </Button>
            </div>
          </form>
        </CardContent>
        {errorMessage && (
          <CardFooter>
            <p className="text-sm text-status-negative-text" role="alert">
              {errorMessage}
            </p>
          </CardFooter>
        )}
      </Card>
    </div>
  );
};

export default LoginPage;
