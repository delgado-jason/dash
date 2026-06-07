import { userLogin, userSignup } from "@/services/authService";
import { useState } from "react";

interface Credentials {
  email: string;
  password: string;
}

const useAuth = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  return {
    login: async (credentials: Credentials) => {
      try {
        const result = await userLogin(credentials);
        if (result.success) {
          setIsAuthenticated(true);
          return { success: true, error: "" };
        } else {
          setIsAuthenticated(false);
          return { success: false, error: "Failed to authenticate" };
        }
      } catch (er) {
        setIsAuthenticated(false);
        return { success: false, error: "Submission failed" };
      }
    },
    signup: async (credentials: Credentials) => {
      try {
        const result = await userSignup(credentials);
        if (result.success) {
          setIsAuthenticated(true);
          return { success: true, error: "" };
        } else {
          setIsAuthenticated(false);
          return { success: false, error: result.error };
        }
      } catch (er) {
        setIsAuthenticated(false);
        return { success: false, error: "Submission failed" };
      }
    },
    isAuthenticated,
  };
};

export default useAuth;
