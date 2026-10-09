import Link from "next/link";
export default function NotFound() {
  return (
    <main id="app" tabIndex={-1}>
      <h1 className="pg">Page not found</h1>
      <p className="lede">This page or claim could not be found.</p>
      <div className="acts">
        <Link prefetch={false} className="btn" href="/claims">
          Back to claims
        </Link>
        <Link prefetch={false} className="btn" href="/">
          Command
        </Link>
      </div>
    </main>
  );
}
