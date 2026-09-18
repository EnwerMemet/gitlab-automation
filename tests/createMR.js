/* global __ENV */

import http from "k6/http";
import { group, sleep } from "k6";
import { Rate } from "k6/metrics";
import { createGroup, deleteGroup } from "../../lib/gpt_scenario_functions.js";
import { createProject, verifyMRSecretDetection } from "../../lib/gpt_custom_helper_functions.js";
import { 
  getGitLabCiYaml, 
  getLeakedSecretsTxt, 
  getTerraformMainTf, 
  getVulnerableAppPy, 
  getSastRulesetToml 
} from "../../lib/test_data_helpers.js";

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
  let parentId = __ENV.PARENT_GROUP_ID || "142584572";
  let baseUrl = __ENV.ENVIRONMENT_URL.replace(/\/$/, "");
  let headers = {
    Accept: "application/json",
    "PRIVATE-TOKEN": __ENV.ACCESS_TOKEN,
    "Content-Type": "application/json",
  };


  let subGroupName = `subgroup-security-${Date.now()}`;
  let groupRes = createGroup(subGroupName, parentId);
  let groupId = JSON.parse(groupRes.body).id;
  
  if (!groupId) {
    console.error("Group creation failed in setup");
    return { groupId: null, projectId: null, mrIid: null };
  }

  let projectId = createProject(groupId);
  if (!projectId) {
    console.error("Project creation failed in setup");
    return { groupId, projectId: null, mrIid: null };
  }

  let featureBranch = `test-security-${Date.now()}`;

  let commitBody = {
    branch: featureBranch,
    start_branch: "main",
    commit_message: "test: add security scanning templates and vulnerability fixtures",
    actions: [
      {
        action: "create",
        file_path: ".gitlab-ci.yml",
        content: getGitLabCiYaml(),
      },
      {
        action: "create",
        file_path: "testData/leaked_secrets.txt",
        content: getLeakedSecretsTxt(),
      },
      {
        action: "create",
        file_path: "testData/main.tf",
        content: getTerraformMainTf(),
      },
      {
        action: "create",
        file_path: "testData/app.py",
        content: getVulnerableAppPy(),
      },
      {
        action: "create",
        file_path: ".gitlab/sast-ruleset.toml",
        content: getSastRulesetToml(),
      },
    ],
  };

  let commitRes = http.post(
    `${baseUrl}/api/v4/projects/${projectId}/repository/commits`,
    JSON.stringify(commitBody),
    { headers }
  );

  if (!/20(0|1)/.test(commitRes.status)) {
    console.error(`Commit setup failed: ${commitRes.status} ${commitRes.body}`);
    return { groupId, projectId, mrIid: null };
  }

  let mrBody = {
    source_branch: featureBranch,
    target_branch: "main",
    title: "Test Security Policy Scanners",
    remove_source_branch: true,
  };

  let mrRes = http.post(
    `${baseUrl}/api/v4/projects/${projectId}/merge_requests`,
    JSON.stringify(mrBody),
    { headers }
  );

  if (!/20(0|1)/.test(mrRes.status)) {
    console.error(`MR setup failed: ${mrRes.status} ${mrRes.body}`);
    return { groupId, projectId, mrIid: null };
  }

  let mrData = JSON.parse(mrRes.body);
  return { groupId, projectId, mrIid: mrData.iid };
}

export default function (data) {
  if (!data.mrIid) {
    console.error("[EXECUTION ABORTED] Missing MR IID from setup");
    successRate.add(false);
    return;
  }

  group("API - Verify Security Pipeline", function () {
    let result = verifyMRSecretDetection(data.projectId, data.mrIid);
    successRate.add(!!result);
  });
}

export function teardown(data) {
  if (data?.groupId) {
    sleep(1); 
    deleteGroup(data.groupId);
    console.log(`Cleaned up group ${data.groupId}`);
  }
}