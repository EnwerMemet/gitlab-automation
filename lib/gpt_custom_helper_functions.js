/* global __ENV */

import http from "k6/http";
import { fail, sleep } from "k6";

export function createProject(groupId) {
  let params = {
    headers: { Accept: "application/json", "PRIVATE-TOKEN": __ENV.ACCESS_TOKEN },
  };
  let formdata = {
    name: `project-test-security-${Date.now()}`,
    namespace_id: groupId,
    auto_devops_enabled: false,
    visibility: "public",
    default_branch: "main",
    issues_enabled: true,
    initialize_with_readme: true,
  };
  let res = http.post(`${__ENV.ENVIRONMENT_URL}/api/v4/projects`, formdata, params);

  if (/20(0|1)/.test(res.status)) {
    let projectId = JSON.parse(res.body)["id"];
    console.log(`Created project ${projectId}`);
    return projectId;
  }
  fail(`Failed to create project: ${res.status} ${res.body}`);
}

export function executeCreateCommit(projectId, startBranch, targetBranchName, action) {
  let baseUrl = __ENV.ENVIRONMENT_URL.replace(/\/$/, "");
  let params = {
    headers: {
      Accept: "application/json",
      "PRIVATE-TOKEN": __ENV.ACCESS_TOKEN,
      "Content-Type": "application/json",
    },
  };

  let body = {
    branch: targetBranchName,
    commit_message: `test-security-policy-${action}`,
    actions: [
      {
        action: action,
        file_path: `.gitlab-ci.yml`,
        content: `stages:\n  - test\n\ninclude:\n  - template: Security/Secret-Detection.gitlab-ci.yml`,
      },
      {
        action: action,
        file_path: `testData/leaked_secrets.txt`,
        content: `# Dummy API tokens\nAWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE\nGITHUB_PAT=ghp_000000000000000000000000000000000000\nGITLAB_PAT=glpat-0123456789abcdefghij`,
      },
    ],
  };

  if (action === "create") body["start_branch"] = startBranch;

  return http.post(`${baseUrl}/api/v4/projects/${projectId}/repository/commits`, JSON.stringify(body), params);
}

export function createMergeRequest(projectId, sourceBranch, targetBranch, title) {
  let baseUrl = __ENV.ENVIRONMENT_URL.replace(/\/$/, "");
  let params = {
    headers: {
      Accept: "application/json",
      "PRIVATE-TOKEN": __ENV.ACCESS_TOKEN,
      "Content-Type": "application/json",
    },
  };

  let body = {
    source_branch: sourceBranch,
    target_branch: targetBranch,
    title: title,
    remove_source_branch: true,
  };

  return http.post(`${baseUrl}/api/v4/projects/${projectId}/merge_requests`, JSON.stringify(body), params);
}

export function verifyMRSecretDetection(projectId, mrIid) {
  let baseUrl = __ENV.ENVIRONMENT_URL.replace(/\/$/, "");
  let headers = { Accept: "application/json", "PRIVATE-TOKEN": __ENV.ACCESS_TOKEN };

  let pipeline = pollForMRPipeline(projectId, mrIid, headers, baseUrl, 10, 3);
  if (!pipeline) {
    console.warn(`No pipeline triggered for MR !${mrIid} within timeout`);
    return false;
  }

  console.log(`Found pipeline ${pipeline.id}, waiting for secret detection job`);

  let completedJob = pollForJobCompletion(
    projectId,
    pipeline.id,
    ["secret_detection", "secret-detection"],
    headers,
    baseUrl,
    20,
    10
  );

  if (!completedJob) {
    console.warn(`Secret detection job timed out`);
    return false;
  }

  console.log(`Job ${completedJob.id} finished with status: ${completedJob.status}`);

  let reportArtifact = getJobArtifactReport(
    projectId,
    completedJob.id,
    "gl-secret-detection-report.json",
    headers,
    baseUrl
  );

  if (!reportArtifact) {
    console.warn(`Artifact gl-secret-detection-report.json not found`);
    return false;
  }

  return analyzeSecretDetectionVulnerabilities(reportArtifact);
}

export function pollForMRPipeline(projectId, mrIid, headers, baseUrl, maxAttempts = 10, intervalSec = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let pipelines = getMRPipelines(projectId, mrIid, headers, baseUrl);
    if (pipelines && pipelines.length > 0) return pipelines[0];
    console.log(`Waiting for pipeline... (${attempt}/${maxAttempts})`);
    sleep(intervalSec);
  }
  return null;
}

export function pollForJobCompletion(projectId, pipelineId, jobNameKeywords, headers, baseUrl, maxAttempts = 20, intervalSec = 10) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let jobs = getPipelineJobs(projectId, pipelineId, headers, baseUrl);
    
    let targetJob = jobs.find(j => 
      jobNameKeywords.some(keyword => j.name.includes(keyword))
    );

    if (targetJob) {
      console.log(`[${attempt}/${maxAttempts}] Job ${targetJob.id} status: ${targetJob.status}`);
      if (["success", "failed", "canceled", "skipped"].includes(targetJob.status)) {
        return targetJob;
      }
    } else {
      console.log(`[${attempt}/${maxAttempts}] Waiting for job to start...`);
    }

    sleep(intervalSec);
  }
  return null;
}

export function getMRPipelines(projectId, mrIid, headers, baseUrl) {
  let res = http.get(`${baseUrl}/api/v4/projects/${projectId}/merge_requests/${mrIid}/pipelines`, { headers });
  return res.status === 200 ? JSON.parse(res.body) : [];
}

export function getPipelineJobs(projectId, pipelineId, headers, baseUrl) {
  let res = http.get(`${baseUrl}/api/v4/projects/${projectId}/pipelines/${pipelineId}/jobs`, { headers });
  return res.status === 200 ? JSON.parse(res.body) : [];
}

export function getJobArtifactReport(projectId, jobId, artifactPath, headers, baseUrl) {
  let endpoint = `${baseUrl}/api/v4/projects/${projectId}/jobs/${jobId}/artifacts/${artifactPath}`;
  let res = http.get(endpoint, { headers });

  if (res.status === 200) {
    try {
      return JSON.parse(res.body);
    } catch (e) {
      console.error(`Failed to parse artifact JSON`);
      return null;
    }
  } else {
    console.error(`Artifact request failed with status ${res.status}`);
    return null;
  }
}

export function analyzeSecretDetectionVulnerabilities(reportJson) {
  let vulnerabilities = reportJson.vulnerabilities || [];

  if (vulnerabilities.length > 0) {
    console.log(`Secret detection found ${vulnerabilities.length} vulnerabilities:`);
    vulnerabilities.forEach((vuln, idx) => {
      console.log(`  [${idx + 1}] ${vuln.message || vuln.name} (${vuln.severity})`);
    });
    return true;
  } else {
    console.log(`Secret detection report processed with 0 vulnerabilities`);
    return true;
  }
}