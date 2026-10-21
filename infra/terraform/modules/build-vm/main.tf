# Khaaos Run — UE5.8 Build VM (GPU-enabled)
# Provisions an AWS EC2 instance with NVIDIA GPU for UE5 compilation
# Requirements: AWS CLI configured, Terraform >= 1.6

terraform {
  required_version = ">= 1.6.0"
}

variable "aws_region" {
  description = "AWS region for build VM"
  type        = string
  default     = "sa-east-1"
}

variable "instance_type" {
  description = "EC2 instance type (GPU-enabled for UE5 Editor, compute for headless build)"
  type        = string
  default     = "g5.2xlarge"  # NVIDIA A10G, 8 vCPU, 32GB RAM, 600GB NVMe
}

variable "build_mode" {
  description = "Build mode: 'editor' (full UE5 Editor + GPU) or 'headless' (dedicated server build only)"
  type        = string
  default     = "headless"
}

variable "key_name" {
  description = "SSH key pair name for instance access"
  type        = string
}

variable "project_version" {
  description = "Khaaos Run version tag to build"
  type        = string
  default     = "0.1.0"
}

# Data sources
data "aws_ami" "ue5_base" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["amzn2-ami-hvm-*-x86_64-gp2"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

data "aws_caller_identity" "current" {}

# Security Group — minimal access
resource "aws_security_group" "ue5_build" {
  name_prefix = "khaaos-ue5-build-"
  description = "Security group for Khaaos Run UE5 build VM"
  vpc_id      = data.aws_ami.ue5_base.id != "" ? null : null  # default VPC

  # SSH access from anywhere (restrict in production)
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # UE5 Dedicated Server port
  ingress {
    from_port   = 7777
    to_port     = 7777
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # UE5 Beacon port
  ingress {
    from_port   = 15000
    to_port     = 15000
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # All outbound
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name    = "khaaos-ue5-build-sg"
    Project = "KhaaosRun"
  }
}

# IAM role for S3 artifact storage
resource "aws_iam_role" "build_role" {
  name = "khaaos-ue5-build-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ec2.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy" "build_policy" {
  name = "khaaos-ue5-build-policy"
  role = aws_iam_role.build_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = [
          "arn:aws:s3:::khaaos-build-artifacts",
          "arn:aws:s3:::khaaos-build-artifacts/*"
        ]
      },
      {
        Effect = "Allow"
        Action = ["ecr:GetDownloadUrlForLayer", "ecr:BatchGetImage", "ecr:PutImage"]
        Resource = ["*"]
      }
    ]
  })
}

resource "aws_iam_instance_profile" "build_profile" {
  name = "khaaos-ue5-build-profile"
  role = aws_iam_role.build_role.name
}

# S3 bucket for build artifacts
resource "aws_s3_bucket" "build_artifacts" {
  bucket = "khaaos-build-artifacts"

  tags = {
    Name    = "khaaos-build-artifacts"
    Project = "KhaaosRun"
  }
}

resource "aws_s3_bucket_versioning" "build_artifacts" {
  bucket = aws_s3_bucket.build_artifacts.id
  versioning_configuration {
    status = "Enabled"
  }
}

# Build VM Instance
resource "aws_instance" "ue5_build" {
  ami           = data.aws_ami.ue5_base.id
  instance_type = var.instance_type
  key_name      = var.key_name

  iam_instance_profile = aws_iam_instance_profile.build_profile.name
  security_groups      = [aws_security_group.ue5_build.name]

  root_block_device {
    volume_type = "gp3"
    volume_size = 200  # UE5 SDK ~50GB + build artifacts ~30GB + OS
    iops        = 3000
    throughput  = 125
  }

  user_data = templatefile("${path.module}/user-data.sh.tpl", {
    build_mode       = var.build_mode
    project_version  = var.project_version
    s3_bucket        = aws_s3_bucket.build_artifacts.bucket
  })

  tags = {
    Name       = "khaaos-ue5-build-vm"
    Project    = "KhaaosRun"
    BuildMode  = var.build_mode
    Version    = var.project_version
  }
}

# Outputs
output "instance_id" {
  value = aws_instance.ue5_build.id
}

output "public_ip" {
  value = aws_instance.ue5_build.public_ip
}

output "public_dns" {
  value = aws_instance.ue5_build.public_dns
}

output "s3_bucket" {
  value = aws_s3_bucket.build_artifacts.bucket
}
