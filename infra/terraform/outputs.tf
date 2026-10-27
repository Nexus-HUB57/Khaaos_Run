# ============================================================================
# Khaaos Run — Terraform Outputs
# ============================================================================
# Returns connection details after successful deployment.

output "public_ip" {
  description = "Public IP of the GPU instance for SSH connection."
  value       = alicloud_eip.gpu_validator_eip.ip_address
}

output "instance_id" {
  description = "ECS instance ID."
  value       = alicloud_instance.gpu_validator.id
}

output "allocated_zone" {
  description = "Alibaba Cloud zone where resources were allocated."
  value       = data.alicloud_zones.gpu_zones.zones[0].id
}

output "instance_type" {
  description = "ECS instance type (GPU family)."
  value       = var.gpu_instance_type
}

output "ssh_command" {
  description = "Ready-to-use SSH command to connect to the GPU instance."
  value       = "ssh root@${alicloud_eip.gpu_validator_eip.ip_address}"
}

output "bootstrap_log" {
  description = "Path to the bootstrap log file on the instance."
  value       = "/var/log/khaaos_gpu_bootstrap.log"
}

output "pixel_streaming_url" {
  description = "URL for Pixel Streaming access (once UE5 Editor is running)."
  value       = "http://${alicloud_eip.gpu_validator_eip.ip_address}:8888"
}

output "next_steps" {
  description = "Post-deployment instructions."
  value       = <<-EOT
    1. SSH into the instance: ssh root@${alicloud_eip.gpu_validator_eip.ip_address}
    2. Monitor bootstrap: tail -f /var/log/khaaos_gpu_bootstrap.log
    3. Check GPU: nvidia-smi
    4. Once UE5 Editor is running, access Pixel Streaming at:
       http://${alicloud_eip.gpu_validator_eip.ip_address}:8888
    5. Visual validation report: /opt/Khaaos_Run/reports/visual_validation_report.json
  EOT
}
