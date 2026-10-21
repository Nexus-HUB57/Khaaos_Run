# ══════════════════════════════════════════════════════════════
# Khaaos Run — Terraform Variables
# Multi-region production: sa1 (São Paulo), na1 (Virginia), eu1 (Frankfurt)
# ══════════════════════════════════════════════════════════════

# ─── Cloudflare ─────────────────────────────────────────────────
variable "cloudflare_api_token" {
  description = "Cloudflare API token for DNS/CDN management"
  type        = string
  sensitive   = true
}

variable "cloudflare_zone_id" {
  description = "Cloudflare Zone ID for khaaos.run"
  type        = string
}

# ─── Docker / ECS ──────────────────────────────────────────────
variable "ecs_image_tag" {
  description = "Docker image tag for ECS deployment"
  type        = string
  default     = "latest"
}

variable "economy_api_image" {
  description = "Economy API Docker image URI (ECR)"
  type        = string
  default     = "khaaos-run/economy-api"
}

# ─── Database ──────────────────────────────────────────────────
variable "db_password" {
  description = "PostgreSQL master password"
  type        = string
  sensitive   = true
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.r6g.large"
}

# ─── Redis / ElastiCache ───────────────────────────────────────
variable "redis_node_type" {
  description = "ElastiCache Redis node type"
  type        = string
  default     = "cache.r6g.large"
}

# ─── JWT / Auth ────────────────────────────────────────────────
variable "jwt_secret" {
  description = "JWT signing secret"
  type        = string
  sensitive   = true
}

# ─── EOS (Epic Online Services) ────────────────────────────────
variable "eos_product_id" {
  description = "EOS Product ID from Epic Dev Portal"
  type        = string
  sensitive   = true
}

variable "eos_sandbox_id" {
  description = "EOS Sandbox ID"
  type        = string
  sensitive   = true
}

variable "eos_deployment_id" {
  description = "EOS Deployment ID"
  type        = string
  sensitive   = true
}

variable "eos_client_id" {
  description = "EOS Client ID"
  type        = string
  sensitive   = true
}

variable "eos_client_secret" {
  description = "EOS Client Secret"
  type        = string
  sensitive   = true
}

# ─── Networking (per region) ───────────────────────────────────
variable "vpc_cidr_sa1" {
  description = "VPC CIDR for sa1 (São Paulo)"
  type        = string
  default     = "10.0.0.0/16"
}

variable "vpc_cidr_na1" {
  description = "VPC CIDR for na1 (Virginia)"
  type        = string
  default     = "10.1.0.0/16"
}

variable "vpc_cidr_eu1" {
  description = "VPC CIDR for eu1 (Frankfurt)"
  type        = string
  default     = "10.2.0.0/16"
}

# ─── UE5 Dedicated Server ──────────────────────────────────────
variable "game_server_instance_type" {
  description = "EC2 instance type for UE5 dedicated server"
  type        = string
  default     = "c6i.2xlarge"
}

variable "max_game_servers_per_region" {
  description = "Maximum game server instances per region"
  type        = number
  default     = 10
}

# ─── Monitoring ────────────────────────────────────────────────
variable "grafana_admin_password" {
  description = "Grafana admin password"
  type        = string
  sensitive   = true
}

variable "slack_webhook_url" {
  description = "Slack webhook URL for AlertManager notifications"
  type        = string
  sensitive   = true
  default     = ""
}

variable "discord_webhook_url" {
  description = "Discord webhook URL for AlertManager notifications"
  type        = string
  sensitive   = true
  default     = ""
}
