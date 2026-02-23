# Product Requirements Document: HealthCheck API Gateway

## 1. Vision & Purpose

Engineering teams at ACME Corp operate 40+ microservices across three environments (dev, staging, production). When incidents occur, the first step is always "which services are healthy?" -- and the answer requires manually curling each service's health endpoint, checking dashboards, and piecing together a picture from multiple sources.

**HealthCheck API Gateway** is an internal API and dashboard that aggregates health status from all registered services, providing a single endpoint to query overall system health, individual service health, and dependency health (databases, caches, message queues). It replaces the manual "is everything up?" investigation with a single API call or dashboard view.

### Why Now

- ACME's microservices count has doubled in the last year, making manual health checks impractical.
- Mean time to detect (MTTD) has increased from 2 minutes to 8 minutes as the service count grew.
- On-call engineers spend the first 10 minutes of every incident figuring out what is actually broken.
- SOC 2 audit requires documented evidence of system health monitoring.

## 2. Target Users / Personas

### Primary: On-Call Engineer (Jordan)
- Needs to quickly determine which services are healthy during an incident
- Wants a single API endpoint that answers "is the system healthy?"
- Needs drill-down into individual service health and dependency status

### Secondary: Engineering Manager (Sarah)
- Wants a dashboard showing overall system health trends over time
- Needs weekly reports on service reliability (uptime percentages)

### Tertiary: CI/CD Pipeline
- Post-deployment health verification (smoke test)
- Automated rollback trigger if health checks fail after deployment

## 3. Functional Requirements

### Theme: Service Registration

#### FR-1: Service Registry
Services register themselves with the health check gateway via a simple API call or configuration file.

**Acceptance Criteria:**
- Services register with: name, health endpoint URL, expected response, check interval, team owner
- Registration via REST API (POST /api/services)
- Registration via YAML configuration file (for GitOps workflows)
- Duplicate service names are rejected with a clear error message
- Services can update their registration (PUT /api/services/:id)
- Services can be deregistered (DELETE /api/services/:id)

#### FR-2: Health Check Execution
The gateway periodically polls each registered service's health endpoint.

**Acceptance Criteria:**
- Configurable check interval per service (default: 30 seconds, range: 10s-5m)
- HTTP GET to the registered health endpoint
- Timeout: configurable per service (default: 5 seconds)
- Response validation: HTTP status code (200 = healthy) and optional body matching
- Retries: 1 retry with exponential backoff before marking unhealthy
- Records response time for latency tracking

### Theme: Health Aggregation

#### FR-3: Aggregated Health Endpoint
A single API endpoint returns the health status of all registered services.

**Acceptance Criteria:**
- GET /api/health returns overall status (healthy, degraded, unhealthy)
- Overall status is "healthy" when all services are healthy
- Overall status is "degraded" when any non-critical service is unhealthy
- Overall status is "unhealthy" when any critical service is unhealthy
- Response includes per-service status, last check time, and response latency
- Supports filtering by team, environment, and criticality

#### FR-4: Individual Service Health
Detailed health information for a single service.

**Acceptance Criteria:**
- GET /api/health/:serviceName returns detailed service status
- Includes: current status, last 10 check results, average response time, uptime percentage (24h, 7d, 30d)
- Includes dependency health if the service reports dependencies in its health response

### Theme: Alerting

#### FR-5: Status Change Notifications
Notify when a service transitions between healthy and unhealthy states.

**Acceptance Criteria:**
- Webhook notifications on state transitions (healthy -> unhealthy, unhealthy -> healthy)
- Configurable notification channels per service (Slack webhook, PagerDuty, email)
- Debounce: require 2 consecutive failures before alerting (configurable)
- Recovery notifications include downtime duration

## 4. Non-Functional Requirements

### Performance
- Health aggregation endpoint responds within 200ms for up to 100 registered services
- Gateway should not add more than 1% CPU overhead on monitored services

### Security
- API authentication via API keys
- Service registration requires admin-level API key
- Health query endpoints require read-level API key
- All communication over HTTPS

### Reliability
- Gateway itself must have 99.9% uptime
- Health check data persisted to survive gateway restarts
- Graceful handling of unresponsive services (timeout, don't hang)

### Scalability
- Support up to 200 registered services
- Store 30 days of health check history

## 5. Out of Scope

- **Distributed tracing** -- Use Jaeger/Zipkin for tracing, not this tool
- **Log aggregation** -- Use ELK/Datadog for logs
- **Metrics collection** -- Use Prometheus/Grafana for detailed metrics
- **Service mesh integration** -- Future consideration
- **Public-facing status page** -- MVP is internal only

## 6. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| MTTD reduction | From 8 minutes to < 2 minutes | Incident post-mortems |
| Health check adoption | 90% of services registered within 1 month | Service registry count |
| Dashboard usage | 80% of on-call engineers use it during incidents | Access logs |
| False positive rate | < 5% of alerts are false positives | Alert review |

## 7. Assumptions & Constraints

### Assumptions
- All services expose a `/health` or `/healthz` endpoint
- Internal network allows the gateway to reach all service health endpoints
- PostgreSQL available for health check data storage

### Constraints
- Must be deployable as a Docker container
- Must integrate with existing ACME Kubernetes cluster
- Timeline: 6-week MVP
- Team: 2 backend engineers
- Tech stack: Node.js/TypeScript (aligns with team expertise)
