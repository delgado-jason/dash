import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import useAuth from "@/hooks/useAuth";
import { signupOpen } from "@/services/authService";
import { passwordProblem, PASSWORD_HINT } from "@/lib/passwordRules";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// The door's state, asked of the server before any form is drawn: open only on
// an empty dash (no owner yet) or with ALLOW_SIGNUP=true on the server.
type Door = "asking" | "open" | "closed" | "unreachable";

const SignupPage = () => {
  const navigate = useNavigate();
  const [door, setDoor] = useState<Door>("asking");
  const [errorMessage, setErrorMessage] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Loading state
  const [submitting, setSubmitting] = useState(false);

  // Access signup
  const { signup } = useAuth();

  useEffect(() => {
    signupOpen()
      .then((open) => setDoor(open ? "open" : "closed"))
      .catch(() => setDoor("unreachable"));
  }, []);

  const handleSubmit: React.SubmitEventHandler<HTMLFormElement> = async (
    event,
  ) => {
    event.preventDefault();
    setErrorMessage("");
    const problem = passwordProblem(password);
    if (problem) {
      setErrorMessage(problem);
      return;
    }
    setSubmitting(true);
    const result = await signup({ email, password });
    setSubmitting(false);
    if (result.success) {
      navigate("/dashboard");
    } else {
      setErrorMessage(result.error ?? "Signup failed");
    }
  };

  const toLogin = (
    <CardAction>
      <Button variant="link" type="button" onClick={() => navigate("/login")}>
        Login
      </Button>
    </CardAction>
  );

  if (door !== "open") {
    const words: Record<Exclude<Door, "open">, [string, string]> = {
      asking: ["Signup", "Checking whether the door is open…"],
      closed: [
        "Signup is closed",
        "This dash has an owner. Logins are added by the owner under Settings → Team — ask them for yours.",
      ],
      unreachable: [
        "Signup",
        "dash's server didn't answer, so the door can't be checked. Try again in a moment.",
      ],
    };
    const [title, body] = words[door];
    return (
      <div className="flex justify-center items-center h-screen bg-background">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            <CardDescription data-testid="signup-door">{body}</CardDescription>
            {toLogin}
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex justify-center items-center h-screen bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Make the owner's login</CardTitle>
          <CardDescription>
            This dash has no owner yet. The first login is the owner's; every
            later one is added by the owner under Settings → Team.
          </CardDescription>
          {toLogin}
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
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center">
                  <Label htmlFor="password">Password</Label>
                  <span className="ml-auto text-xs text-muted-text">
                    {PASSWORD_HINT}
                  </span>
                </div>
                <Input
                  id="password"
                  type="password"
                  name="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button
                type="submit"
                className="w-full bg-primary text-primary-foreground"
                disabled={submitting}
              >
                {submitting ? "Creating…" : "Create the owner's login"}
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

export default SignupPage;
