import type { ReactNode } from "react";
export function AuthShell({
  title,
  description,
  children,
  paddock = false,
}: {
  title: string;
  description: string;
  children: ReactNode;
  paddock?: boolean;
}) {
  return (
    <main
      id="app"
      className={`auth-page${paddock ? " paddock-access" : ""}`}
      tabIndex={-1}
    >
      <div className="auth-intro">
        {paddock && (
          <div className="paddock-architecture" aria-hidden="true">
            <div className="paddock-architecture-roof" />
            <div className="paddock-architecture-bay" />
            <div className="paddock-architecture-lane" />
            <div className="paddock-architecture-beam" />
          </div>
        )}
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
        <div className="auth-intro-copy">
          <p className="auth-eyebrow">
            {paddock
              ? "PADDOCK ACCESS / AGENTSHIELD AU"
              : "INSURANCE OPERATIONS"}
          </p>
          <p className="auth-statement">
            {paddock ? (
              <>
                PRECISION IN
                <br />
                EVERY <span>CLAIM.</span>
              </>
            ) : (
              <>
                Clarity for every claim.
                <br />
                <span>Confidence at every step.</span>
              </>
            )}
          </p>
          <p className="auth-caption">
            {paddock
              ? "Secure insurance operations, engineered for clarity and confidence."
              : "Your secure workspace for claims, investigations and customer communications."}
          </p>
        </div>
        <div className="auth-assurance">
          {paddock ? (
            <>
              <span className="paddock-assurance-rule" aria-hidden="true" />
              <span>ENGINEERED FOR CONFIDENCE</span>
              <span>AGENTSHIELD / AU</span>
            </>
          ) : (
            <>
              <i className="dot" aria-hidden="true" /> Protected with Amazon
              Cognito
            </>
          )}
        </div>
      </div>
      <section className="auth-card glass lq" aria-labelledby="auth-title">
        {paddock && (
          <div className="paddock-console-top" aria-hidden="true">
            <span className="paddock-console-mark">
              AS <i />
            </span>
            <span>SECURE ACCESS CONSOLE</span>
            <span>01 / ENTRY</span>
          </div>
        )}
        <h1 id="auth-title">{title}</h1>
        <p className="auth-description">{description}</p>
        {children}
      </section>
      <p className="auth-footer">
        {paddock
          ? "AGENTSHIELD AU  /  AUTHORISED ACCESS ONLY"
          : "AgentShield AU · Authorised access only"}
      </p>
    </main>
  );
}
