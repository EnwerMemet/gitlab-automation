import { check } from "k6";
import { getJobArtifactJson } from "./gitlab_api_helpers.js";

export function validateSecretDetectionJob(baseUrl, headers, projectId, jobs, successRate) {
  const job = jobs.find((j) => j.name === "secret_detection");
  
  const jobValid = check(job, {
    "[Job] secret_detection exists": (j) => j !== undefined,
    "[Job] secret_detection status is success": (j) => j && j.status === "success",
  });

  if (!jobValid) {
    if (successRate) successRate.add(false);
    return false;
  }

  const report = getJobArtifactJson(baseUrl, headers, projectId, job.id, "gl-secret-detection-report.json");
  const vulnCount = report?.vulnerabilities?.length || 0;

  const reportValid = check(report, {
    "[Report] secret_detection report exists and contains vulnerabilities": () => vulnCount > 0,
  });

  console.log(`[Validation] secret_detection validated. Vulns: ${vulnCount}`);
  if (successRate) successRate.add(reportValid);
  return reportValid;
}

export function validateSemgrepSastJob(baseUrl, headers, projectId, jobs, successRate) {
  const job = jobs.find((j) => j.name === "semgrep-sast");

  const jobValid = check(job, {
    "[Job] semgrep-sast exists": (j) => j !== undefined,
    "[Job] semgrep-sast status is success": (j) => j && j.status === "success",
  });

  if (!jobValid) {
    if (successRate) successRate.add(false);
    return false;
  }

  const report = getJobArtifactJson(baseUrl, headers, projectId, job.id, "gl-sast-report.json");
  const vulnCount = report?.vulnerabilities?.length || 0;

  const reportValid = check(report, {
    "[Report] semgrep-sast vulnerabilities present in SAST report": () => vulnCount > 0,
  });

  console.log(`[Validation] semgrep-sast validated. SAST Vulns: ${vulnCount}`);
  if (successRate) successRate.add(reportValid);
  return reportValid;
}

export function validateKicsIacSastJob(baseUrl, headers, projectId, jobs, successRate) {
  const job = jobs.find((j) => j.name === "kics-iac-sast");

  const jobValid = check(job, {
    "[Job] kics-iac-sast exists": (j) => j !== undefined,
    "[Job] kics-iac-sast status is success": (j) => j && j.status === "success",
  });

  if (!jobValid) {
    if (successRate) successRate.add(false);
    return false;
  }

  let report = getJobArtifactJson(baseUrl, headers, projectId, job.id, "gl-sast-report.json");
  if (!report) {
    report = getJobArtifactJson(baseUrl, headers, projectId, job.id, "gl-kics-sast-report.json");
  }

  const vulnCount = report?.vulnerabilities?.length || 0;

  const reportValid = check(report, {
    "[Report] kics-iac-sast vulnerabilities present in SAST report": () => vulnCount > 0,
  });

  console.log(`[Validation] kics-iac-sast validated. SAST Vulns: ${vulnCount}`);
  if (successRate) successRate.add(reportValid);
  return reportValid;
}
