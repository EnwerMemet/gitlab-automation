export function getGitLabCiYaml() {
  return `
include:
  - template: Security/Secret-Detection.gitlab-ci.yml
  - template: Security/SAST.gitlab-ci.yml
  - template: Security/SAST-IaC.gitlab-ci.yml
`;
}

export function getLeakedSecretsTxt() {
  return `
# Test file containing mock secrets for detection
AWS_SECRET_KEY="AKIAIOSFODNN7EXAMPLE"
`;
}

export function getTerraformMainTf() {
  return `
resource "aws_s3_bucket" "vulnerable_bucket" {
  bucket = "my-tf-test-bucket"
  acl    = "public-read"
}
`;
}

export function getVulnerableAppPy() {
  return `
import sqlite3

def run_query(user_input):
    conn = sqlite3.connect('example.db')
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE username = '" + user_input + "'")
`;
}

export function getSastRulesetToml() {
  return `
[semgrep]
  [semgrep.ruleset]
    override = true
`;
}
