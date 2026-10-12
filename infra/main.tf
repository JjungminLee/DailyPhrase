data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

resource "aws_iam_role" "lambda" {
  name = "daily-phrase-lambda"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Principal = { Service = "lambda.amazonaws.com" }, Action = "sts:AssumeRole" }] })
}
resource "aws_iam_role_policy" "lambda_logs" {
  name = "daily-phrase-logs"
  role = aws_iam_role.lambda.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Action = ["logs:CreateLogStream", "logs:PutLogEvents"], Resource = "${aws_cloudwatch_log_group.lambda.arn}:*" }] })
}
resource "aws_cloudwatch_log_group" "lambda" {
  name = "/aws/lambda/daily-phrase"
  retention_in_days = var.log_retention_days
}
resource "aws_lambda_function" "api" {
  function_name = "daily-phrase"
  role = aws_iam_role.lambda.arn
  runtime = "nodejs22.x"
  handler = "src/handler.handler"
  filename = "${path.root}/../dist/lambda.zip"
  source_code_hash = filebase64sha256("${path.root}/../dist/lambda.zip")
  memory_size = var.lambda_memory_mb
  timeout = var.lambda_timeout_seconds
  reserved_concurrent_executions = var.lambda_reserved_concurrency
  environment {
    variables = merge(var.lambda_env, { BUILD_VERSION = filebase64sha256("${path.root}/../dist/lambda.zip") })
  }
  depends_on = [aws_iam_role_policy.lambda_logs, aws_cloudwatch_log_group.lambda]
}

resource "aws_api_gateway_rest_api" "api" {
  name = "daily-phrase"
  endpoint_configuration {
    types = ["REGIONAL"]
  }
}
resource "aws_api_gateway_resource" "api_prefix" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "api"
}
resource "aws_api_gateway_resource" "proxy" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.api_prefix.id
  path_part = "{proxy+}"
}
resource "aws_api_gateway_method" "proxy" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.proxy.id
  http_method = "ANY"
  authorization = "NONE"
}
resource "aws_api_gateway_integration" "proxy" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.proxy.id
  http_method = aws_api_gateway_method.proxy.http_method
  integration_http_method = "POST"
  type = "AWS_PROXY"
  uri = aws_lambda_function.api.invoke_arn
}
resource "aws_lambda_permission" "gateway" {
  statement_id = "AllowApiGatewayInvoke"
  action = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal = "apigateway.amazonaws.com"
  source_arn = "${aws_api_gateway_rest_api.api.execution_arn}/*/*/*"
}
resource "aws_api_gateway_deployment" "api" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  triggers = { redeployment = sha1(jsonencode([aws_api_gateway_resource.api_prefix.id, aws_api_gateway_method.proxy.id, aws_api_gateway_integration.proxy.id])) }
  lifecycle { create_before_destroy = true }
  depends_on = [aws_api_gateway_integration.proxy]
}
resource "aws_cloudwatch_log_group" "gateway" {
  name = "API-Gateway-Access-Logs_${aws_api_gateway_rest_api.api.id}/prod"
  retention_in_days = var.log_retention_days
}
resource "aws_iam_role" "gateway_logs" {
  name = "daily-phrase-apigw-logs"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Principal = { Service = "apigateway.amazonaws.com" }, Action = "sts:AssumeRole" }] })
}
resource "aws_iam_role_policy_attachment" "gateway_logs" {
  role = aws_iam_role.gateway_logs.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs"
}
resource "aws_api_gateway_account" "account" {
  cloudwatch_role_arn = aws_iam_role.gateway_logs.arn
}
resource "aws_api_gateway_stage" "prod" {
  deployment_id = aws_api_gateway_deployment.api.id
  rest_api_id = aws_api_gateway_rest_api.api.id
  stage_name = "prod"
  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.gateway.arn
    format = jsonencode({ requestId = "$context.requestId", status = "$context.status", responseLatency = "$context.responseLatency", httpMethod = "$context.httpMethod", resourcePath = "$context.resourcePath" })
  }
  depends_on = [aws_api_gateway_account.account]
}
resource "aws_api_gateway_method_settings" "all" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  stage_name = aws_api_gateway_stage.prod.stage_name
  method_path = "*/*"
  settings {
    throttling_rate_limit = var.api_throttle_rate_limit
    throttling_burst_limit = var.api_throttle_burst_limit
    metrics_enabled = true
  }
}
