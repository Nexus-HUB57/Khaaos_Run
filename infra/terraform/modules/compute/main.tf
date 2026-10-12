# ══════════════════════════════════════════════════════════════
# Khaaos Run — Networking & Compute (per region)
# VPC, Subnets, Security Groups, ECS Fargate, ALB
# ══════════════════════════════════════════════════════════════

# ─── VPC ────────────────────────────────────────────────────────
resource "aws_vpc" "khaaos" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = merge(local.common_tags, {
    Name = "${local.project}-${var.region_key}-vpc"
  })
}

resource "aws_internet_gateway" "khaaos" {
  vpc_id = aws_vpc.khaaos.id

  tags = merge(local.common_tags, {
    Name = "${local.project}-${var.region_key}-igw"
  })
}

# ─── Subnets ───────────────────────────────────────────────────
resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.khaaos.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 4, count.index)
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true

  tags = merge(local.common_tags, {
    Name = "${local.project}-${var.region_key}-public-${count.index}"
    Tier = "public"
  })
}

resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.khaaos.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, count.index + 2)
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = merge(local.common_tags, {
    Name = "${local.project}-${var.region_key}-private-${count.index}"
    Tier = "private"
  })
}

resource "aws_subnet" "database" {
  count             = 2
  vpc_id            = aws_vpc.khaaos.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, count.index + 4)
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = merge(local.common_tags, {
    Name = "${local.project}-${var.region_key}-db-${count.index}"
    Tier = "database"
  })
}

data "aws_availability_zones" "available" {
  state = "available"
}

# ─── Security Groups ───────────────────────────────────────────
resource "aws_security_group" "alb" {
  name        = "${local.project}-${var.region_key}-alb-sg"
  description = "ALB Security Group for Khaaos Run"
  vpc_id      = aws_vpc.khaaos.id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.common_tags
}

resource "aws_security_group" "ecs" {
  name        = "${local.project}-${var.region_key}-ecs-sg"
  description = "ECS Tasks Security Group"
  vpc_id      = aws_vpc.khaaos.id

  ingress {
    from_port       = 5000
    to_port         = 5000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  ingress {
    from_port       = 9090
    to_port         = 9090
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
    description     = "Prometheus metrics"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.common_tags
}

resource "aws_security_group" "game_server" {
  name        = "${local.project}-${var.region_key}-game-sg"
  description = "UE5 Dedicated Server Security Group"
  vpc_id      = aws_vpc.khaaos.id

  # UE5 game port
  ingress {
    from_port   = 7777
    to_port     = 7777
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # UE5 beacon port
  ingress {
    from_port   = 7778
    to_port     = 7778
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Steam query port
  ingress {
    from_port   = 27015
    to_port     = 27015
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # EAC port
  ingress {
    from_port   = 8577
    to_port     = 8577
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.common_tags
}

# ─── ALB (Application Load Balancer) ───────────────────────────
resource "aws_lb" "khaaos" {
  name               = "${local.project}-${var.region_key}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  enable_deletion_protection = true

  access_logs {
    bucket  = aws_s3_bucket.alb_logs.id
    prefix  = "${var.region_key}-alb"
    enabled = true
  }

  tags = local.common_tags
}

resource "aws_s3_bucket" "alb_logs" {
  bucket = "${local.project}-${var.region_key}-alb-logs"

  tags = local.common_tags
}

# ─── ECS Cluster ───────────────────────────────────────────────
resource "aws_ecs_cluster" "khaaos" {
  name = "${local.project}-${var.region_key}"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = local.common_tags
}

# ─── CloudWatch Log Group ──────────────────────────────────────
resource "aws_cloudwatch_log_group" "ecs" {
  name              = "/ecs/${local.project}-${var.region_key}"
  retention_in_days = 30

  tags = local.common_tags
}

# ─── Variables ─────────────────────────────────────────────────
variable "region_key" {
  description = "Khaaos region key (sa1, na1, eu1)"
  type        = string
}

variable "vpc_cidr" {
  description = "VPC CIDR block"
  type        = string
  default     = "10.0.0.0/16"
}

# ─── Outputs ───────────────────────────────────────────────────
output "vpc_id" {
  value = aws_vpc.khaaos.id
}

output "alb_dns" {
  value = aws_lb.khaaos.dns_name
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.khaaos.name
}

output "public_subnet_ids" {
  value = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  value = aws_subnet.private[*].id
}
