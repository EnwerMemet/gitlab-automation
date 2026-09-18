/* global __ENV, __VU, __ITER */
/*
@endpoint: `POST /projects/:id/repository/commits`
@description: Setup stage: Create group and project and issue
@flags: unsafe
@stressed_components: Gitaly, Sidekiq, Postgres
*/

import http from "k6/http";
import { group, fail } from "k6";
import { Rate } from "k6/metrics";
import {
  createProject,
  getProjectDefaultBranch,
} from "../../lib/gpt_scenario_functions.js";

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
  // 1. Validate required environment variables before execution
  if (!__ENV.ACCESS_TOKEN) {
    fail("CRITICAL ERROR: ACCESS_TOKEN environment variable is missing.");
  }
  if (!__ENV.PARENT_GROUP_ID) {
    fail("CRITICAL ERROR: PARENT_GROUP_ID environment variable is missing.");
  }
  if (!__ENV.ENVIRONMENT_URL) {
    fail("CRITICAL ERROR: ENVIRONMENT_URL environment variable is missing.");
  }

  let groupId = __ENV.PARENT_GROUP_ID;
  
  // 2. Create target project and fetch default branch
  let projectId = createProject(groupId);
  if (!projectId) {
    fail(`CRITICAL ERROR: Failed to create project under group ID: ${groupId}`);
  }

  let projectDefaultBranch = getProjectDefaultBranch(projectId);

  return { groupId, projectId, projectDefaultBranch };
}

export default function (data) {
  group("API - Create Commit", function () {
    let action = __ITER === 0 ? "create" : "update";
    
    let res = executeCreateCommit(data.projectId, data.projectDefaultBranch, action);
    
    let success = res.status === 201 || res.status === 200;
    successRate.add(success);

    if (!success) {
      console.error(`Commit creation failed [HTTP ${res.status}]: ${res.body}`);
    }
  });
}

export function executeCreateCommit(projectId, startBranch, action) {
  let baseUrl = __ENV.ENVIRONMENT_URL.replace(/\/$/, "");
  
  let params = {
    headers: {
      "Accept": "application/json",
      "PRIVATE-TOKEN": __ENV.ACCESS_TOKEN,
      "Content-Type": "application/json",
    },
    redirects: 0,
    tags: { endpoint: "commits" },
  };

  // Generate ~10KB mock content body
  let baseContent = `# GitLab Performance Tool\nCommit ${action} action.\n\nThe GitLab Performance Tool (gpt) has been built by the GitLab Quality team to provide performance testing of any GitLab instance.\n\nLorem ipsum dolor sit amet, consectetur adipiscing elit.\n\n`;
  let content = baseContent.repeat(10);

  let body = {
    branch: `test-security-policy-branch-${__VU}`,
    commit_message: `test-security-policy-${action}`,
    actions: [
      {
        action: action,
        file_path: `api-performance/tests/api/testData/leaked_secrets.txt`,
        content: `# Dummy API tokens for Secret Detection scanner validation\nAWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE\nGITHUB_PAT=ghp_000000000000000000000000000000000000\nGITLAB_PAT=glpat-0123456789abcdefghij`,
      },
    ],
  };

  if (action === "create") {
    body["start_branch"] = startBranch;
  }

  if (action === "update") {
    body["actions"].push({
      action: "create",
      file_path: `create/gpt_${__VU}_${__ITER}.md`,
      content: content,
    });
  }

  let endpoint = `${baseUrl}/api/v4/projects/${projectId}/repository/commits`;
  return http.post(endpoint, JSON.stringify(body), params);
}