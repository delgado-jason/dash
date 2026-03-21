import axios from "axios";

const userLogin = async (credentials) => {
  const { email, password } = credentials;

  try {
    const response = await axios.post("http://localhost:3000/auth/login", {
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

    if (err.response) {
      errorMsg = err.response.data.error;
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
