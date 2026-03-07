import { useState } from "react";
import axios from "axios";

import LoginForm from "./components/LoginForm";

function App() {
  const [data, setData] = useState(null);

  const handleSubmit = (event, email, password) => {
    event.preventDefault();
    axios
      .post("http://localhost:3000/auth/login", {
        email,
        password,
      })
      .then((response) => {
        console.log(response.data);
      });
  };

  return (
    <div>
      <LoginForm handler={handleSubmit} />
      <p>{data}</p>
    </div>
  );
}

export default App;
