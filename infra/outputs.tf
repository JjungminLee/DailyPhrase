output "api_url" {
  value = aws_api_gateway_stage.prod.invoke_url
}
output "function_name" {
  value = aws_lambda_function.api.function_name
}
output "log_group_name" {
  value = aws_cloudwatch_log_group.lambda.name
}
output "api_key_id" {
  value       = null
  description = "No API key is created until authentication is decided."
}
