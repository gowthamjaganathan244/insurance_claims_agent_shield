"use client";
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main id="app" tabIndex={-1}>
      <h1 className="pg">Something went wrong</h1>
      <p className="lede">Please retry to restore this view.</p>
      <div className="acts">
        <button className="btn ok" onClick={reset}>
          Try again
        </button>
      </div>
    </main>
  );
}
