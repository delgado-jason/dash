import { useState } from "react";
import { useNavigate } from "react-router";
import useAuth from "@/hooks/useAuth";

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

const LoginPage = () => {
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState("");

  // Loading state
  const [submitting, setSubmitting] = useState(false);

  // Access login
  const { login } = useAuth();

  const handleSubmit = async (event) => {
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
    <div className="flex justify-center items-center h-screen bg-slate-200">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Login to your account</CardTitle>
          <CardDescription>
            Enter your email below to login to your account
          </CardDescription>
          <CardAction>
            <Button variant="link">Sign Up</Button>
          </CardAction>
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
                  required
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center">
                  <Label htmlFor="password">Password</Label>
                  <a
                    href="#"
                    className="ml-auto inline-block text-sm underline-offset-4 hover:underline"
                  >
                    Forgot your password?
                  </a>
                </div>
                <Input id="password" type="password" name="password" required />
              </div>
              <Button
                type="submit"
                className="w-full bg-blue-500"
                disabled={submitting ? true : false}
              >
                {submitting ? "Submitting" : "Login"}
              </Button>
            </div>
          </form>
        </CardContent>
        <CardFooter>{errorMessage}</CardFooter>
      </Card>
    </div>
  );
};

export default LoginPage;
