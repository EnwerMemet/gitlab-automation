/* global __ENV */
/*
@endpoint: `POST /projects`
@description: Functional test: Creates a new project under the parent group and cleans it up during teardown.
*/

import http from "k6/http";
import { group, sleep } from "k6";
import { Rate } from "k6/metrics";
import { logError } from "../../lib/gpt_k6_modules.js";

export let successRate = new Rate("successful_requests");

export let options = {
  iterations: 1,
  vus: 1,
  thresholds: {
    "successful_requests": ["rate==1.0"],
    "http_req_failed": ["rate==0"]
  }
};

export function setup() {
  let parentId = __ENV.PARENT_GROUP_ID || "142584572";
  return { groupId: parentId };
}

export default function (data) {
  group("API - Create Project", function () {
    let baseUrl = __ENV.ENVIRONMENT_URL || "https://gitlab.com";
    let params = {
      headers: {
        "Accept": "application/json",
        "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}`
      }
    };
    
    let formdata = {
      name: `project-api-v4-${Date.now()}`,
      namespace_id: data.groupId,
      auto_devops_enabled: "false",
      visibility: "public",
      default_branch: "main",
      initialize_with_readme: "true"
    };

    let res = http.post(`${baseUrl}/api/v4/projects`, formdata, params);

    if (/20(0|1)/.test(res.status)) {
      successRate.add(true);
      
      // Store created project ID on execution context for teardown
      let resBody = JSON.parse(res.body);
      data.createdProjectId = resBody.id;
    } else {
      successRate.add(false);
      logError(res);
    }
  });
}

export function teardown(data) {
  if (data?.createdProjectId) {
    sleep(1);
    let baseUrl = __ENV.ENVIRONMENT_URL || "https://gitlab.com";
    let params = {
      headers: {
        "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}`
      }
    };

    let res = http.del(`${baseUrl}/api/v4/projects/${data.createdProjectId}`, null, params);
    if (!/20(0|2)/.test(res.status)) {
      console.error(`[TEARDOWN WARN] Could not delete project ${data.createdProjectId}. Status: ${res.status}`);
    }
  }
}