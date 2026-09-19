/* global __ENV */

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";

import { 
  getApiConfig, 
  setupSubgroup, 
  setupProject, 
  createSecurityCommit, 
  createSecurityMR 
} from "../lib/gitlab_api_helpers.js";

import { 
  waitForPipelineInitialization, 
  waitForPipelineCompletion 
} from "../lib/pipeline_helpers.js";

import { 
  validateSecretDetectionJob, 
  validateSemgrepSastJob, 
  validateKicsIacSastJob 
} from "../lib/security_job_validators.js";

import * as testData from "../lib/test_data_helpers.js";

export let successRate = new Rate("successful_requests");

export let options = {
  iterations: 1,
  vus: 1,
  thresholds: {
    successful_requests: ["rate==1.0"],
    http_req_failed: ["rate==0"],
  },
};

export function setup() {
  const { baseUrl, headers, parentId } = getApiConfig(__ENV);

  const groupId = setupSubgroup(parentId, successRate);
  if (!groupId) return { groupId: null, projectId: null, mrIid: null, baseUrl, headers };

  const projectId = setupProject(groupId, successRate);
  if (!projectId) return { groupId, projectId: null, mrIid: null, baseUrl, headers };

  const featureBranch = `test-security-scanning${Date.now()}`;

  const commitSuccess = createSecurityCommit(baseUrl, headers, projectId, featureBranch, testData, successRate);
  if (!commitSuccess) return { groupId, projectId, mrIid: null, baseUrl, headers };

  const mrIid = createSecurityMR(baseUrl, headers, projectId, featureBranch, successRate);
  if (!mrIid) return { groupId, projectId, mrIid: null, baseUrl, headers };

  return { groupId, projectId, mrIid, baseUrl, headers };
}

export default function (data) {
  if (!data.mrIid) {
    console.error("[EXECUTION ABORTED] Missing MR IID from setup");
    successRate.add(false);
    return;
  }

  const { baseUrl, headers, projectId, mrIid } = data;

  const pipelineId = waitForPipelineInitialization(baseUrl, headers, projectId, mrIid);
  if (!pipelineId) {
    console.error(`[EXECUTION ABORTED] Pipeline ID not found for MR #${mrIid}`);
    successRate.add(false);
    return;
  }

  const pipelineFinished = waitForPipelineCompletion(baseUrl, headers, projectId, pipelineId);
  if (!pipelineFinished) {
    console.error(`[EXECUTION ABORTED] Pipeline #${pipelineId} did not finish successfully.`);
    successRate.add(false);
    return;
  }

  const jobsRes = http.get(`${baseUrl}/api/v4/projects/${projectId}/pipelines/${pipelineId}/jobs`, { headers });
  const jobs = jobsRes.status === 200 ? jobsRes.json() : [];

  group("API - Validate Secret Detection Job & Report", function () {
    validateSecretDetectionJob(baseUrl, headers, projectId, jobs, successRate);
  });

  group("API - Validate Semgrep SAST Job & Report", function () {
    validateSemgrepSastJob(baseUrl, headers, projectId, jobs, successRate);
  });

  group("API - Validate KICS IaC SAST Job & Report", function () {
    validateKicsIacSastJob(baseUrl, headers, projectId, jobs, successRate);
  });
}
