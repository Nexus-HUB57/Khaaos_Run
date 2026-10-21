# ══════════════════════════════════════════════════════════════
# Khaaos Run — Terraform Infrastructure
# Multi-region production deployment: sa1 (São Paulo), na1 (Virginia), eu1 (Frankfurt)
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

  region_map = {
    sa1 = "sa-east-1"
    na1 = "us-east-1"
    eu1 = "eu-central-1"
  }
}

# ─── AWS Providers (Multi-Region) ──────────────────────────────
provider "aws" {
  region = "sa-east-1"
  default_tags { tags = local.common_tags }
}

provider "aws" {
  alias  = "na1"
  region = "us-east-1"
  default_tags { tags = merge(local.common_tags, { Region = "na1" }) }
}

provider "aws" {
  alias  = "eu1"
  region = "eu-central-1"
  default_tags { tags = merge(local.common_tags, { Region = "eu1" }) }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

# ═══════════════════════════════════════════════════════════════
# MODULE CALLS — 3 Regions
# ═══════════════════════════════════════════════════════════════

# ─── sa1 (Primary Region — São Paulo) ─────────────────────────
module "compute_sa1" {
  source    = "./modules/compute"
  region_key = "sa1"
  vpc_cidr  = var.vpc_cidr_sa1

  providers = { aws = aws }
}

module "database_sa1" {
  source               = "./modules/database"
  region_key           = "sa1"
  vpc_id               = module.compute_sa1.vpc_id
  database_subnet_ids  = module.compute_sa1.database_subnet_ids
  private_subnet_ids   = module.compute_sa1.private_subnet_ids
  ecs_security_group_id = module.compute_sa1.ecs_security_group_id
  db_password           = var.db_password
  instance_class        = var.db_instance_class
  enable_read_replica   = true

  providers = { aws = aws }
}

module "monitoring_sa1" {
  source      = "./modules/monitoring"
  region_key  = "sa1"
  vpc_id      = module.compute_sa1.vpc_id
  subnet_ids  = module.compute_sa1.private_subnet_ids
  grafana_password = var.grafana_admin_password

  providers = { aws = aws }
}

module "build_vm_sa1" {
  source      = "./modules/build-vm"
  region_key  = "sa1"
  vpc_id      = module.compute_sa1.vpc_id
  subnet_id   = module.compute_sa1.private_subnet_ids[0]
  instance_type = var.game_server_instance_type

  providers = { aws = aws }
}

# ─── na1 (Virginia) ────────────────────────────────────────────
module "compute_na1" {
  source    = "./modules/compute"
  region_key = "na1"
  vpc_cidr  = var.vpc_cidr_na1

  providers = { aws = aws.na1 }
}

module "database_na1" {
  source               = "./modules/database"
  region_key           = "na1"
  vpc_id               = module.compute_na1.vpc_id
  database_subnet_ids  = module.compute_na1.database_subnet_ids
  private_subnet_ids   = module.compute_na1.private_subnet_ids
  ecs_security_group_id = module.compute_na1.ecs_security_group_id
  db_password           = var.db_password
  instance_class        = var.db_instance_class
  enable_read_replica   = true

  providers = { aws = aws.na1 }
}

# ─── eu1 (Frankfurt) ───────────────────────────────────────────
module "compute_eu1" {
  source    = "./modules/compute"
  region_key = "eu1"
  vpc_cidr  = var.vpc_cidr_eu1

  providers = { aws = aws.eu1 }
}

module "database_eu1" {
  source               = "./modules/database"
  region_key           = "eu1"
  vpc_id               = module.compute_eu1.vpc_id
  database_subnet_ids  = module.compute_eu1.database_subnet_ids
  private_subnet_ids   = module.compute_eu1.private_subnet_ids
  ecs_security_group_id = module.compute_eu1.ecs_security_group_id
  db_password           = var.db_password
  instance_class        = var.db_instance_class
  enable_read_replica   = true

  providers = { aws = aws.eu1 }
}

# ═══════════════════════════════════════════════════════════════
# ECS Task Definition — Economy API (sa1 primary)
# ═══════════════════════════════════════════════════════════════

resource "aws_ecs_task_definition" "economy_api" {
  family                   = "khaaos-economy-api"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 512
  memory                   = 1024

  container_definitions = jsonencode([
    {
      name      = "economy-api"
      image     = "${var.economy_api_image}:${var.ecs_image_tag}"
      essential = true

      portMappings = [
        { containerPort = 5000, hostPort = 5000, protocol = "tcp" }
      ]

      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "PORT", value = "5000" },
        { name = "DB_HOST", value = module.database_sa1.primary_endpoint },
        { name = "DB_NAME", value = "khaaos_run" },
        { name = "DB_USER", value = "khaaos" },
        { name = "REDIS_HOST", value = module.database_sa1.redis_endpoint },
        { name = "KRC_SUPPLY_CAP", value = "1000000000" },
        { name = "EOS_PRODUCT_ID", value = var.eos_product_id },
        { name = "EOS_SANDBOX_ID", value = var.eos_sandbox_id },
        { name = "EOS_DEPLOYMENT_ID", value = var.eos_deployment_id }
      ]

      secrets = [
        { name = "DB_PASSWORD", valueFrom = "arn:aws:secretsmanager:sa-east-1:account:secret:khaaos/db-password" },
        { name = "JWT_SECRET", valueFrom = "arn:aws:secretsmanager:sa-east-1:account:secret:khaaos/jwt-secret" },
        { name = "EOS_CLIENT_ID", valueFrom = "arn:aws:secretsmanager:sa-east-1:account:secret:khaaos/eos-client-id" },
        { name = "EOS_CLIENT_SECRET", valueFrom = "arn:aws:secretsmanager:sa-east-1:account:secret:khaaos/eos-client-secret" }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = "/ecs/khaaos-run-sa1"
          "awslogs-region"        = "sa-east-1"
          "awslogs-stream-prefix" = "economy-api"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:5000/api/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
    }
  ])

  tags = local.common_tags
}

# ─── ECS Service ──────────────────────────────────────────────
resource "aws_ecs_service" "economy_api" {
  name            = "khaaos-economy-api"
  cluster         = module.compute_sa1.ecs_cluster_name
  task_definition = aws_ecs_task_definition.economy_api.arn
  desired_count   = 2
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = module.compute_sa1.private_subnet_ids
    security_groups = [module.compute_sa1.ecs_security_group_id]
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.economy_api.arn
    container_name   = "economy-api"
    container_port   = 5000
  }

  tags = local.common_tags
}

# ─── ALB Target Group + Listener ──────────────────────────────
resource "aws_lb_target_group" "economy_api" {
  name        = "khaaos-economy-api-tg"
  port        = 5000
  protocol    = "HTTP"
  vpc_id      = module.compute_sa1.vpc_id
  target_type = "ip"

  health_check {
    path                = "/api/health"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  tags = local.common_tags
}

resource "aws_lb_listener" "economy_api" {
  load_balancer_arn = module.compute_sa1.alb_arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-2022-06"
  certificate_arn   = aws_acm_certificate.api.arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.economy_api.arn
  }
}

# ─── ACM Certificate ──────────────────────────────────────────
resource "aws_acm_certificate" "api" {
  domain_name       = "api.khaaos.run"
  validation_method = "DNS"

  tags = local.common_tags
}

# ═══════════════════════════════════════════════════════════════
# Cloudflare DNS Records
# ═══════════════════════════════════════════════════════════════

resource "cloudflare_record" "api" {
  zone_id = var.cloudflare_zone_id
  name    = "api"
  type    = "CNAME"
  value   = module.compute_sa1.alb_dns
  proxied = true
}

resource "cloudflare_record" "na1" {
  zone_id = var.cloudflare_zone_id
  name    = "na1"
  type    = "CNAME"
  value   = module.compute_na1.alb_dns
  proxied = true
}

resource "cloudflare_record" "eu1" {
  zone_id = var.cloudflare_zone_id
  name    = "eu1"
  type    = "CNAME"
  value   = module.compute_eu1.alb_dns
  proxied = true
}

resource "cloudflare_record" "grafana" {
  zone_id = var.cloudflare_zone_id
  name    = "grafana"
  type    = "CNAME"
  value   = module.compute_sa1.alb_dns
  proxied = true
}
