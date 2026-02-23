## Terraform Plan Review

---

## Summary Verdict

| Category | Rating | Key Finding |
|---|---|---|
| Security | ❌ FAIL | SSH open to `0.0.0.0/0` and `::/0` on a **production** bastion |
| Cost | ✅ PASS | `t3.micro` + gp3 storage is appropriate and cost-efficient |
| Risk | ⚠️ WARN | Public IP exposure with unrestricted ingress in production |
| **Overall** | ❌ **FAIL** | **Critical security misconfiguration must be resolved before apply** |

---

## 1. Security Findings

### 🔴 CRITICAL — Unrestricted SSH Ingress

The security group allows SSH (port 22) from **`0.0.0.0/0` and `::/0`** — the entire public internet, both IPv4 and IPv6. This defeats the purpose of a bastion host and exposes the instance to brute-force attacks, credential stuffing, and SSH daemon exploits.

**Required remediation:** Restrict to known CIDRs (corporate VPN, NAT gateway IPs):
```hcl
ingress = [{
  cidr_blocks = ["203.0.113.0/28"]  # Corporate VPN / NAT gateway range
  description = "SSH from corporate network only"
  from_port   = 22
  to_port     = 22
  protocol    = "tcp"
}]
```

> **Stronger alternative:** Replace SSH-based access entirely with **AWS Systems Manager Session Manager** — no inbound port 22 required, no key management, full audit trail.

---

### 🟠 HIGH — Public IP on a Production Instance

`associate_public_ip_address = true` is expected for a traditional bastion, but combined with the unrestricted security group, it creates an immediately exploitable attack surface. Consider **EC2 Instance Connect Endpoint** or **SSM Session Manager** to eliminate the public IP requirement.

---

### 🟡 MEDIUM — Unrestricted Egress

All outbound traffic is allowed (`0.0.0.0/0`, all ports/protocols). If the host is compromised, this enables data exfiltration and lateral movement. Restrict egress to only necessary destinations (internal subnet CIDRs, specific update endpoints).

---

### 🔵 LOW — No Customer-Managed KMS Key

Encryption is enabled (`encrypted = true` ✅), but no `kms_key_id` is specified. AWS will use the default `aws/ebs` key rather than a CMK, limiting rotation control and audit granularity. Specify a CMK for production.

---

### ✅ Positive Findings

- Root volume encryption enabled
- Detailed monitoring enabled (`monitoring = true`)
- Hardcoded AMI (`ami-0c55b159cbfafe1f0`) — see risk section
- Good tagging hygiene (`Environment`, `Owner`, `CostCenter`, `Project`)

---

## 2. Cost Analysis

**Estimated Monthly Cost: ~$10–12/month**

| Resource | Type | Est. Cost |
|---|---|---|
| `aws_instance.bastion` | t3.micro, On-Demand | ~$8.47/mo |
| Root EBS (20 GiB gp3) | Storage | ~$1.60/mo |
| Public IP (attached) | — | Free |
| Data transfer | SSH sessions only | ~$0–1/mo |
| **Total** | | **~$10–11/mo** |

**Rightsizing: PASS** — `t3.micro` is appropriate. Bastion hosts are not compute-intensive.

**Savings opportunities:**
- **1-yr Savings Plan** → ~30–40% reduction (~$2.50–3.50/mo saved) if long-lived
- **Scheduled stop/start** (off-hours) → ~65% reduction in instance-hours
- **SSM Session Manager** → eliminates the EC2 cost entirely (strongest combined cost + security win)

---

## 3. Risk Assessment

| Risk | Severity | Notes |
|---|---|---|
| Key pair dependency | Medium | Private key loss = no access. Store in Secrets Manager / Vault. |
| Hardcoded AMI ID | Medium | Region-specific, becomes outdated. Use `aws_ami` data source instead. |
| No `iam_instance_profile` | Low | Fine for pure SSH bastion. Required if SSM Agent access is adopted. |
| Blast radius | Low | Only 2 resources; does not directly affect app infrastructure. |

**Compliance violations (if applicable):**
- **CIS AWS Foundations 5.2** — Ensure no SG allows `0.0.0.0/0` ingress on port 22: ❌ **VIOLATED**
- **SOC 2 CC6.6 / PCI-DSS Req. 1.3** — Least-privilege network access: ❌ **VIOLATED** (confirmed `Environment = "production"`)

---

## 4. Required Actions Before Apply

| Priority | Action |
|---|---|
| 🔴 Required | Restrict SSH ingress to specific CIDRs **or** migrate to SSM Session Manager |
| 🔴 Required | Scope or restrict egress rules |
| 🟡 Recommended | Replace hardcoded AMI with `aws_ami` data source |
| 🟡 Recommended | Specify a CMK for root volume encryption |
| 🟡 Recommended | Evaluate whether public IP + port 22 is necessary vs. SSM/EC2 Instance Connect |

Once items 1 and 2 are resolved, this plan is likely to achieve **WARN or PASS** — cost and sizing choices are sound, and tagging hygiene is good.
