# ══════════════════════════════════════════════════════════════
# Khaaos Run — Database Module (RDS PostgreSQL)
# Multi-region read replicas for economy data
# ══════════════════════════════════════════════════════════════

# ─── DB Subnet Group ────────────────────────────────────────────
resource "aws_db_subnet_group" "khaaos" {
  name       = "${local.project}-${var.region_key}-db-subnet"
  subnet_ids = var.database_subnet_ids

  tags = local.common_tags
}

# ─── Primary PostgreSQL Instance ───────────────────────────────
resource "aws_db_instance" "primary" {
  identifier     = "${local.project}-${var.region_key}-db"
  engine         = "postgres"
  engine_version = "16.1"
  instance_class = var.instance_class

  allocated_storage     = 100
  max_allocated_storage = 500
  storage_type         = "gp3"
  storage_encrypted    = true

  db_name  = "khaaos_run"
  username = "khaaos"
  password = var.db_password

  vpc_security_group_ids = [aws_security_group.db.id]
  db_subnet_group_name   = aws_db_subnet_group.khaaos.name

  multi_az               = true
  backup_retention_period = 30
  backup_window           = "03:00-04:00"
  maintenance_window      = "Mon:04:00-Mon:05:00"

  deletion_protection      = true
  skip_final_snapshot      = false
  final_snapshot_identifier = "${local.project}-${var.region_key}-final"

  performance_insights_enabled          = true
  performance_insights_retention_period = 7

  tags = merge(local.common_tags, {
    Name = "${local.project}-${var.region_key}-db-primary"
  })
}

# ─── Read Replica (for economy queries) ────────────────────────
resource "aws_db_instance" "replica" {
  count                     = var.enable_read_replica ? 1 : 0
  identifier                = "${local.project}-${var.region_key}-db-replica"
  replicate_source_db       = aws_db_instance.primary.identifier
  instance_class            = var.instance_class
  vpc_security_group_ids    = [aws_security_group.db.id]
  db_subnet_group_name      = aws_db_subnet_group.khaaos.name
  storage_encrypted         = true
  deletion_protection       = true
  skip_final_snapshot       = false
  final_snapshot_identifier = "${local.project}-${var.region_key}-replica-final"

  performance_insights_enabled          = true
  performance_insights_retention_period = 7

  tags = merge(local.common_tags, {
    Name = "${local.project}-${var.region_key}-db-replica"
  })
}

# ─── Security Group ────────────────────────────────────────────
resource "aws_security_group" "db" {
  name        = "${local.project}-${var.region_key}-db-sg"
  description = "Database Security Group"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [var.ecs_security_group_id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.common_tags
}

# ─── ElastiCache Redis ─────────────────────────────────────────
resource "aws_elasticache_subnet_group" "khaaos" {
  name       = "${local.project}-${var.region_key}-redis-subnet"
  subnet_ids = var.private_subnet_ids
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id          = "${local.project}-${var.region_key}-redis"
  replication_group_description = "Redis cluster for ${var.region_key}"
  engine                        = "redis"
  engine_version                = "7.2"
  node_type                     = "cache.r6g.large"
  number_cache_clusters         = 2
  automatic_failover_enabled    = true
  multi_az_enabled             = true

  subnet_group_name  = aws_elasticache_subnet_group.khaaos.name
  security_group_ids = [aws_security_group.redis.id]

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true

  parameter_group_name = "default.redis7"

  snapshot_retention_limit = 7
  snapshot_window         = "03:00-05:00"

  tags = local.common_tags
}

resource "aws_security_group" "redis" {
  name        = "${local.project}-${var.region_key}-redis-sg"
  description = "Redis Security Group"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [var.ecs_security_group_id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.common_tags
}

# ─── Variables ─────────────────────────────────────────────────
variable "region_key" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "database_subnet_ids" {
  type = list(string)
}

variable "private_subnet_ids" {
  type = list(string)
}

variable "ecs_security_group_id" {
  type = string
}

variable "db_password" {
  type      = string
  sensitive = true
}

variable "instance_class" {
  type    = string
  default = "db.r6g.large"
}

variable "enable_read_replica" {
  type    = bool
  default = true
}

# ─── Outputs ───────────────────────────────────────────────────
output "primary_endpoint" {
  value = aws_db_instance.primary.endpoint
}

output "replica_endpoint" {
  value = var.enable_read_replica ? aws_db_instance.replica[0].endpoint : null
}

output "redis_endpoint" {
  value = aws_elasticache_replication_group.redis.primary_endpoint_address
}
