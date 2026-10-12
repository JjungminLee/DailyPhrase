variable "aws_region" {
  type = string
  description = "AWS region, supplied through environment or tfvars."
}
variable "owner" {
  type = string
  description = "Resource owner tag."
}
variable "lambda_memory_mb" {
  type    = number
  default = 512
}
variable "lambda_timeout_seconds" {
  type    = number
  default = 25
}
variable "lambda_reserved_concurrency" {
  type    = number
  default = 5
}
variable "api_throttle_rate_limit" {
  type    = number
  default = 5
}
variable "api_throttle_burst_limit" {
  type    = number
  default = 10
}
variable "log_retention_days" {
  type    = number
  default = 14
}
variable "lambda_env" {
  type = map(string)
  default = {
    MAX_FETCH_BYTES = "2097152"
    FETCH_TIMEOUT_MS = "8000"
    MAX_INPUT_CHARS = "120000"
  }
  sensitive = true
}
