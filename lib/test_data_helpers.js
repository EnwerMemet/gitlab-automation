/* global __ENV */

export function getGitLabCiYaml() {
  return `stages:
  - test

include:
  - template: Security/Secret-Detection.gitlab-ci.yml
  - template: Jobs/SAST.gitlab-ci.yml
  - template: Jobs/SAST-IaC.gitlab-ci.yml`;
}


//----- Secret Detection -----
export function getLeakedSecretsTxt() {
  return `# Dummy API tokens
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
GITHUB_PAT=ghp_000000000000000000000000000000000000
GITLAB_PAT=glpat-0123456789abcdefghij`;
}
//----- kics-iac-sast -----
export function getTerraformMainTf() {
  return `data "aws_s3_bucket" "acme-s3-access-logging" {
  bucket = var.acme_s3_logging_bucket
}

module "acme_finance_bucket" {
  source = "./modules/acme_bucket"
  bucket_name = "finance-reports"
  cost_centre = "CC001"
  s3_logging_bucket = var.acme_s3_logging_bucket
}

resource "aws_s3_bucket" "bucket-with-encryption-and-logging" {
  bucket = "my-passing-bucket"

  logging {
    target_bucket = data.aws_s3_bucket.acme-s3-access-logging.id
    target_prefix = "my-passing-bucket/logs/"
  }

  server_side_encryption_configuration {
    rule {
      apply_server_side_encryption_by_default {
        sse_algorithm = "AES256"
      }
    }
  }
}

resource "aws_s3_bucket" "bucket-with-encryption" {
  bucket = "my-failing-bucket-no-logging"

  server_side_encryption_configuration {
    rule {
      apply_server_side_encryption_by_default {
        sse_algorithm = "AES256"
      }
    }
  }
}

resource "aws_s3_bucket" "bucket-with-logging" {
  bucket = "my-failing-bucket-no-encryption"

  logging {
    target_bucket = data.aws_s3_bucket.acme-s3-access-logging.id
    target_prefix = "my-failing-bucket-not-encryption/logs/"
  }
}

resource "aws_s3_bucket" "bucket-with-encryption-and-logging-but-public" {
  bucket = "my-public-bucket"
  acl = "public-read"

  logging {
    target_bucket = data.aws_s3_bucket.acme-s3-access-logging.id
    target_prefix = "my-passing-bucket/logs/"
  }

  server_side_encryption_configuration {
    rule {
      apply_server_side_encryption_by_default {
        sse_algorithm = "AES256"
      }
    }
  }
}

resource "aws_s3_bucket" "another-bucket-with-logging" {
  bucket = "my-failing-bucket-no-encryption"

  logging {
    target_bucket = data.aws_s3_bucket.acme-s3-access-logging.id
    target_prefix = "my-failing-bucket-not-encryption/logs/"
  }
}

resource "aws_s3_bucket" "not-another-public-one-please" {
  bucket = "my-public-bucket"
  acl = "public-read"

  logging {
    target_bucket = data.aws_s3_bucket.acme-s3-access-logging.id
    target_prefix = "my-passing-bucket/logs/"
  }

  server_side_encryption_configuration {
    rule {
      apply_server_side_encryption_by_default {
        sse_algorithm = "AES256"
      }
    }
  }

  secrets = <<EOF
  export AWS_ACCESS_KEY_ID=AKIASXANV8VXJI3CYJI3
  EOF
}`;
}



export function getVulnerableAppPy() {
  return `import sqlite3
import subprocess

def run_user_command(user_input):
    # Triggers Semgrep: Command Injection via shell=True
    subprocess.call("ls -la " + user_input, shell=True)

def fetch_user_data(user_id):
    # Triggers Semgrep: SQL Injection via string formatting
    conn = sqlite3.connect("app.db")
    cursor = conn.cursor()
    query = "SELECT * FROM users WHERE id = '%s'" % user_id
    cursor.execute(query)
    return cursor.fetchall()
`;
}
// ----- disable noisy rules -----

export function getSastRulesetToml(ruleId = "gosec.G107-1") {
  return `[semgrep]
  [[semgrep.ruleset]]
    disable = true
    [semgrep.ruleset.identifier]
      type = "semgrep_id"
      value = "${ruleId}"`;
}