import api from "./api";

interface Credentials {
  email: string;
  password: string;
}

// The sentence off a failed auth call: the server's own ("Invalid credentials",
// the throttle's "Too many failed sign-ins…", the closed door's) or, with no
// response at all, a plain one.
const errorWord = (err: unknown): string => {
  const word = (err as { response?: { data?: { error?: unknown } } } | null)
    ?.response?.data?.error;
  if (typeof word === "string" && word.trim()) return word;
  return (err as { response?: unknown } | null)?.response
    ? "Sign-in failed"
    : "No response from server";
};

export const userLogin = async (credentials: Credentials) => {
  const { email, password } = credentials;

  try {
    const response = await api.post("/auth/login", {
      email: email,
      password: password,
    });

    // Store user_id, token, and identity (role/name) in localStorage
    localStorage.setItem("user_id", response.data.user.user_id);
    localStorage.setItem("token", response.data.token);
    localStorage.setItem("role", response.data.user.role ?? "admin");
    localStorage.setItem("display_name", response.data.user.display_name ?? "");

    const data = {
      success: true,
      error: null,
    };
    return data;
  } catch (err) {
    const data = {
      success: false,
      error: errorWord(err),
    };
    return data;
  }
};

// Is the front door open? True only on an empty dash (no owner yet) or with
// ALLOW_SIGNUP=true on the server. The signup page asks before it draws a form.
export const signupOpen = async (): Promise<boolean> => {
  const res = await api.get("/auth/signup/open");
  return res.data?.open === true;
};

export const userSignup = async (credentials: Credentials) => {
  const { email, password } = credentials;

  try {
    const response = await api.post("/auth/signup", {
      email: email,
      password: password,
    });

    // Store user_id, token, and identity (role/name) in localStorage
    localStorage.setItem("user_id", response.data.user.user_id);
    localStorage.setItem("token", response.data.token);
    localStorage.setItem("role", response.data.user.role ?? "admin");
    localStorage.setItem("display_name", response.data.user.display_name ?? "");

    const data = {
      success: true,
      error: null,
    };
    return data;
  } catch (err) {
    const data = {
      success: false,
      error: errorWord(err),
    };
    return data;
  }
};
