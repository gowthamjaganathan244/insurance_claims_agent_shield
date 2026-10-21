"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { authRequest } from "./auth-request";
type Challenge = {
  name: string;
  requiredAttributes: string[];
  choices: string[];
  secret?: string;
};
type Mode = "login" | "forgot" | "reset" | "challenge";

export function LoginForm() {
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  const newPassword =
    mode === "reset" || challenge?.name === "NEW_PASSWORD_REQUIRED";
  const password = mode === "login" || newPassword;
  const code =
    mode === "reset" ||
    (mode === "challenge" &&
      !newPassword &&
      challenge?.name !== "SELECT_MFA_TYPE");
  function restart() {
    setMode("login");
    setChallenge(null);
    setError("");
    setMessage("");
    setShow(false);
    formRef.current?.reset();
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const form = event.currentTarget;
    const data = new FormData(form);
    if (newPassword && data.get("password") !== data.get("confirm")) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const attributes = Object.fromEntries(
        (challenge?.requiredAttributes ?? []).map((name) => [
          name,
          String(data.get(`attribute-${name}`) ?? ""),
        ]),
      );
      const result = await authRequest(
        mode === "forgot" || mode === "reset"
          ? "/api/auth/recovery"
          : "/api/auth/login",
        {
          action: mode === "reset" ? "confirm" : mode,
          username,
          password: String(data.get("password") ?? ""),
          code: String(data.get("code") ?? ""),
          choice: String(data.get("choice") ?? ""),
          attributes,
        },
      );
      // Passwords are uncontrolled form fields and are cleared after each submission.
      form.reset();
      setShow(false);
      if (result.redirect === "/") {
        window.location.replace("/");
        return;
      }
      if (result.challenge) {
        setChallenge(result.challenge);
        setMode("challenge");
      } else if (mode === "forgot") {
        setMode("reset");
        setMessage(result.message);
      } else if (mode === "reset") {
        setMode("login");
        setChallenge(null);
        setMessage(result.message);
      }
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to sign in. Please try again.",
      );
      const secret = form.elements.namedItem("password");
      if (secret instanceof HTMLInputElement) secret.value = "";
    } finally {
      setBusy(false);
    }
  }
  const label =
    mode === "login"
      ? "Sign in"
      : mode === "forgot"
        ? "Send recovery code"
        : mode === "reset"
          ? "Reset password"
          : "Continue securely";
  return (
    <form
      ref={formRef}
      className="auth-form"
      onSubmit={submit}
      aria-busy={busy}
    >
      {mode !== "login" && (
        <h2 className="auth-step">
          {mode === "forgot"
            ? "Forgot password"
            : mode === "reset"
              ? "Reset your password"
              : newPassword
                ? "Choose a new password"
                : challenge?.name === "MFA_SETUP"
                  ? "Set up your authenticator"
                  : "Verify your identity"}
        </h2>
      )}
      {message && (
        <p role="status" className="auth-notice">
          {message}
        </p>
      )}
      {error && (
        <p
          ref={errorRef}
          tabIndex={-1}
          id="auth-error"
          role="alert"
          className="auth-error"
        >
          {error}
        </p>
      )}
      <fieldset disabled={busy}>
        {mode !== "challenge" && (
          <div className="auth-field">
            <label htmlFor="username">Email or username</label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              maxLength={128}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              aria-describedby={error ? "auth-error" : undefined}
            />
          </div>
        )}
        {mode === "challenge" && (
          <p className="auth-caption">
            Complete the verification required by your account to continue.
          </p>
        )}
        {password && (
          <div className="auth-field">
            <label htmlFor="password">
              {newPassword ? "New password" : "Password"}
            </label>
            <div className="auth-password">
              <input
                id="password"
                name="password"
                type={show ? "text" : "password"}
                autoComplete={newPassword ? "new-password" : "current-password"}
                required
                maxLength={256}
                aria-describedby={error ? "auth-error" : undefined}
              />
              <button
                type="button"
                aria-label={show ? "Hide password" : "Show password"}
                aria-pressed={show}
                onClick={() => setShow(!show)}
              >
                {show ? "Hide" : "Show"}
              </button>
            </div>
          </div>
        )}
        {newPassword && (
          <div className="auth-field">
            <label htmlFor="confirm">Confirm new password</label>
            <input
              id="confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              required
              maxLength={256}
            />
          </div>
        )}
        {challenge?.requiredAttributes.map((attribute) => (
          <div className="auth-field" key={attribute}>
            <label htmlFor={`attribute-${attribute}`}>
              {attribute.replaceAll("_", " ")}
            </label>
            <input
              id={`attribute-${attribute}`}
              name={`attribute-${attribute}`}
              required
              maxLength={2048}
            />
          </div>
        ))}
        {challenge?.secret && (
          <div className="auth-notice">
            <p>
              Add this setup key to your authenticator app, then enter its
              current code.
            </p>
            <code className="auth-setup-key">{challenge.secret}</code>
            <p>Account: AgentShield ({username}). Keep this key private.</p>
          </div>
        )}
        {challenge?.name === "SELECT_MFA_TYPE" && (
          <div className="auth-field">
            <label htmlFor="choice">Verification method</label>
            <select name="choice" id="choice" required>
              {challenge.choices.map((choice) => (
                <option key={choice} value={choice}>
                  {choice === "SOFTWARE_TOKEN_MFA"
                    ? "Authenticator app"
                    : choice === "SMS_MFA"
                      ? "Text message"
                      : choice}
                </option>
              ))}
            </select>
          </div>
        )}
        {code && (
          <div className="auth-field">
            <label htmlFor="code">Verification code</label>
            <input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6,8}"
              minLength={6}
              maxLength={8}
              required
            />
          </div>
        )}
        <button className="btn ok auth-submit" type="submit">
          {busy ? "Please wait…" : label}
        </button>
        {mode === "login" ? (
          <button
            className="auth-text-button"
            type="button"
            onClick={() => {
              setMode("forgot");
              setError("");
              setMessage("");
            }}
          >
            Forgot password?
          </button>
        ) : (
          <button className="auth-text-button" type="button" onClick={restart}>
            Back to sign in
          </button>
        )}
      </fieldset>
      <p className="auth-form-note">
        Use the account provided by your organisation.
      </p>
    </form>
  );
}
