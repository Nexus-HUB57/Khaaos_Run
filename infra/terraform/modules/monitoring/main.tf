# ══════════════════════════════════════════════════════════════
# Khaaos Run — Monitoring Module (CloudWatch + Prometheus)
# Per-region monitoring infrastructure
# ══════════════════════════════════════════════════════════════

# ─── CloudWatch Dashboard ──────────────────────────────────────
resource "aws_cloudwatch_dashboard" "khaaos" {
  dashboard_name = "${local.project}-${var.region_key}"

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          title   = "Active Players"
          region  = var.aws_region
          metrics = [["Khaaos/Server", "ActivePlayers", { stat = "Maximum" }]]
          period  = 60
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          title   = "Server RTT p95"
          region  = var.aws_region
          metrics = [["Khaaos/Network", "RTT_p95", { stat = "p95" }]]
          period  = 60
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6
        properties = {
          title   = "Anti-Cheat Violations"
          region  = var.aws_region
          metrics = [["Khaaos/Security", "Violations", { stat = "Sum" }]]
          period  = 300
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 6
        width  = 12
        height = 6
        properties = {
          title   = "Economy (KRC Flow)"
          region  = var.aws_region
          metrics = [
            ["Khaaos/Economy", "KRC_Circulation", { stat = "Maximum", color = "#2ecc71" }],
            ["Khaaos/Economy", "KRC_Transactions", { stat = "Sum", color = "#e74c3c" }]
          ]
          period = 300
        }
      }
    ]
  })
}

# ─── CloudWatch Alarms ─────────────────────────────────────────
resource "aws_cloudwatch_metric_alarm" "high_rtt" {
  alarm_name          = "${local.project}-${var.region_key}-high-rtt"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "RTT_p95"
  namespace           = "Khaaos/Network"
  period              = 60
  statistic           = "p95"
  threshold           = 150
  alarm_description   = "Server RTT p95 exceeds 150ms"
  alarm_actions       = [var.sns_topic_arn]

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "low_players" {
  alarm_name          = "${local.project}-${var.region_key}-low-players"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 5
  metric_name         = "ActivePlayers"
  namespace           = "Khaaos/Server"
  period              = 300
  statistic           = "Maximum"
  threshold           = 5
  alarm_description   = "Active players below 5 for 25 minutes"
  treat_missing_data  = "breaching"

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "ddos_attack" {
  alarm_name          = "${local.project}-${var.region_key}-ddos"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "ConnectionsPerSecond"
  namespace           = "Khaaos/Security"
  period              = 60
  statistic           = "Sum"
  threshold           = 200
  alarm_description   = "Connection rate exceeds 200/s — possible DDoS"
  alarm_actions       = [var.sns_topic_arn]

  tags = local.common_tags
}

# ─── SNS Topic for Alerts ──────────────────────────────────────
resource "aws_sns_topic" "alerts" {
  name = "${local.project}-${var.region_key}-alerts"

  tags = local.common_tags
}

# ─── Variables ─────────────────────────────────────────────────
variable "region_key" {
  type = string
}

variable "aws_region" {
  type = string
}

variable "sns_topic_arn" {
  type    = string
  default = ""
}

# ─── Outputs ───────────────────────────────────────────────────
output "dashboard_name" {
  value = aws_cloudwatch_dashboard.khaaos.dashboard_name
}

output "sns_topic_arn" {
  value = aws_sns_topic.alerts.arn
}
