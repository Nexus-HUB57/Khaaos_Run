# ══════════════════════════════════════════════════════════════
# Khaaos Run — Terraform Outputs
# ══════════════════════════════════════════════════════════════

# ─── sa1 (Primary — São Paulo) ─────────────────────────────────
output "sa1_alb_dns" {
  description = "ALB DNS for sa1 (primary)"
  value       = module.compute_sa1.alb_dns
}

output "sa1_ecs_cluster" {
  description = "ECS cluster name for sa1"
  value       = module.compute_sa1.ecs_cluster_name
}

output "sa1_db_endpoint" {
  description = "RDS primary endpoint for sa1"
  value       = module.database_sa1.primary_endpoint
}

output "sa1_db_replica_endpoint" {
  description = "RDS read replica endpoint for sa1"
  value       = module.database_sa1.replica_endpoint
}

output "sa1_redis_endpoint" {
  description = "ElastiCache Redis endpoint for sa1"
  value       = module.database_sa1.redis_endpoint
}

output "sa1_vpc_id" {
  description = "VPC ID for sa1"
  value       = module.compute_sa1.vpc_id
}

# ─── na1 (Virginia) ────────────────────────────────────────────
output "na1_alb_dns" {
  description = "ALB DNS for na1"
  value       = module.compute_na1.alb_dns
}

output "na1_db_endpoint" {
  description = "RDS primary endpoint for na1"
  value       = module.database_na1.primary_endpoint
}

output "na1_redis_endpoint" {
  description = "ElastiCache Redis endpoint for na1"
  value       = module.database_na1.redis_endpoint
}

# ─── eu1 (Frankfurt) ───────────────────────────────────────────
output "eu1_alb_dns" {
  description = "ALB DNS for eu1"
  value       = module.compute_eu1.alb_dns
}

output "eu1_db_endpoint" {
  description = "RDS primary endpoint for eu1"
  value       = module.database_eu1.primary_endpoint
}

output "eu1_redis_endpoint" {
  description = "ElastiCache Redis endpoint for eu1"
  value       = module.database_eu1.redis_endpoint
}

# ─── DNS ───────────────────────────────────────────────────────
output "cdn_domain" {
  description = "Cloudflare CDN domain"
  value       = cloudflare_record.api.hostname
}

# ─── Monitoring ────────────────────────────────────────────────
output "grafana_url" {
  description = "Grafana dashboard URL"
  value       = "https://grafana.khaaos.run"
}

output "prometheus_url" {
  description = "Prometheus URL"
  value       = "https://prometheus.khaaos.run"
}
