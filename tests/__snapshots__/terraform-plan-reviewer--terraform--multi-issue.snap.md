---

# Terraform Plan Review — `data-platform` Analytics Stack

**Plan:** 6 resources to create | **Environment:** production | **Region:** us-east-1
**Reviewed:** 2026-02-23

---

## Verdict

```
╔══════════════════════════════╗
║         ❌  FAIL             ║
║  2 Critical · 3 High · 3 Med ║
╚══════════════════════════════╝
```

**Do not apply this plan.** Two critical security defects must be resolved before this infrastructure can be provisioned in a production environment.

---

## Security Findings

### 🚨 CRITICAL — IAM Wildcard Policy (`aws_iam_policy.analytics_full_access`)

**Severity:** Critical | **Resource:** `aws_iam_policy.analytics_full_access` + `aws_iam_role_policy_attachment.analytics_attach`

The policy being created and immediately attached to the EC2 service role is equivalent to `AdministratorAccess`:

```json
{
  "Effect": "Allow",
  "Action": "*",
  "Resource": "*"
}
```

Any EC2 instance bearing `analytics-service-role` can perform **any action on any AWS resource** — including creating new IAM users, exfiltrating S3 data, launching infrastructure, or deleting production resources. If this instance is compromised (via SSRF, RCE, or a malicious AMI), the blast radius is the entire AWS account.

**Required fix:** Replace with a least-privilege policy scoped to only what the analytics workload requires (e.g., specific S3 buckets, Glue/Athena actions, or a named Secrets Manager secret). No wildcard actions or resources.

---

### 🚨 CRITICAL — RDS Publicly Accessible (`aws_db_instance.analytics`)

**Severity:** Critical | **Resource:** `aws_db_instance.analytics`

`publicly_accessible: true` on a production PostgreSQL instance means AWS will assign the RDS endpoint a public IP and make it resolvable via public DNS. The security group currently restricts port 5432 to `10.0.0.0/8` — but this is a single layer of defense. Misconfiguration, future SG rule additions, or subnet ACL changes could expose the database to the internet.

Databases should never be publicly accessible. This is a violation of the AWS Well-Architected Framework, and will fail most compliance audits (SOC 2, PCI DSS, HIPAA).

**Required fix:** Set `publicly_accessible = false`. Access the DB from private subnets only.

---

### 🔴 HIGH — Unencrypted RDS Storage (`aws_db_instance.analytics`)

**Severity:** High | **Resource:** `aws_db_instance.analytics`

`storage_encrypted: false` on a production database containing analytics data. Encryption at rest is a baseline control required by SOC 2 Type II, PCI DSS, and HIPAA. AWS KMS encryption for RDS has negligible performance impact.

**Note:** Encryption cannot be enabled on an existing unencrypted RDS instance — it requires creating a new encrypted instance and migrating data. Fix this **before** provisioning.

**Required fix:** Set `storage_encrypted = true`. Optionally specify a `kms_key_id` for a customer-managed key.

---

### 🔴 HIGH — No Deletion Protection + Skip Final Snapshot (`aws_db_instance.analytics`)

**Severity:** High | **Resource:** `aws_db_instance.analytics`

Two settings together create a data-loss scenario with no recovery path:
- `deletion_protection = false` — the database can be deleted by any user with `rds:DeleteDBInstance`
- `skip_final_snapshot = true` — deletion produces no snapshot, so data is permanently gone

For a production database, both should be hardened.

**Required fix:**
```hcl
deletion_protection   = true
skip_final_snapshot   = false
final_snapshot_identifier = "analytics-db-final-${timestamp()}"
```

---

### 🔴 HIGH — Backup Retention: 1 Day (`aws_db_instance.analytics`)

**Severity:** High | **Resource:** `aws_db_instance.analytics`

`backup_retention_period = 1` means automated backups are only retained for 24 hours. Production databases should retain backups for at minimum 7 days (30 days recommended for compliance workloads). A data corruption incident discovered 48 hours later would have no automated recovery path.

**Required fix:** Set `backup_retention_period = 7` (minimum) or `30` for compliance-sensitive workloads.

---

### 🟡 MEDIUM — Single-AZ RDS (`aws_db_instance.analytics`)

**Severity:** Medium | **Resource:** `aws_db_instance.analytics`

`multi_az = false` on a production database means any AZ-level failure results in full downtime with no automatic failover. For an analytics workload, this may be acceptable during off-peak hours — but given the `production` tag, this warrants explicit sign-off.

**Required fix (recommended):** Set `multi_az = true`. Estimated cost impact: ~+$350/month (doubles the RDS cost). If single-AZ is an intentional cost trade-off, document it explicitly in the Terraform with a comment.

---

### 🟡 MEDIUM — Unrestricted Egress (`aws_security_group.analytics_sg`)

**Severity:** Medium | **Resource:** `aws_security_group.analytics_sg`

All outbound traffic is permitted (`0.0.0.0/0`, `::/0`, all ports, all protocols). If the analytics worker is compromised, it can freely exfiltrate data or communicate with external C2 infrastructure with no network-level controls.

**Required fix:** Restrict egress to only required destinations — e.g., specific S3 VPC endpoint, RDS SG, and corporate DNS. At minimum, restrict to `10.0.0.0/8` for data paths.

---

### 🟡 MEDIUM — EC2 Detailed Monitoring Disabled (`aws_instance.analytics_worker`)

**Severity:** Medium | **Resource:** `aws_instance.analytics_worker`

`monitoring = false` disables CloudWatch detailed monitoring (1-minute granularity). For a `c5.2xlarge` worker processing analytics workloads, anomaly detection and CPU/network visibility are important for both operations and security incident detection.

**Required fix:** Set `monitoring = true`. Cost: ~$3.50/month — negligible for this instance type.

---

## Cost Estimate

| Resource | Type | Est. Monthly (On-Demand) |
|---|---|---|
| `aws_db_instance.analytics` | db.r6g.xlarge, 200–500 GB gp3 | ~$370–420 |
| `aws_instance.analytics_worker` | c5.2xlarge, 100 GB gp3 | ~$253 |
| **Total** | | **~$623–673/month** |

> ⚠️ **Savings opportunity:** If the analytics worker runs batch jobs rather than 24/7, consider Spot Instances (up to 70% savings on c5.2xlarge) or scheduling instance start/stop. For RDS, Reserved Instances (1-year) reduce cost by ~40%.
>
> ⚠️ **Multi-AZ cost impact:** Enabling `multi_az = true` (recommended above) approximately doubles the RDS cost to ~$740–840/month total.

---

## Summary Table

| # | Resource | Finding | Severity | Blocks Deploy? |
|---|---|---|---|---|
| 1 | `aws_iam_policy.analytics_full_access` | Wildcard `Action:* Resource:*` policy | 🚨 Critical | ✅ Yes |
| 2 | `aws_db_instance.analytics` | `publicly_accessible = true` | 🚨 Critical | ✅ Yes |
| 3 | `aws_db_instance.analytics` | `storage_encrypted = false` | 🔴 High | ✅ Yes |
| 4 | `aws_db_instance.analytics` | No deletion protection + no final snapshot | 🔴 High | Recommended |
| 5 | `aws_db_instance.analytics` | Backup retention = 1 day | 🔴 High | Recommended |
| 6 | `aws_db_instance.analytics` | Single-AZ, no failover | 🟡 Medium | No |
| 7 | `aws_security_group.analytics_sg` | Unrestricted egress | 🟡 Medium | No |
| 8 | `aws_instance.analytics_worker` | Detailed monitoring disabled | 🟡 Medium | No |

---

## Required Actions Before Re-Review

1. **[ ] Scope the IAM policy** — Replace `Action:* Resource:*` with least-privilege statements
2. **[ ] Set `publicly_accessible = false`** on RDS
3. **[ ] Set `storage_encrypted = true`** on RDS (requires fresh provisioning — cannot be patched in-place)
4. **[ ] Enable deletion protection and final snapshot** on RDS
5. **[ ] Increase backup retention** to ≥ 7 days

Once items 1–3 are resolved, this plan can be re-submitted. Items 4–5 are strongly recommended before production but do not constitute a security blocker on their own.
