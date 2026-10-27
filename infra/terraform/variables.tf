# ============================================================================
# Khaaos Run — Terraform Variables
# ============================================================================
# Customizable variables for region, instance type, and project configuration.

# ─── Region ──────────────────────────────────────────────────────────────────
variable "region" {
  type        = string
  default     = "cn-hangzhou"
  description = "Alibaba Cloud region. cn-hangzhou has best GPU availability in China."
}

# ─── Instance Configuration ──────────────────────────────────────────────────
variable "instance_name" {
  type        = string
  default     = "khaaos-run-gpu-validator"
  description = "ECS instance name for the GPU validator."
}

# vgn6i family: NVIDIA T4 Virtual GPU — ideal for headless UE5 rendering
# Alternatives:
#   ecs.vgn6i-m4.xlarge   — T4 vGPU, 4 vCPU, 16GB RAM  (~¥5.8/hr)
#   ecs.vgn6i-m8.2xlarge  — T4 vGPU, 8 vCPU, 32GB RAM  (~¥11.6/hr)
#   ecs.gn7i-c16g1-4      — A10 GPU,  16 vCPU, 60GB RAM (~¥15.8/hr) [recommended]
#   ecs.gn6v-c8g1-2       — V100 GPU, 8 vCPU, 32GB RAM  (~¥28.0/hr)
variable "gpu_instance_type" {
  type        = string
  default     = "ecs.vgn6i-m4.xlarge"
  description = "ECS GPU instance type. vgn6i = NVIDIA T4 vGPU (cost-effective for headless rendering)."
}

# ─── Disk ─────────────────────────────────────────────────────────────────────
variable "system_disk_size" {
  type        = number
  default     = 100
  description = "System disk size in GB. Minimum 100GB for UE5 Editor + shaders + dependencies."
}

variable "system_disk_category" {
  type        = string
  default     = "cloud_essd"
  description = "Disk category. cloud_essd = Enhanced SSD (best IOPS for UE5 compilation)."
}

# ─── Network ─────────────────────────────────────────────────────────────────
variable "vpc_cidr" {
  type        = string
  default     = "172.16.0.0/12"
  description = "VPC CIDR block."
}

variable "vswitch_cidr" {
  type        = string
  default     = "172.16.1.0/24"
  description = "VSwitch CIDR block."
}

variable "internet_bandwidth" {
  type        = number
  default     = 5
  description = "Internet max bandwidth out (Mbps). 5 Mbps for SSH + asset download."
}

# ─── Tags ────────────────────────────────────────────────────────────────────
variable "environment" {
  type        = string
  default     = "Staging-Validation"
  description = "Environment tag for resource organization."
}

variable "project" {
  type        = string
  default     = "KhaaosRun-PhD"
  description = "Project tag."
}
