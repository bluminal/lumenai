## 🚨 FAIL — Critical Secrets Exposure

This diff is a **hard block**. Do not merge under any circumstances.

---

### What's in This File

Six production credentials are hardcoded in `src/config/aws.ts`:

| Credential | Risk | Blast Radius |
|---|---|---|
| **AWS IAM Access Key + Secret** | 🔴 CRITICAL | Full AWS account compromise, unlimited billing fraud, data exfiltration from `acme-data-pipeline-prod` |
| **PostgreSQL connection string** (`admin:supersecret123@...rds.amazonaws.com`) | 🔴 CRITICAL | Full read/write database access, potential RCE via `COPY TO PROGRAM` |
| **Redis auth token + endpoint** | 🔴 CRITICAL | Session hijacking of all active users, cache poisoning |
| **Stripe live secret key** (`sk_live_...`) | 🔴 CRITICAL | Direct financial fraud — attacker can create charges and issue refunds |
| **SendGrid API key** | 🔴 HIGH | Phishing from your trusted domain, domain blacklisting |
| **Infrastructure hostnames** (RDS, ElastiCache, S3 bucket names) | 🟠 HIGH | Reconnaissance data persists in git history even after rotation |

---

### Do These Right Now (30-Minute Window)

Assume all credentials are compromised. Rotate in this order:

1. **AWS IAM key** → AWS Console → IAM → Users → Security Credentials → Delete & recreate
2. **Stripe secret key** → Stripe Dashboard → Developers → API Keys → Roll key
3. **RDS password** → RDS → Modify Instance → set new password
4. **Redis auth token** → ElastiCache → Modify Cluster
5. **SendGrid API key** → SendGrid → Settings → API Keys → Delete & recreate

Then **purge the commit from git history** — rotation alone is insufficient since the credentials live in every clone:

```bash
pip install git-filter-repo
git filter-repo --path src/config/aws.ts --invert-paths
git push --force-with-lease origin main
# All teammates must re-clone after this
```

---

### The Fix

Replace hardcoded values with environment variables and a `requireEnv()` guard:

```typescript
// src/config/aws.ts
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Required env var "${name}" is not set`);
  return value;
}

export const awsConfig = {
  region: process.env.AWS_REGION ?? 'us-east-1',
  credentials: {
    accessKeyId: requireEnv('AWS_ACCESS_KEY_ID'),
    secretAccessKey: requireEnv('AWS_SECRET_ACCESS_KEY'),
  },
};

export const databaseConfig = {
  connectionString: requireEnv('DATABASE_URL'),
  // ...
};
// etc.
```

Add `.env.example` (committed, no real values) and ensure `.env.local` is in `.gitignore`.

---

### Long-Term: Prevent Recurrence

- **CI secret scanning** — add [TruffleHog](https://github.com/trufflesecurity/trufflehog) or [detect-secrets](https://github.com/Yelp/detect-secrets) as a required PR check
- **IAM Roles over keys** — if this service runs on EC2/ECS/Lambda, use instance roles so no access keys are needed at all
- **AWS Secrets Manager** — for production, pull secrets at runtime from SSM/Secrets Manager rather than env vars

The TODO comment in the file ("Move to environment variables before production deploy") indicates the author knew this was wrong — that's a process gap that warrants a team conversation alongside technical remediation.
