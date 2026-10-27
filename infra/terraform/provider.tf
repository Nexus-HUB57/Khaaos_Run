# ============================================================================
# Khaaos Run — Terraform Provider Configuration (Aliyun/Alibaba Cloud)
# ============================================================================
# Declares the official Alicloud provider and locks versions for security.
# Terraform automatically reads ALICLOUD_ACCESS_KEY and ALICLOUD_SECRET_KEY
# from environment variables.

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    alicloud = {
      source  = "aliyun/alicloud"
      version = ">= 1.210.0"
    }
  }

  # Remote state backend (optional — uncomment for team use)
  # backend "oss" {
  #   bucket = "khaaos-terraform-state"
  #   prefix = "khaaos-run/gpu-validator"
  #   key    = "terraform.tfstate"
  #   region = "cn-hangzhou"
  # }
}

provider "alicloud" {
  # Reads ALICLOUD_ACCESS_KEY and ALICLOUD_SECRET_KEY from env automatically
  region = var.region
}
