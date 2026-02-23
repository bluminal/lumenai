# 🔴 TERRAFORM PLAN REVIEW — FAIL

**Verdict: DO NOT APPLY**
**Risk Level: CRITICAL**
**Reviewed: 2026-02-23**

---

## Executive Summary

This plan will **permanently destroy a production PostgreSQL database and its security group**. The combination of `skip_final_snapshot = true` and `delete_automated_backups = true` means **all user data will be irrecoverably lost the moment this plan is applied.** This is a catastrophic, unrecoverable action.

---

## Resources Affected

| Resource | Action | Risk |
|---|---|---|
| `aws_db_instance.production_users` | 🔴 DESTROY | **CRITICAL — Production data loss** |
| `aws_security_group.production_db` | 🔴 DESTROY | HIGH — Cascading network impact |

**Plan summary: 0 add, 0 change, 2 destroy**

---

## Critical Findings

### 🔴 CRITICAL-1: Production Database Destruction with No Final Snapshot

The plan will delete `prod-users-db` — a live production RDS instance tagged `Environment: production` containing the `users_production` database.

**The two most dangerous flags on this instance:**

```hcl
skip_final_snapshot      = true   # ❌ No snapshot taken before deletion
delete_automated_backups = true   # ❌ All 7 days of backups also deleted
```

Once `terraform apply` completes, there is **no recovery path**. The data is gone. The existing 7-day automated backup window (`03:00-04:00`) and the backup retention period provide zero protection here because `delete_automated_backups = true` purges them as part of the destroy sequence.

---

### 🔴 CRITICAL-2: Root Cause Is Likely Accidental Config Deletion

Terraform's own output tells you why these resources are being destroyed:

> `(because aws_db_instance.production_users is not in configuration)`

This is not a planned decommission — the resource definitions were **removed from the Terraform configuration files**, likely by accident (a bad merge, a stale branch, a missing `terraform import`, or a refactor gone wrong). This plan is a symptom of a configuration drift problem, not an intentional teardown.

---

### 🔴 CRITICAL-3: Deletion Protection Is Disabled

```hcl
deletion_protection = false
```

A production database of this tier (Multi-AZ, `db.r6g.2xlarge`, 500GB, encrypted with KMS) should have `deletion_protection = true`. This setting exists precisely to block accidental destroys like this one. Its absence here contributed to this situation being reachable at all.

---

### 🟠 HIGH-1: Security Group Destruction Will Break Application Connectivity

`aws_security_group.production_db` (`sg-0a1b2c3d4e5f67890`) is the network boundary for the database. It permits ingress on port 5432 from the application security group (`sg-0f1e2d3c4b5a69780`). Even if the database were being intentionally migrated, destroying this security group during the same apply would sever application-to-database connectivity for any new resource attempting to reuse it.

---

### 🟡 MEDIUM-1: Cost Savings Are Not a Valid Justification

For reference, the current monthly cost of this instance is approximately:

| Component | Est. Monthly Cost |
|---|---|
| `db.r6g.2xlarge` Multi-AZ (us-east-1) | ~$1,100–$1,400 |
| 500GB gp3 storage + 3000 IOPS | ~$80–$120 |
| Performance Insights (731-day retention) | ~$65 |
| Enhanced Monitoring | Included |
| **Total** | **~$1,250–$1,600/mo** |

Even if cost reduction were the goal, a destroy with no snapshot is never the right approach. Snapshot → terminate is the correct sequence for any intentional decommission.

---

## What You Must Do Before Reconsidering

1. **Immediately identify why this resource disappeared from config.** Check your git history:
   ```bash
   git log --all --oneline -- path/to/your/rds.tf
   git diff HEAD~1 HEAD -- path/to/your/rds.tf
   ```

2. **Take a manual RDS snapshot right now** (regardless of intent):
   ```bash
   aws rds create-db-snapshot \
     --db-instance-identifier prod-users-db \
     --db-snapshot-identifier prod-users-db-emergency-backup-$(date +%Y%m%d)
   ```

3. **Restore the resource to Terraform state** if it was accidentally removed. If the `.tf` file still exists elsewhere:
   ```bash
   terraform import aws_db_instance.production_users prod-users-db
   ```

4. **Enable deletion protection** on the live instance immediately:
   ```bash
   aws rds modify-db-instance \
     --db-instance-identifier prod-users-db \
     --deletion-protection \
     --apply-immediately
   ```

5. **Do not run `terraform apply`** in any environment where this plan is the current state until root cause is confirmed and the config is restored.

---

## Verdict

```
╔══════════════════════════════════════════════════════╗
║  VERDICT: ❌ FAIL — DO NOT APPLY                     ║
║                                                      ║
║  Applying this plan will permanently destroy a       ║
║  production database with no snapshot and no         ║
║  recovery path. This is almost certainly caused      ║
║  by an accidental removal of Terraform config.       ║
║  Treat this as an incident. Do not proceed.          ║
╚══════════════════════════════════════════════════════╝
```
