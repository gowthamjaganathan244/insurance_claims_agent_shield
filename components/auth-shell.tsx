import type { ReactNode } from "react";
export function AuthShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main id="app" className="auth-page" tabIndex={-1}>
      <div className="auth-intro">
        <a
          href="/login"
          className="auth-brand"
          aria-label="AgentShield AU sign in"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            aria-hidden="true"
          >
            <path d="M12 2.5 4 6v6c0 4.6 3.2 8.2 8 9.5 4.8-1.3 8-4.9 8-9.5V6l-8-3.5Z" />
            <path d="m8.5 12 2.5 2.5 4.5-5" className="auth-shield-check" />
          </svg>
          <span>
            AgentShield <small>AU</small>
          </span>
        </a>
        <p className="auth-eyebrow">INSURANCE OPERATIONS</p>
        <p className="auth-statement">
          Clarity for every claim.
          <br />
          <span>Confidence at every step.</span>
        </p>
        <p className="auth-caption">
          Your secure workspace for claims, investigations and customer
          communications.
        </p>
        <div className="auth-assurance">
          <i className="dot" aria-hidden="true" /> Protected with Amazon Cognito
        </div>
      </div>
      <section className="auth-card glass lq" aria-labelledby="auth-title">
        <h1 id="auth-title">{title}</h1>
        <p className="auth-description">{description}</p>
        {children}
      </section>
      <p className="auth-footer">AgentShield AU · Authorised access only</p>
    </main>
  );
}
