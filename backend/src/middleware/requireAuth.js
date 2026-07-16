import { verifyToken, signToken } from "../utils/jwt.js";

export function requireAuth(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const token = header.split(" ")[1];

  try {
    const payload = verifyToken(token);
    req.user = payload; // attach decoded payload

    // Sliding session: once the token is past the halfway point of its lifetime,
    // hand back a fresh one via a response header so an active session keeps
    // renewing and never expires mid-work. Only a true idle gap lets it lapse.
    if (payload.iat && payload.exp) {
      const nowSec = Math.floor(Date.now() / 1000);
      const halfway = payload.iat + (payload.exp - payload.iat) / 2;
      if (nowSec >= halfway) {
        res.set("X-Refreshed-Token", signToken({ user_id: payload.user_id }));
      }
    }

    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}
