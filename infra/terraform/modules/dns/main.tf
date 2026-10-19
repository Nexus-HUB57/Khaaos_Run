# ══════════════════════════════════════════════════════════════
# Khaaos Run — DNS & CDN Module (Cloudflare)
# Latency-based routing, WAF, SSL
# ══════════════════════════════════════════════════════════════

# ─── DNS Records (per region) ──────────────────────────────────
resource "cloudflare_record" "api" {
  zone_id = var.cloudflare_zone_id
  name    = "${var.region_key}.khaaos.run"
  type    = "CNAME"
  value   = var.alb_dns_name
  proxied = true

  comment = "Khaaos API - ${var.region_key} region"
}

resource "cloudflare_record" "game" {
  zone_id = var.cloudflare_zone_id
  name    = "game-${var.region_key}.khaaos.run"
  type    = "A"
  value   = var.game_server_ip
  proxied = false  # Game traffic uses UDP, can't proxy

  comment = "UE5 Game Server - ${var.region_key}"
}

resource "cloudflare_record" "prometheus" {
  zone_id = var.cloudflare_zone_id
  name    = "prometheus-${var.region_key}.khaaos.run"
  type    = "CNAME"
  value   = var.alb_dns_name
  proxied = true

  comment = "Prometheus - ${var.region_key}"
}

# ─── Cloudflare WAF Rules ──────────────────────────────────────
resource "cloudflare_ruleset" "khaaos_waf" {
  zone_id = var.cloudflare_zone_id
  name    = "Khaaos WAF - ${var.region_key}"
  kind    = "zone"
  phase   = "http_request_firewall_custom"

  rules {
    action     = "block"
    enabled    = true
    expression = "(http.request.uri.path contains \"/admin\" and not ip.src in {${join(" ", var.admin_ips)}})"

    description = "Block admin access from non-whitelisted IPs"
  }

  rules {
    action     = "block"
    enabled    = true
    expression = "(http.request.method eq \"POST\" and http.request.uri.path eq \"/api/economy/transfer\" and rate.limit.exceeds)"

    description = "Rate limit economy transfer endpoint"
  }
}

# ─── Cloudflare Rate Limiting ──────────────────────────────────
resource "cloudflare_rate_limit" "api" {
  zone_id   = var.cloudflare_zone_id
  name      = "Khaaos API Rate Limit - ${var.region_key}"
  threshold = 100
  period    = 60

  match {
    request {
      url_pattern = "${var.region_key}.khaaos.run/api/*"
      schemes     = ["HTTPS"]
      methods     = ["GET", "POST"]
    }
  }

  action {
    mode    = "block"
    timeout = 600
  }
}

# ─── SSL/TLS Settings ──────────────────────────────────────────
resource "cloudflare_zone_settings_override" "khaaos" {
  zone_id = var.cloudflare_zone_id

  settings {
    tls_1_3              = "on"
    min_tls_version      = "1.2"
    always_use_https     = "on"
    automatic_https_rewrites = "on"
    ssl                  = "strict"

    security_header {
      enabled      = true
      max_age      = 31536000
      include_subdomains = true
      preload      = true
    }
  }
}

# ─── Variables ─────────────────────────────────────────────────
variable "region_key" {
  type = string
}

variable "cloudflare_zone_id" {
  type = string
}

variable "alb_dns_name" {
  type = string
}

variable "game_server_ip" {
  type = string
}

variable "admin_ips" {
  type    = list(string)
  default = []
}

# ─── Outputs ───────────────────────────────────────────────────
output "api_domain" {
  value = "${var.region_key}.khaaos.run"
}

output "game_domain" {
  value = "game-${var.region_key}.khaaos.run"
}
