import { verifyToken } from "../utils/jwt.js";

export function requireAuth(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const token = header.split(" ")[1];

  try {
    const payload = verifyToken(token);
    req.user = payload; // attach decoded payload
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}
