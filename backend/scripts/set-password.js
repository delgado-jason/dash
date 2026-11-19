#!/usr/bin/env node
import "dotenv/config";
import readline from "node:readline";
import bcrypt from "bcrypt";
import { db } from "../db/pool.js";
import { passwordErrors } from "../src/utils/validation/passwordValidation.js";

// Break-glass: set a login's password from the laptop, for the one case the app
// cannot serve — the OWNER forgot theirs. (A dispatcher asks the owner, who sets
// a new one under Settings → Team; the owner has nobody above them.) There is no
// email reset by design (epic #277: no invite or mail infrastructure), so this
// script is the owner's reset.
//
//   dev:   set -a; . backend/.env.development; set +a
//          node backend/scripts/set-password.js who@example.com
//   prod:  set -a; . backend/.env; set +a
//          RESET_PROD=1 node backend/scripts/set-password.js who@example.com
//
// The password is typed at a prompt with echo off and asked twice; it is never
// on the command line (shell history) and never printed. Like migrate.js, the
// script refuses production unless told RESET_PROD=1 — a bare run on a dev
// machine loads backend/.env, which points at prod. With stdin not a terminal
// (a pipe) the two lines are read plainly, so a test can drive it.

const PROD_REF = "zeeglmaqitxjqzxfikwy";

const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};

if (
  (process.env.DATABASE_URL ?? "").includes(PROD_REF) &&
  process.env.RESET_PROD !== "1"
) {
  fail(
    [
      "REFUSING: DATABASE_URL points at PRODUCTION (" + PROD_REF + ").",
      "  dev:               source backend/.env.development first",
      "  prod (deliberate): RESET_PROD=1 node backend/scripts/set-password.js who@example.com",
    ].join("\n"),
  );
}

const email = process.argv[2];
if (!email || !email.includes("@")) {
  fail("usage: node backend/scripts/set-password.js who@example.com");
}

// Lines are queued as they arrive, so a line piped in before the question is
// asked is kept, not dropped — and one interface serves both questions.
const tty = process.stdin.isTTY === true;
const rl = readline.createInterface({
  input: process.stdin,
  output: tty ? process.stdout : undefined,
  terminal: tty,
});
const lines = [];
const waiters = [];
let closed = false;
rl.on("line", (line) => {
  const waiter = waiters.shift();
  if (waiter) waiter(line);
  else lines.push(line);
});
rl.on("close", () => {
  closed = true;
  while (waiters.length) waiters.shift()(null);
});
if (tty) {
  // Every keystroke after the prompt is drawn as a star; the Enter goes through.
  rl._writeToOutput = function (text) {
    rl.output.write(rl.muted && !/^[\r\n]+$/.test(text) ? "*" : text);
  };
}

const nextLine = () =>
  new Promise((resolve) => {
    if (lines.length) return resolve(lines.shift());
    if (closed) return resolve(null);
    waiters.push(resolve);
  });

async function askHidden(question) {
  if (tty) {
    rl.setPrompt(question);
    rl.prompt();
    rl.muted = true;
  } else {
    process.stdout.write(question);
  }
  const answer = await nextLine();
  rl.muted = false;
  process.stdout.write("\n");
  return answer;
}

const found = await db.query(
  `SELECT user_id, role, display_name FROM users WHERE email = $1`,
  [email],
);
const user = found.rows[0];
if (!user) {
  rl.close();
  await db.pool.end();
  fail("No user with the email " + email + ".");
}

const first = await askHidden("New password for " + email + ": ");
const second = first == null ? null : await askHidden("Type it again: ");
rl.close();

if (first == null || second == null) {
  await db.pool.end();
  fail("No password typed. Nothing changed.");
}
const problems = passwordErrors(first);
if (problems.length) {
  await db.pool.end();
  fail(problems[0]);
}
if (first !== second) {
  await db.pool.end();
  fail("The two did not match. Nothing changed.");
}

const hash = await bcrypt.hash(first, 10);
await db.query(`UPDATE users SET password_hash = $1 WHERE user_id = $2`, [
  hash,
  user.user_id,
]);
await db.pool.end();
console.log(
  "Password set for " +
    email +
    " (" +
    user.role +
    (user.display_name ? ", " + user.display_name : "") +
    "). Open sessions keep working until they expire.",
);
