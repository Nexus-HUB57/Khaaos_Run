# ============================================================================
# Khaaos Run — Main Infrastructure (Terraform IaC)
# ============================================================================
# Provisions the complete GPU validation environment on Alibaba Cloud:
#   1. Dynamic zone discovery for GPU instance availability
#   2. Ubuntu 22.04 LTS image
#   3. Dedicated VPC + VSwitch
#   4. Security Group (SSH + Pixel Streaming + HTTPS)
#   5. ECS GPU instance with automated bootstrap injection

# ─── 1. Dynamic Zone Discovery ───────────────────────────────────────────────
# Find zones that support the requested GPU instance type
data "alicloud_zones" "gpu_zones" {
  available_instance_type = var.gpu_instance_type
  enable_details          = true
}

# ─── 2. Ubuntu 22.04 LTS Image ──────────────────────────────────────────────
data "alicloud_images" "ubuntu" {
  name_regex  = "^ubuntu_22_04"
  owners      = "system"
  most_recent = true
}

# ─── 3. VPC (Virtual Private Cloud) ──────────────────────────────────────────
resource "alicloud_vpc" "khaaos_vpc" {
  vpc_name   = "khaaos-run-vpc"
  cidr_block = var.vpc_cidr

  tags = {
    Environment = var.environment
    Project     = var.project
    ManagedBy   = "Terraform"
  }
}

# ─── 4. VSwitch (Subnet) ────────────────────────────────────────────────────
resource "alicloud_vswitch" "khaaos_switch" {
  vswitch_name = "khaaos-gpu-switch"
  vpc_id       = alicloud_vpc.khaaos_vpc.id
  cidr_block   = var.vswitch_cidr
  zone_id      = data.alicloud_zones.gpu_zones.zones[0].id

  tags = {
    Environment = var.environment
    Project     = var.project
    ManagedBy   = "Terraform"
  }
}

# ─── 5. Security Group ──────────────────────────────────────────────────────
resource "alicloud_security_group" "khaaos_sg" {
  security_group_name = "khaaos-gpu-sg"
  vpc_id              = alicloud_vpc.khaaos_vpc.id

  tags = {
    Environment = var.environment
    Project     = var.project
    ManagedBy   = "Terraform"
  }
}

# SSH Access (Port 22)
resource "alicloud_security_group_rule" "allow_ssh" {
  type              = "ingress"
  ip_protocol       = "tcp"
  nic_type          = "intranet"
  policy            = "accept"
  port_range        = "22/22"
  priority          = 1
  security_group_id = alicloud_security_group.khaaos_sg.id
  cidr_ip           = "0.0.0.0/0"
}

# HTTP / Pixel Streaming Signaling (Port 80)
resource "alicloud_security_group_rule" "allow_pixel_streaming_http" {
  type              = "ingress"
  ip_protocol       = "tcp"
  nic_type          = "intranet"
  policy            = "accept"
  port_range        = "80/80"
  priority          = 2
  security_group_id = alicloud_security_group.khaaos_sg.id
  cidr_ip           = "0.0.0.0/0"
}

# HTTPS / Pixel Streaming Secure (Port 443)
resource "alicloud_security_group_rule" "allow_https" {
  type              = "ingress"
  ip_protocol       = "tcp"
  nic_type          = "intranet"
  policy            = "accept"
  port_range        = "443/443"
  priority          = 3
  security_group_id = alicloud_security_group.khaaos_sg.id
  cidr_ip           = "0.0.0.0/0"
}

# Pixel Streaming WebRTC (Port 8888)
resource "alicloud_security_group_rule" "allow_pixel_streaming_webrtc" {
  type              = "ingress"
  ip_protocol       = "tcp"
  nic_type          = "intranet"
  policy            = "accept"
  port_range        = "8888/8888"
  priority          = 4
  security_group_id = alicloud_security_group.khaaos_sg.id
  cidr_ip           = "0.0.0.0/0"
}

# UE5 Editor Instance Connection (Port 8123 — Pixel Streaming default)
resource "alicloud_security_group_rule" "allow_ue5_pixel_stream" {
  type              = "ingress"
  ip_protocol       = "tcp"
  nic_type          = "intranet"
  policy            = "accept"
  port_range        = "8123/8123"
  priority          = 5
  security_group_id = alicloud_security_group.khaaos_sg.id
  cidr_ip           = "0.0.0.0/0"
}

# ─── 6. ECS GPU Instance ────────────────────────────────────────────────────
resource "alicloud_instance" "gpu_validator" {
  availability_zone = data.alicloud_zones.gpu_zones.zones[0].id
  instance_name     = var.instance_name
  security_groups   = [alicloud_security_group.khaaos_sg.id]
  instance_type     = var.gpu_instance_type

  # Disk configuration
  system_disk_category = var.system_disk_category
  system_disk_size     = var.system_disk_size

  # Image: Ubuntu 22.04 LTS
  image_id = data.alicloud_images.ubuntu.images[0].id

  # Network
  vswitch_id                 = alicloud_vswitch.khaaos_switch.id
  internet_max_bandwidth_out = var.internet_bandwidth
  internet_charge_type       = "PayByTraffic"

  # ─── Cloud-Init: Automated Bootstrap Injection ─────────────────────────
  # The gpu_machine_bootstrap.sh script runs automatically on first boot.
  # It installs NVIDIA drivers, Xorg virtual framebuffer, UE5.8 Editor,
  # compiles KhaaosRun project, and runs visual validation.
  user_data = file("${path.module}/gpu_machine_bootstrap.sh")

  tags = {
    Environment = var.environment
    Project     = var.project
    ManagedBy   = "Terraform"
    GPU         = "NVIDIA-T4-vGPU"
    Purpose     = "UE5-Visual-Validation"
  }
}

# ─── 7. Elastic IP (Optional — for stable public IP) ───────────────────────
resource "alicloud_eip" "gpu_validator_eip" {
  bandwidth = var.internet_bandwidth

  tags = {
    Environment = var.environment
    Project     = var.project
    ManagedBy   = "Terraform"
  }
}

resource "alicloud_eip_association" "gpu_validator_eip_assoc" {
  allocation_id = alicloud_eip.gpu_validator_eip.id
  instance_id   = alicloud_instance.gpu_validator.id
}
