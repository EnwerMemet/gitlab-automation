import http from "k6/http";
import { createGroup } from "./gpt_scenario_functions.js";
import { createProject } from "./gpt_custom_helper_functions.js";

export function getApiConfig(env) {
  const envUrl = env.ENVIRONMENT_URL;
  const token = env.ACCESS_TOKEN;

  if (!envUrl || !token) {
    throw new Error("Missing required environment variables: ENVIRONMENT_URL or ACCESS_TOKEN");
  }

  return {
    baseUrl: envUrl.replace(/\/$/, ""),
    headers: {
      "Accept": "application/json",
      "PRIVATE-TOKEN": token,
      "Content-Type": "application/json",
    },
    parentId: env.PARENT_GROUP_ID || "142584572",
  };
}

export function setupSubgroup(parentId, successRate) {
  const subGroupName = `subgroup-security-${Date.now()}`;
  const groupRes = createGroup(subGroupName, parentId);
  const groupId = groupRes?.body ? JSON.parse(groupRes.body).id : null;

  if (!groupId) {
    console.error("Group creation failed in setup");
    if (successRate) successRate.add(false);
    return null;
  }
  return groupId;
}

export function setupProject(groupId, successRate) {
  const projectId = createProject(groupId);
  if (!projectId) {
    console.error("Project creation failed in setup");
    if (successRate) successRate.add(false);
    return null;
  }
  return projectId;
}

export function createSecurityCommit(baseUrl, headers, projectId, featureBranch, testData, successRate) {
  const commitBody = {
    branch: featureBranch,
    start_branch: "main",
    commit_message: "test: add security scanning templates and vulnerability fixtures",
    actions: [
      { action: "create", file_path: ".gitlab-ci.yml", content: testData.getGitLabCiYaml() },
      { action: "create", file_path: "testData/leaked_secrets.txt", content: testData.getLeakedSecretsTxt() },
      { action: "create", file_path: "testData/main.tf", content: testData.getTerraformMainTf() },
      { action: "create", file_path: "testData/app.py", content: testData.getVulnerableAppPy() },
      { action: "create", file_path: ".gitlab/sast-ruleset.toml", content: testData.getSastRulesetToml() },
    ],
  };

  const commitRes = http.post(
    `${baseUrl}/api/v4/projects/${projectId}/repository/commits`,
    JSON.stringify(commitBody),
    { headers }
  );

  if (!/20(0|1)/.test(commitRes.status)) {
    console.error(`Commit setup failed: ${commitRes.status} ${commitRes.body}`);
    if (successRate) successRate.add(false);
    return false;
  }
  return true;
}

export function createSecurityMR(baseUrl, headers, projectId, featureBranch, successRate) {
  const mrBody = {
    source_branch: featureBranch,
    target_branch: "main",
    title: "Test Security Policy Scanners",
    remove_source_branch: true,
  };

  const mrRes = http.post(
    `${baseUrl}/api/v4/projects/${projectId}/merge_requests`,
    JSON.stringify(mrBody),
    { headers }
  );

  if (!/20(0|1)/.test(mrRes.status)) {
    console.error(`MR setup failed: ${mrRes.status} ${mrRes.body}`);
    if (successRate) successRate.add(false);
    return null;
  }

  return JSON.parse(mrRes.body).iid;
}

export function getJobArtifactJson(baseUrl, headers, projectId, jobId, artifactPath) {
  const url = `${baseUrl}/api/v4/projects/${projectId}/jobs/${jobId}/artifacts/${artifactPath}`;
  const res = http.get(url, { headers });

  if (res.status === 200) {
    try {
      return res.json();
    } catch (e) {
      console.error(`[Artifact Parsing Error] Failed to parse JSON from ${artifactPath}: ${e}`);
      return null;
    }
  }

  console.error(`[Artifact Fetch Error] Status ${res.status} when fetching ${artifactPath} for Job ${jobId}`);
  return null;
}
