import { Router } from "express";
import {
  createUser,
  validateUser,
  countUsers,
} from "../services/userServices.js";
import { signToken } from "../utils/jwt.js";
import { signupOpen, SIGNUP_CLOSED } from "../utils/signupGate.js";
import { loginThrottle } from "../middleware/loginThrottle.js";

const router = Router();

// Is the front door open? Only on an empty dash, or with ALLOW_SIGNUP=true on
// the server (utils/signupGate). A running dash with an owner says no.
const isOpen = async () =>
  signupOpen({
    allowSignup: process.env.ALLOW_SIGNUP,
    userCount: await countUsers(),
  });

// The signup page asks before it draws a form, so a closed door is a sentence,
// not a form that fails on submit.
router.get("/signup/open", async (req, res) => {
  try {
    return res.status(200).json({ open: await isOpen() });
  } catch (err) {
    return res
      .status(500)
      .json({ error: "Internal Server Error", message: err.message });
  }
});

// ---- CREATE THE OWNER THEN RETURN TOKEN ---- through an open door only.
router.post("/signup", async (req, res) => {
  try {
    if (!(await isOpen())) {
      return res.status(403).json({ error: SIGNUP_CLOSED });
    }

    const { email, password } = req.body;

    const user = await createUser(email, password);

    // A fresh signup is an account owner/admin (account = self).
    const accessToken = signToken({
      user_id: user.user_id,
      account_id: user.user_id,
      role: "admin",
    });

    res.status(201).json({
      message: "User created",
      user: { ...user, role: "admin", display_name: null },
      token: accessToken,
    });
  } catch (err) {
    // The password rule (a sentence, 400) and the older string errors.
    if (err.type === "validation") {
      return res.status(400).json({ error: err.message });
    }

    if (err.message === "Missing fields") {
      return res.status(400).json({ error: err.message });
    }

    if (err.message === "Invalid email") {
      return res.status(400).json({ error: err.message });
    }

    if (err.message === "Email already exists") {
      return res.status(409).json({ error: err.message });
    }

    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// The throttle runs first: past ten failures on an email (or fifty from one
// address) in fifteen minutes it answers 429 and this handler never runs.
router.post("/login", loginThrottle.middleware, async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await validateUser(email, password);

    // Data scope resolves to the account owner; a dispatcher rides their owner's id.
    const account_id = user.parent_user_id ?? user.user_id;
    const accessToken = signToken({
      user_id: user.user_id,
      account_id,
      role: user.role,
    });

    res.status(200).json({
      message: "User logged in successfully",
      user: {
        user_id: user.user_id,
        email: user.email,
        role: user.role,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
      },
      token: accessToken,
    });
  } catch (err) {
    if (err.message === "Missing fields") {
      return res.status(400).json({ error: err.message });
    }

    if (err.message === "Invalid credentials") {
      return res.status(401).json({ error: err.message });
    }

    return res
      .status(500)
      .json({ error: "Internal Server Error", message: err.message });
  }
});

export default router;
