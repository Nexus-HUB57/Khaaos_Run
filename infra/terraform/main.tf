# ══════════════════════════════════════════════════════════════
# Khaaos Run — Terraform Infrastructure
# Multi-region production deployment: sa1 (São Paulo), na1 (Virginia), eu1 (Frankfurt)
# Fase 3-5: Infrastructure as Code
# ══════════════════════════════════════════════════════════════

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.40"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.20"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }

  # Remote state in S3 + DynamoDB locking
  backend "s3" {
    bucket         = "khaaos-terraform-state"
    key            = "production/terraform.tfstate"
    region         = "sa-east-1"
    encrypt        = true
    dynamodb_table = "khaaos-terraform-locks"
  }
}

# ─── Local Values ──────────────────────────────────────────────
locals {
  project     = "khaaos-run"
  environment = "production"
  owner       = "nexus-hub57"

  common_tags = {
    Project     = local.project
    Environment = local.environment
    Owner       = local.owner
    ManagedBy   = "terraform"
  }

  # Region mapping: Khaaos → AWS
  region_map = {
    sa1 = "sa-east-1"   # São Paulo
    na1 = "us-east-1"   # Virginia
    eu1 = "eu-central-1" # Frankfurt
  }
}

# ─── AWS Providers (Multi-Region) ──────────────────────────────
# Default provider: sa1 (primary)
provider "aws" {
  region = "sa-east-1"

  default_tags {
    tags = local.common_tags
  }
}

# na1 region provider
provider "aws" {
  alias  = "na1"
  region = "us-east-1"

  default_tags {
    tags = merge(local.common_tags, { Region = "na1" })
  }
}

# eu1 region provider
provider "aws" {
  alias  = "eu1"
  region = "eu-central-1"

  default_tags {
    tags = merge(local.common_tags, { Region = "eu1" })
  }
}

# ─── Cloudflare Provider ───────────────────────────────────────
provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

# ─── Variables ─────────────────────────────────────────────────
variable "cloudflare_api_token" {
  description = "Cloudflare API token for DNS/CDN management"
  type        = string
  sensitive   = true
}

variable "cloudflare_zone_id" {
  description = "Cloudflare Zone ID for khaaos.run"
  type        = string
}

variable "ecs_image_tag" {
  description = "Docker image tag for ECS deployment"
  type        = string
  default     = "latest"
}

variable "db_password" {
  description = "PostgreSQL master password"
  type        = string
  sensitive   = true
}

variable "jwt_secret" {
  description = "JWT signing secret"
  type        = string
  sensitive   = true
}

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
