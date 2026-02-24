---

# Terraform Plan Review

**Plan:** `acme-prod-application-assets-us-east-1` S3 Bucket Stack
**Terraform Version:** 1.9.5 | **AWS Provider:** `~> 5.0` | **Region:** `us-east-1`
**Review Date:** 2026-02-23

---

## Summary

| Dimension | Status | Notes |
|-----------|--------|-------|
| **Security** | ⚠️ WARN | Missing bucket policy & MFA delete; otherwise strong posture |
| **Cost** | ✅ PASS | Well-optimized lifecycle; KMS bucket key reduces API costs |
| **Risk** | ⚠️ WARN | External dependency unmanaged; hardcoded KMS ARN |
| **Change Impact** | ✅ PASS | Net-new creates only — no destructive changes |

---

## Verdict

> **⚠️ WARN — Approve with Conditions**
>
> This plan is well-architected for a production S3 bucket and follows most AWS security best practices. However, two findings should be addressed before or shortly after deployment: a missing bucket policy (particularly HTTPS-only enforcement) and an unmanaged external dependency on the logging bucket. Neither is a blocker, but both represent meaningful gaps in a production environment.

---

## Resource Inventory

| Resource | Action | Notes |
|----------|--------|-------|
| `aws_s3_bucket.application_assets` | 🟢 create | Bucket name follows org naming convention |
| `aws_s3_bucket_versioning.application_assets` | 🟢 create | Versioning enabled |
| `aws_s3_bucket_server_side_encryption_configuration.application_assets` | 🟢 create | KMS CMK with bucket key |
| `aws_s3_bucket_public_access_block.application_assets` | 🟢 create | All 4 flags enabled |
| `aws_s3_bucket_logging.application_assets` | 🟡 create | Depends on unmanaged external bucket |
| `aws_s3_bucket_lifecycle_configuration.application_assets` | 🟢 create | IA → Glacier tiering + noncurrent expiry |

**6 creates, 0 updates, 0 destroys**

---

## Security Findings

### 🔴 S3-SEC-01 — No Bucket Policy Enforcing HTTPS-Only Access
**Severity: HIGH**

There is no `aws_s3_bucket_policy` resource in this plan. Without an explicit policy, there is no enforcement of `aws:SecureTransport`, meaning requests over plain HTTP are permitted. For a production bucket this is a compliance gap in most frameworks (SOC 2, PCI-DSS, CIS AWS Benchmark).

**Recommended fix:**
```hcl
resource "aws_s3_bucket_policy" "application_assets" {
  bucket = aws_s3_bucket.application_assets.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyNonTLS"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [
          aws_s3_bucket.application_assets.arn,
          "${aws_s3_bucket.application_assets.arn}/*"
        ]
        Condition = {
          Bool = { "aws:SecureTransport" = "false" }
        }
      }
    ]
  })
}
```

---

### 🟡 S3-SEC-02 — MFA Delete Disabled on Production Bucket
**Severity: MEDIUM**

`mfa_delete` is set to `"Disabled"`. On a production bucket, MFA Delete prevents accidental or unauthorized permanent deletion of object versions. Enabling it requires the AWS account root credentials to activate — operational overhead, but meaningful protection.

> **Note:** Enabling MFA Delete via Terraform requires the root account credentials and is often done out-of-band. If this is a deliberate decision, document it with a comment in the Terraform source.

---

### 🟡 S3-SEC-03 — Missing `aws_s3_bucket_ownership_controls`
**Severity: LOW**

AWS now defaults new buckets to `BucketOwnerEnforced` (ACLs disabled), but the plan does not explicitly declare this. Explicit ownership controls prevent future drift and make intent clear to reviewers.

```hcl
resource "aws_s3_bucket_ownership_controls" "application_assets" {
  bucket = aws_s3_bucket.application_assets.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}
```

---

### 🟢 Security Positives

- ✅ **KMS CMK encryption** with `aws:kms` and `bucket_key_enabled: true` — well configured
- ✅ **All 4 public access block flags** enabled — no public exposure possible
- ✅ **`force_destroy: false`** — protects against accidental `terraform destroy` data loss
- ✅ **Access logging** enabled to a dedicated log bucket with prefixed path
- ✅ **Multi-Region Key (MRK)** used (`mrk-` prefix) — supports cross-region disaster recovery
- ✅ **Versioning enabled** — provides object-level recovery

---

## Cost Analysis

### Estimated Monthly Cost Profile

| Component | Est. Cost | Notes |
|-----------|-----------|-------|
| S3 Standard storage (0–90 days) | Variable | Pay-per-GB |
| S3 Standard-IA (90–180 days) | ~23% cheaper than Standard | Min 30-day charge per object |
| S3 Glacier (180+ days) | ~80% cheaper than Standard | Retrieval latency applies |
| KMS API calls | Reduced ✅ | `bucket_key_enabled: true` minimizes per-object KMS calls |
| Noncurrent version storage | Controlled ✅ | Expires at 365 days |

### 💡 Cost Observations

**Positive:** The tiered lifecycle policy (Standard → IA at 90d → Glacier at 180d) is well-designed for long-lived application assets and will meaningfully reduce storage costs over time. The `bucket_key_enabled: true` setting on the KMS configuration is a best practice that can reduce KMS costs by 99%+ compared to per-object key generation.

**Watch:** Standard-IA has a 30-day minimum storage charge and a per-GB retrieval fee. If asset access patterns result in frequent retrieval of IA-tier objects, this could negate the storage savings. Consider whether `INTELLIGENT_TIERING` might be a better fit if access patterns are unpredictable.

---

## Risk Findings

### 🟡 RISK-01 — External Dependency: Logging Bucket Not Managed in This Plan
**Severity: MEDIUM**

`aws_s3_bucket_logging` targets `acme-prod-access-logs-us-east-1`, but that bucket is not created or referenced as a `data` source in this plan. If the bucket doesn't exist or the target bucket lacks the S3 Log Delivery group write permissions, the `aws_s3_bucket_logging` resource creation will fail, blocking the entire apply.

**Recommended fix:** Either add a `data "aws_s3_bucket"` reference to validate the bucket exists at plan time, or manage the log bucket in this same module/state.

```hcl
data "aws_s3_bucket" "access_logs" {
  bucket = "acme-prod-access-logs-us-east-1"
}
```

---

### 🟡 RISK-02 — Hardcoded KMS Key ARN
**Severity: LOW**

The KMS key ARN `arn:aws:kms:us-east-1:123456789012:key/mrk-a1b2c3d4e5f6` is hardcoded in the plan rather than referenced via a variable or data source. This makes the configuration brittle and environment-specific.

**Recommended fix:**
```hcl
variable "kms_key_arn" {
  type        = string
  description = "ARN of the KMS CMK for S3 encryption"
}
```
Or use a data source: `data "aws_kms_key" "s3"`.

---

### 🟢 Risk Positives

- ✅ **Net-new creates only** — zero destructive changes, zero replacement operations
- ✅ **No `force_destroy`** — eliminates accidental wipe risk
- ✅ **Noncurrent version expiration at 365 days** — prevents unbounded storage growth from versioning
- ✅ **Proper tagging** (CostCenter, Owner, Environment, Project) — enables cost attribution and incident response

---

## Checklist for Approval

- [ ] **Add `aws_s3_bucket_policy`** with HTTPS-only (`aws:SecureTransport`) enforcement ← *required before or immediately after deploy*
- [ ] **Verify `acme-prod-access-logs-us-east-1` exists** and has S3 Log Delivery permissions before applying
- [ ] **Add `aws_s3_bucket_ownership_controls`** resource explicitly setting `BucketOwnerEnforced`
- [ ] **Parameterize the KMS key ARN** via variable or data source
- [ ] **Document MFA Delete decision** in code comments if intentionally left disabled

---

*Terraform Plan Reviewer — Synthex | Bluminal Labs*
