"use client";

import { useActionState, useState } from "react";
import { login, signup, type AuthFormState } from "./actions";

const initialState: AuthFormState = { message: "" };

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loginState, loginAction, loginPending] = useActionState(login, initialState);
  const [signupState, signupAction, signupPending] = useActionState(signup, initialState);

  const isLogin = mode === "login";
  const state = isLogin ? loginState : signupState;
  const pending = isLogin ? loginPending : signupPending;

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="mark">Bf</div>
        <h1>{isLogin ? "Logga in" : "Skapa konto"}</h1>
        <p>
          Bokföring för enskild firma — mata in konton, ladda upp kvitton, få
          underlag klart för revisorn.
        </p>
        <form action={isLogin ? loginAction : signupAction}>
          <div className="field">
            <label htmlFor="email">E-post</label>
            <input id="email" name="email" type="email" placeholder="du@foretag.se" required />
          </div>
          <div className="field">
            <label htmlFor="password">Lösenord</label>
            <input
              id="password"
              name="password"
              type="password"
              placeholder="••••••••"
              minLength={isLogin ? undefined : 8}
              required
            />
          </div>
          <button className="btn" type="submit" disabled={pending}>
            {pending ? "Ett ögonblick…" : isLogin ? "Logga in" : "Skapa konto"}
          </button>
        </form>
        {state.message && (
          <div
            className={`callout ${state.message.includes("Kolla din e-post") ? "" : "error"}`}
            aria-live="polite"
          >
            {state.message}
          </div>
        )}
        <div className="auth-switch">
          {isLogin ? (
            <>
              Inget konto än?{" "}
              <a href="#" onClick={(e) => (e.preventDefault(), setMode("signup"))}>
                Skapa ett
              </a>
            </>
          ) : (
            <>
              Har redan ett konto?{" "}
              <a href="#" onClick={(e) => (e.preventDefault(), setMode("login"))}>
                Logga in
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
