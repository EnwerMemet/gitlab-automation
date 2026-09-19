import { check } from "k6";
import { getJobArtifactJson } from "./gitlab_api_helpers.js";

/**
 * Generic validator for any GitLab security job and its JSON report artifact.
 */
export function validateSecurityJob(baseUrl, headers, projectId, jobs, options, successRate) {
  const { jobName, artifactPaths, metricPrefix } = options;

  // 1. Locate job in pipeline
  const job = jobs.find((j) => j.name === jobName);

  // Construct dynamic key strings before passing to check()
  const existsKey = "[Job] " + jobName + " exists";
  const statusKey = "[Job] " + jobName + " status is success";

  const jobChecks = {};
  jobChecks[existsKey] = (j) => j !== undefined;
  jobChecks[statusKey] = (j) => j && j.status === "success";

  const jobValid = check(job, jobChecks);

  if (!jobValid) {
    if (successRate) successRate.add(false);
    return false;
  }

  // 2. Fetch artifact (supports array of fallback paths)
  let report = null;
  const paths = Array.isArray(artifactPaths) ? artifactPaths : [artifactPaths];

  for (let i = 0; i < paths.length; i++) {
    report = getJobArtifactJson(baseUrl, headers, projectId, job.id, paths[i]);
    if (report) break;
  }

  // 3. Validate vulnerability content
  const vulnCount = report?.vulnerabilities?.length || 0;
  const reportKey = "[Report] " + (metricPrefix || jobName) + " report exists and contains vulnerabilities";

  const reportChecks = {};
  reportChecks[reportKey] = () => vulnCount > 0;

  const reportValid = check(report, reportChecks);

  console.log(`[Validation] ${jobName} validated. Vulns: ${vulnCount}`);
  if (successRate) successRate.add(reportValid);
  return reportValid;
}
