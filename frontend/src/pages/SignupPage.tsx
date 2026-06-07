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

const SignupPage = () => {
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Loading state
  const [submitting, setSubmitting] = useState(false);

  // Access login
  const { signup } = useAuth();

  const handleSubmit: React.SubmitEventHandler<HTMLFormElement> = async (
    event,
  ) => {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage("");
    const credentials = {
      email: email,
      password: password,
    };
    const result = await signup(credentials);
    if (result.success) {
      setSubmitting(false);
      navigate("/dashboard");
    } else {
      setSubmitting(false);
      setErrorMessage(result.error);
    }
  };

  const handleOnEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
  };

  const handleOnPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
  };

  return (
    <div className="flex justify-center items-center h-screen bg-slate-200">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Signup Form</CardTitle>
          <CardDescription>
            Enter your email below to signup for an account
          </CardDescription>
          <CardAction>
            <Button variant="link">Login</Button>
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
                  onChange={(e) => handleOnEmailChange(e)}
                  required
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center">
                  <Label htmlFor="password">Password</Label>
                </div>
                <Input
                  id="password"
                  type="password"
                  name="password"
                  required
                  onChange={(e) => handleOnPasswordChange(e)}
                />
              </div>
              <Button
                type="submit"
                className="w-full bg-blue-500"
                disabled={submitting}
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

export default SignupPage;
