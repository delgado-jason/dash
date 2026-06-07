import api from "./api";

interface Credentials {
  email: string;
  password: string;
}

const userLogin = async (credentials: Credentials) => {
  const { email, password } = credentials;

  try {
    const response = await api.post("/auth/login", {
      email: email,
      password: password,
    });

    // Store user_id and token in localStorage
    localStorage.setItem("user_id", response.data.user.user_id);
    localStorage.setItem("token", response.data.token);

    const data = {
      success: true,
      error: null,
    };
    return data;
  } catch (err) {
    let errorMsg = "";

    if ((err as any).response) {
      errorMsg = (err as any).response.data.error;
    } else {
      errorMsg = "No response from server";
    }

    const data = {
      success: false,
      error: errorMsg,
    };
    return data;
  }
};

export default userLogin;
