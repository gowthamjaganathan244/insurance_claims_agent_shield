# Free HTTPS hosting (Vercel Hobby + Upstash Redis)

Portfolio hosting at about $0/month. The browser never talks to AWS directly; the
Next.js server calls the existing API Gateway APIs with the signed-in user's
Cognito token, so the host needs **no AWS access keys**.

1. Vercel → Add New Project → import this GitHub repository (framework: Next.js).
2. Project → Storage → add **Upstash Redis** (free plan). It adds the REST URL and
   token environment variables automatically.
3. Project → Settings → Environment Variables (Production):

   | Name                        | Value                                                         |
   | --------------------------- | ------------------------------------------------------------- |
   | `APP_ORIGIN`                | `https://<project>.vercel.app` (no trailing slash)            |
   | `AUTH_SESSION_KEY`          | new 64-hex value — do not reuse the local key                 |
   | `OPERATIONS_API_ORIGIN`     | `https://gmibi61uz7.execute-api.ap-southeast-2.amazonaws.com` |
   | `DOCUMENTS_READ_API_ORIGIN` | same as above                                                 |
   | `MONITORING_API_ORIGIN`     | same as above                                                 |

4. Deploy. Sign-in uses the Cognito API directly, so no callback URL is needed.
   Sign-out redirects to the Cognito hosted logout page; add
   `https://<project>.vercel.app` to the app client's **Allowed sign-out
   URLs** in the Cognito console for that redirect to be accepted.

Sessions are encrypted (A256GCM) before storage; Redis holds only hashed IDs and
ciphertext. Local development keeps using SQLite when the Redis variables are unset.
